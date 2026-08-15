/* Recurring tasks for Onward */
const RECURRING_RANGE_DAYS = 120;

function getRecurringDateRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 30);
  const end = new Date(today);
  end.setDate(today.getDate() + RECURRING_RANGE_DAYS);
  return { start: dateKey(start), end: dateKey(end) };
}

function recurringMatchesDate(rec, key) {
  if (!rec.startDate) return false;
  if (key < rec.startDate) return false;
  if (rec.endDate && key > rec.endDate) return false;
  if (rec.cycle === 'custom') {
    return (rec.customDates || []).includes(key);
  }
  const d = new Date(key + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const start = new Date(rec.startDate + 'T00:00:00');
  if (isNaN(start.getTime())) return false;
  if (rec.cycle === 'daily') {
    const diff = Math.round((d - start) / (1000 * 60 * 60 * 24));
    return diff >= 0;
  }
  if (rec.cycle === 'weekly') {
    const diff = Math.round((d - start) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff % 7 === 0;
  }
  if (rec.cycle === 'monthly') {
    return d.getDate() === start.getDate() && (d.getFullYear() > start.getFullYear() || (d.getFullYear() === start.getFullYear() && d.getMonth() >= start.getMonth()));
  }
  if (rec.cycle === 'yearly') {
    return d.getMonth() === start.getMonth() && d.getDate() === start.getDate() && d.getFullYear() >= start.getFullYear();
  }
  return false;
}

function findRecurringInstance(recId, instanceDate) {
  for (const [date, list] of Object.entries(appState.data.tasks || {})) {
    for (const t of list) {
      if (t.recurringId === recId && t.recurringInstanceDate === instanceDate) return { task: t, date };
    }
  }
  return null;
}

function hasRecurringTaskOnDate(recId, date) {
  return (appState.data.tasks[date] || []).some(t => t.recurringId === recId);
}

function frequencyLabel(cycle) {
  if (cycle === 'daily') return 'Daily';
  if (cycle === 'weekly') return 'Weekly';
  if (cycle === 'monthly') return 'Monthly';
  if (cycle === 'yearly') return 'Yearly';
  if (cycle === 'custom') return 'Custom';
  return cycle;
}

function createRecurringTaskInstance(rec, instanceDate) {
  const subtasks = (rec.subtasks || []).map(s => ({ id: uuid(), text: s.text, done: false }));
  const task = createTask(rec.title, instanceDate, rec.sop || '', instanceDate, null, null, false, null, null);
  task.recurringId = rec.id;
  task.recurringInstanceDate = instanceDate;
  task.frequency = frequencyLabel(rec.cycle);
  task.subtasks = subtasks;
  return task;
}

function syncRecurringInstances() {
  const recs = appState.data.recurring || [];
  if (!recs.length) return;
  const { start, end } = getRecurringDateRange();
  const startD = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  for (const rec of recs) {
    if (!rec.startDate) continue;
    const recStart = new Date(rec.startDate + 'T00:00:00');
    const rangeStart = recStart > startD ? recStart : startD;
    const rangeEnd = rec.endDate ? new Date(rec.endDate + 'T00:00:00') : endD;
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (!recurringMatchesDate(rec, key)) continue;
      if (findRecurringInstance(rec.id, key)) continue;
      if (hasRecurringTaskOnDate(rec.id, key)) continue;
      if (!appState.data.tasks[key]) appState.data.tasks[key] = [];
      appState.data.tasks[key].push(createRecurringTaskInstance(rec, key));
    }
  }
}

function nextRecurringOccurrence(rec) {
  const today = dateKey(new Date());
  let next = null;
  for (const [date, list] of Object.entries(appState.data.tasks || {})) {
    if (date < today) continue;
    for (const t of list) {
      if (t.recurringId === rec.id) {
        if (!next || date < next) next = date;
      }
    }
  }
  if (!next) {
    const { end } = getRecurringDateRange();
    for (let d = new Date(today + 'T00:00:00'); d <= new Date(end + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (recurringMatchesDate(rec, key) && !hasRecurringTaskOnDate(rec.id, key)) return key;
    }
  }
  return next;
}

function checkRecurringMoveConflict(task, targetDate) {
  if (!task.recurringId || !appState.data.tasks[targetDate]) return false;
  return appState.data.tasks[targetDate].some(t => t.recurringId === task.recurringId && t.id !== task.id);
}

function buildRecurringSubtasksHTML(subtasks = []) {
  if (!subtasks.length) return '';
  return '<div class="task-subtasks">' + subtasks.map(s => `<label class="subtask-item${s.done ? ' done' : ''}"><input type="checkbox" data-sid="${s.id}" ${s.done ? 'checked' : ''}> <span>${escapeHtml(s.text)}</span></label>`).join('') + '</div>';
}

function checkRecurringReminders() {
  if (!window.hiwayAPI || !window.hiwayAPI.showNotification) return;
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  const recs = appState.data.recurring || [];
  recs.forEach(rec => {
    if (rec.reminders?.dayOf && recurringMatchesDate(rec, today)) {
      const todayInstance = (appState.data.tasks[today] || []).find(t => t.recurringId === rec.id);
      if ((!todayInstance || !todayInstance.done) && rec.lastDayOfNotify !== today) {
        rec.lastDayOfNotify = today;
        scheduleSave();
        window.hiwayAPI.showNotification('Recurring task today', `${rec.title} is due today.`);
      }
    }
    if (rec.reminders?.before && recurringMatchesDate(rec, tomorrow)) {
      if (rec.lastBeforeNotify !== tomorrow) {
        rec.lastBeforeNotify = tomorrow;
        scheduleSave();
        window.hiwayAPI.showNotification('Recurring task tomorrow', `${rec.title} is due tomorrow.`);
      }
    }
  });
}

function openRecurringEditor(rec = null) {
  playSound('open');
  const isNew = !rec;
  const editing = rec || { id: uuid(), title: '', sop: '', cycle: 'weekly', startDate: dateKey(new Date()), endDate: '', customDates: [], subtasks: [], reminders: { before: false, dayOf: false }, created: new Date().toISOString() };
  const titleId = 'rec-title';
  let subtasks = (editing.subtasks || []).map(s => ({ id: s.id || uuid(), text: s.text }));
  let customDates = [...(editing.customDates || [])];

  function cycleHtml() {
    const cycles = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
    return '<div class="recurring-cycle-options">' + cycles.map(c => `<label><input type="radio" name="rec-cycle" value="${c}" ${editing.cycle === c ? 'checked' : ''}> ${frequencyLabel(c)}</label>`).join('') + '</div>';
  }

  function customDatesHtml() {
    if (editing.cycle !== 'custom') return '';
    return `
      <div>
        <label>Custom dates</label>
        <div class="recurring-subtask-input" style="margin-top:6px">
          <input type="date" id="rec-custom-date">
          <button type="button" id="rec-add-custom-date">Add</button>
        </div>
        <div class="recurring-dates-list" id="rec-custom-dates-list">${customDates.map(d => `<div class="recurring-chip" data-date="${d}">${formatShortDate(d)} <button type="button" class="rec-remove-date">×</button></div>`).join('')}</div>
      </div>
    `;
  }

  function subtasksHtml() {
    return `
      <div>
        <label>Subtasks (appear on each occurrence)</label>
        <div class="recurring-subtask-input" style="margin-top:6px">
          <input type="text" id="rec-subtask-input" placeholder="Add a subtask...">
          <button type="button" id="rec-add-subtask">Add</button>
        </div>
        <div class="recurring-subtasks-list" id="rec-subtasks-list">${subtasks.map((s, i) => `<div class="recurring-chip" data-idx="${i}">${escapeHtml(s.text)} <button type="button" class="rec-remove-subtask">×</button></div>`).join('')}</div>
      </div>
    `;
  }

  const bodyHTML = `
    <div class="recurring-form">
      <input type="text" id="${titleId}" class="glass-input" placeholder="Recurring task title" value="${escapeHtml(editing.title)}">
      <textarea id="rec-sop" class="glass-input" placeholder="Describe your task or write an SOP for this task...">${escapeHtml(editing.sop || '')}</textarea>
      <div>
        <label>Cycle</label>
        ${cycleHtml()}
      </div>
      <div style="display:flex;gap:12px">
        <div style="flex:1"><label>Start date</label><input type="date" id="rec-start-date" class="glass-input" value="${editing.startDate}"></div>
        <div style="flex:1"><label>End date (optional)</label><input type="date" id="rec-end-date" class="glass-input" value="${editing.endDate || ''}"></div>
      </div>
      <div id="rec-custom-dates-section"></div>
      <div id="rec-subtasks-section"></div>
      <div class="recurring-reminders">
        <label><input type="checkbox" id="rec-remind-before" ${editing.reminders?.before ? 'checked' : ''}> Remind me the day before</label>
        <label><input type="checkbox" id="rec-remind-day" ${editing.reminders?.dayOf ? 'checked' : ''}> Remind me the day of</label>
      </div>
    </div>
  `;

  openModal(isNew ? 'New Recurring Task' : 'Edit Recurring Task', bodyHTML, isNew ? 'Create' : 'Save', () => {}, () => {});
  const card = document.getElementById('modal-card');
  if (card) card.classList.add('wide');
  const overlay = document.getElementById('modal-overlay');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  const cleanup = () => { overlay.classList.remove('active'); if (card) card.classList.remove('wide'); };

  function renderEditor() {
    const customSection = document.getElementById('rec-custom-dates-section');
    if (customSection) customSection.innerHTML = customDatesHtml();
    const subSection = document.getElementById('rec-subtasks-section');
    if (subSection) subSection.innerHTML = subtasksHtml();
    bindEditor();
  }

  function bindEditor() {
    document.querySelectorAll('input[name="rec-cycle"]').forEach(r => {
      r.onchange = () => {
        editing.cycle = r.value;
        renderEditor();
      };
    });
    const addSub = document.getElementById('rec-add-subtask');
    if (addSub) addSub.onclick = () => {
      const input = document.getElementById('rec-subtask-input');
      const text = input.value.trim();
      if (!text) return;
      subtasks.push({ id: uuid(), text });
      input.value = '';
      renderEditor();
    };
    const addDate = document.getElementById('rec-add-custom-date');
    if (addDate) addDate.onclick = () => {
      const input = document.getElementById('rec-custom-date');
      const d = input.value;
      if (!d || customDates.includes(d)) return;
      customDates.push(d);
      customDates.sort();
      input.value = '';
      renderEditor();
    };
    document.querySelectorAll('#rec-subtasks-list .rec-remove-subtask').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        subtasks.splice(i, 1);
        renderEditor();
      });
    });
    document.querySelectorAll('#rec-custom-dates-list .rec-remove-date').forEach(btn => {
      btn.addEventListener('click', () => {
        const chip = btn.closest('.recurring-chip');
        const d = chip && chip.dataset.date;
        if (d) { customDates = customDates.filter(x => x !== d); renderEditor(); }
      });
    });
  }

  function save() {
    const titleInput = document.getElementById(titleId);
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const cycle = document.querySelector('input[name="rec-cycle"]:checked')?.value || 'weekly';
    const startDate = document.getElementById('rec-start-date').value;
    if (!startDate) { document.getElementById('rec-start-date').focus(); return; }
    editing.title = title;
    editing.sop = document.getElementById('rec-sop').value.trim();
    editing.cycle = cycle;
    editing.startDate = startDate;
    editing.endDate = document.getElementById('rec-end-date').value || null;
    editing.customDates = cycle === 'custom' ? [...customDates].sort() : [];
    editing.subtasks = subtasks.map(s => ({ id: s.id || uuid(), text: s.text }));
    editing.reminders = {
      before: document.getElementById('rec-remind-before')?.checked || false,
      dayOf: document.getElementById('rec-remind-day')?.checked || false
    };
    if (isNew) appState.data.recurring.push(editing);
    syncRecurringInstances();
    scheduleSave();
    renderRecurring();
    renderCalendar();
    renderDashboard();
    refreshDashboardDetail();
    cleanup();
    playSound('confirm');
  }

  function deleteRecurring() {
    cleanup();
    openModal('Delete recurring task?', `<p style="color:var(--muted)">All future occurrences of "${escapeHtml(editing.title)}" will be removed. Past occurrences stay in your calendar.</p>`, 'Delete', () => {
      appState.data.recurring = appState.data.recurring.filter(r => r.id !== editing.id);
      Object.keys(appState.data.tasks).forEach(date => {
        appState.data.tasks[date] = appState.data.tasks[date].filter(t => t.recurringId !== editing.id);
        if (!appState.data.tasks[date].length) delete appState.data.tasks[date];
      });
      scheduleSave();
      renderRecurring();
      renderCalendar();
      renderDashboard();
      refreshDashboardDetail();
      playSound('delete');
    }, () => { openRecurringEditor(editing); });
  }

  confirmBtn.onclick = save;
  cancelBtn.onclick = () => { cleanup(); };
  overlay.onclick = e => { if (e.target === overlay) { cleanup(); } };

  document.getElementById(titleId).focus();
  renderEditor();

  if (!isNew) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.marginRight = 'auto';
    deleteBtn.addEventListener('click', deleteRecurring);
    document.querySelector('.modal-actions')?.prepend(deleteBtn);
  }
}

function renderRecurring() {
  const list = document.getElementById('recurring-list');
  if (!list) return;
  list.innerHTML = '';
  const recs = appState.data.recurring || [];
  if (!recs.length) {
    list.innerHTML = '<div class="spreadsheets-empty">No recurring tasks yet. Create one and Onward will place it on your calendar.</div>';
    return;
  }
  recs.forEach(rec => {
    const next = nextRecurringOccurrence(rec);
    const card = document.createElement('div');
    card.className = 'recurring-card glass-card tilt-card';
    card.innerHTML = `
      <h4><span>↻</span> ${escapeHtml(rec.title) || 'Untitled recurring'}</h4>
      <div class="recurring-meta">${frequencyLabel(rec.cycle)}${next ? ' · next ' + formatShortDate(next) : ''}</div>
      <div class="recurring-badges">
        ${(rec.subtasks || []).length ? `<span class="recurring-badge">${rec.subtasks.length} subtask${rec.subtasks.length === 1 ? '' : 's'}</span>` : ''}
        ${rec.reminders?.before ? '<span class="recurring-badge">Day-before reminder</span>' : ''}
        ${rec.reminders?.dayOf ? '<span class="recurring-badge">Day-of reminder</span>' : ''}
      </div>
    `;
    card.addEventListener('click', () => openRecurringEditor(rec));
    list.appendChild(card);
  });
}

function initRecurring() {
  document.getElementById('new-recurring-btn')?.addEventListener('click', () => openRecurringEditor());
  checkRecurringReminders();
  setInterval(checkRecurringReminders, 60000);
}
