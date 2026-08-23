/* Recurring tasks for Onward */
const RECURRING_RANGE_DAYS = 120;
const WEEKDAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const WEEKDAY_TITLES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEKDAY_SHORTS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getRecurringDateRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 30);
  const end = new Date(today);
  end.setDate(today.getDate() + RECURRING_RANGE_DAYS);
  return { start: dateKey(start), end: dateKey(end) };
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function monthlyTargetDay(startDay, year, month) {
  return Math.min(startDay, daysInMonth(year, month));
}

function recurringMatchesDate(rec, key) {
  if (!rec.startDate) return false;
  if (key < rec.startDate) return false;
  if (rec.endDate && key > rec.endDate) return false;
  if (rec.cycle === 'custom') {
    if (rec.customWeekdays && rec.customWeekdays.length) {
      const d = new Date(key + 'T00:00:00');
      return rec.customWeekdays.includes(d.getDay());
    }
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
    return d.getDay() === start.getDay();
  }
  if (rec.cycle === 'monthly') {
    return d.getDate() === monthlyTargetDay(start.getDate(), d.getFullYear(), d.getMonth());
  }
  if (rec.cycle === 'yearly') {
    const target = monthlyTargetDay(start.getDate(), d.getFullYear(), d.getMonth());
    return d.getMonth() === start.getMonth() && d.getDate() === target && d.getFullYear() >= start.getFullYear();
  }
  return false;
}

function findRecurringInstance(recId, instanceDate) {
  const list = appState.data.tasks[instanceDate] || [];
  for (const t of list) {
    if (t.recurringId === recId && t.recurringInstanceDate === instanceDate) return { task: t, date: instanceDate };
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

function recurringMetaText(rec, short = false) {
  if (!rec || !rec.cycle) return '';
  const ord = n => {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };
  const start = rec.startDate ? new Date(rec.startDate + 'T00:00:00') : null;
  const monthName = (d, len = 'short') => d.toLocaleDateString('en-US', { month: len });
  const weekdays = short ? WEEKDAY_SHORTS : WEEKDAY_TITLES;
  if (rec.cycle === 'daily') return 'every day';
  if (rec.cycle === 'weekly' && start) return `every ${weekdays[start.getDay()]}`;
  if (rec.cycle === 'monthly' && start) {
    if (start.getDate() > 28) return `monthly on the ${start.getDate()}${ord(start.getDate())} or last day of month`;
    return `monthly on the ${start.getDate()}${ord(start.getDate())}`;
  }
  if (rec.cycle === 'yearly' && start) return short ? `yearly ${monthName(start)} ${start.getDate()}` : `yearly on ${monthName(start)} ${start.getDate()}`;
  if (rec.cycle === 'custom') {
    if (rec.customWeekdays && rec.customWeekdays.length) {
      const days = [...rec.customWeekdays].sort((a,b) => a - b).map(d => weekdays[d]).join(', ');
      return `every ${days}`;
    }
    if (rec.customDates && rec.customDates.length) return short ? `${rec.customDates.length} dates` : `${rec.customDates.length} selected dates`;
    return 'Custom';
  }
  return frequencyLabel(rec.cycle);
}

function formatRecurringDateShort(date) {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function openRecurringDetails(rec) {
  if (!rec) return;
  const next = nextRecurringOccurrence(rec);
  const days = rec.customWeekdays && rec.customWeekdays.length
    ? [...rec.customWeekdays].sort((a, b) => a - b).map(d => WEEKDAY_TITLES[d]).join(', ')
    : '';
  const reminderParts = [];
  if (rec.reminders?.before) reminderParts.push('the day before');
  if (rec.reminders?.dayOf) reminderParts.push('the day of');
  const bodyHTML = `
    <div class="recurring-details">
      <h4>${escapeHtml(rec.title || 'Untitled recurring')}</h4>
      ${rec.sop ? `<p class="recurring-sop">${escapeHtml(rec.sop)}</p>` : ''}
      <div class="recurring-detail-row"><label>Frequency</label><span>${escapeHtml(recurringMetaText(rec))}</span></div>
      <div class="recurring-detail-row"><label>Start</label><span>${formatRecurringDateShort(rec.startDate)}</span></div>
      ${rec.endDate ? `<div class="recurring-detail-row"><label>End</label><span>${formatRecurringDateShort(rec.endDate)}</span></div>` : ''}
      ${next ? `<div class="recurring-detail-row"><label>Next up</label><span>${formatRecurringDateShort(next)}</span></div>` : ''}
      ${reminderParts.length ? `<div class="recurring-detail-row"><label>Reminders</label><span>${escapeHtml(reminderParts.join(', '))}</span></div>` : ''}
    </div>
  `;
  openModal('Recurring details', bodyHTML, 'Close', () => {}, () => {});
  const actions = document.querySelector('.modal-actions');
  if (actions) {
    const editBtn = document.createElement('button');
    editBtn.className = 'secondary-btn recurring-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.style.marginRight = 'auto';
    editBtn.addEventListener('click', () => { document.getElementById('modal-cancel').click(); openRecurringEditor(rec); });
    actions.prepend(editBtn);
  }
}

function createRecurringTaskInstance(rec, instanceDate) {
  const task = createTask(rec.title, instanceDate, rec.sop || '', instanceDate, null, null, false, null, null);
  task.recurringId = rec.id;
  task.recurringInstanceDate = instanceDate;
  task.frequency = recurringMetaText(rec, true);
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

    // Remove schedule-driven occurrences that no longer fit the updated schedule,
    // but keep manually moved/snoozed instances (recurringInstanceDate !== their current date).
    Object.keys(appState.data.tasks || {}).forEach(date => {
      if (!appState.data.tasks[date]) return;
      appState.data.tasks[date] = appState.data.tasks[date].filter(t => {
        if (t.recurringId !== rec.id) return true;
        if (t.recurringInstanceDate && t.recurringInstanceDate !== date) return true;
        return recurringMatchesDate(rec, date);
      });
      if (!appState.data.tasks[date].length) delete appState.data.tasks[date];
    });

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
  return '<div class="task-subtasks">' + subtasks.map(s => `
    <div class="subtask-item${s.done ? ' done' : ''}" data-sid="${s.id}">
      <span class="subtask-text">${escapeHtml(s.text)}</span>
      <div class="subtask-actions">
        <button type="button" class="action-btn subtask-complete" data-sid="${s.id}" title="${s.done ? 'Undo' : 'Complete'}">${s.done ? '↩' : '✓'}</button>
        <button type="button" class="action-btn subtask-delete" data-sid="${s.id}" title="Delete subtask">×</button>
      </div>
    </div>
  `).join('') + '</div>';
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
  const editing = rec || { id: uuid(), title: '', sop: '', cycle: 'weekly', startDate: dateKey(new Date()), endDate: '', customWeekdays: [], customDates: [], reminders: { before: false, dayOf: false }, created: new Date().toISOString() };
  const titleId = 'rec-title';
  let customWeekdays = [...(editing.customWeekdays || [])];
  if (editing.cycle === 'custom' && editing.customDates && editing.customDates.length && !customWeekdays.length) {
    customWeekdays = [...new Set(editing.customDates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return isNaN(dt.getTime()) ? null : dt.getDay();
    }).filter(v => v !== null))];
  }

  function cycleHtml() {
    const cycles = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
    return '<div class="recurring-cycle-options">' + cycles.map(c => `<label><input type="radio" name="rec-cycle" value="${c}" ${editing.cycle === c ? 'checked' : ''}> ${frequencyLabel(c)}</label>`).join('') + '</div>';
  }

  function customDaysHtml() {
    if (editing.cycle !== 'custom') return '';
    return `
      <div>
        <label>Custom days</label>
        <div class="recurring-weekdays">
          ${[0,1,2,3,4,5,6].map(d => `<button type="button" class="recurring-weekday ${customWeekdays.includes(d) ? 'active' : ''}" data-day="${d}" title="${WEEKDAY_TITLES[d]}">${WEEKDAY_LABELS[d]}</button>`).join('')}
        </div>
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
      <div id="rec-custom-days-section"></div>
      <div class="recurring-reminders">
        <label><input type="checkbox" id="rec-remind-before" ${editing.reminders?.before ? 'checked' : ''}> Remind me the day before</label>
        <label><input type="checkbox" id="rec-remind-day" ${editing.reminders?.dayOf ? 'checked' : ''}> Remind me the day of</label>
      </div>
      <div class="recurring-dates-row">
        <div><label>Start date</label><input type="date" id="rec-start-date" class="glass-input" value="${editing.startDate}"></div>
        <div><label>End date (optional)</label><input type="date" id="rec-end-date" class="glass-input" value="${editing.endDate || ''}"></div>
      </div>
    </div>
  `;

  openModal(isNew ? 'New Recurring Task' : 'Edit Recurring Task', bodyHTML, isNew ? 'Create' : 'Save', () => {}, () => {});
  const card = document.getElementById('modal-card');
  if (card) card.classList.add('wide');
  const overlay = document.getElementById('modal-overlay');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  const cleanup = () => { overlay.classList.remove('active'); if (card) card.classList.remove('wide'); document.querySelectorAll('.recurring-delete-btn').forEach(b => b.remove()); };

  function renderEditor() {
    const customSection = document.getElementById('rec-custom-days-section');
    if (customSection) customSection.innerHTML = customDaysHtml();
    bindEditor();
  }

  function bindEditor() {
    document.querySelectorAll('input[name="rec-cycle"]').forEach(r => {
      r.onchange = () => {
        editing.cycle = r.value;
        renderEditor();
      };
    });
    document.querySelectorAll('.recurring-weekday').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.day, 10);
        if (customWeekdays.includes(d)) customWeekdays = customWeekdays.filter(x => x !== d);
        else customWeekdays.push(d);
        renderEditor();
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
    if (cycle === 'custom' && !customWeekdays.length) { document.querySelector('.recurring-weekday')?.focus(); return; }
    editing.title = title;
    editing.sop = document.getElementById('rec-sop').value.trim();
    editing.cycle = cycle;
    editing.startDate = startDate;
    editing.endDate = document.getElementById('rec-end-date').value || null;
    editing.customWeekdays = cycle === 'custom' ? [...customWeekdays].sort((a,b) => a - b) : [];
    editing.customDates = [];
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

  document.querySelectorAll('.recurring-delete-btn').forEach(b => b.remove());
  if (!isNew) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary-btn recurring-delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.marginRight = 'auto';
    deleteBtn.addEventListener('click', deleteRecurring);
    document.querySelector('.modal-actions')?.prepend(deleteBtn);
  }

  document.getElementById(titleId).focus();
  renderEditor();
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
