/* Onward - app logic */

const appState = {
  user: null,
  users: {},
  data: {
    tasks: {},
    projects: [],
    notes: [],
    postponed: [],
    trash: [],
    spreadsheets: [],
    theme: 'light'
  },
  currentView: 'dashboard',
  calDate: new Date(),
  calMode: 'month',
  selectedDate: dateKey(new Date()),
  selectedBrainstormDay: null,
  selectedBrainstormNoteId: null,
  charts: {},
  deferredMode: 'postponed',
  projectMode: 'active',
  searchQuery: '',
  activeSpreadsheet: null
};

let saveTimeout;
let dashboardDetailType = null;
let dashboardDetailDate = null;
let notesTarget = null;

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    window.hiwayAPI.saveData(appState.data);
  }, 400);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function dateKey(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = date + 'T00:00:00';
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDay(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = date + 'T00:00:00';
  }
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}

function formatShortDate(date) {
  const key = dateKey(date);
  const d = new Date(key + 'T00:00:00');
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function createTask(text, date, notes = '', plantedDate = null, id = null, projectId = null, done = false, completedDate = null, spreadsheetId = null) {
  return {
    text,
    done: !!done,
    notes: notes || '',
    plantedDate: plantedDate || dateKey(date),
    completedDate: completedDate || null,
    id: id || uuid(),
    projectId: projectId || null,
    spreadsheetId: spreadsheetId || null
  };
}

function matchesTask(task, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return task.text.toLowerCase().includes(q) || (task.notes && task.notes.toLowerCase().includes(q));
}

function initTheme() {
  const savedTheme = appState.data.theme || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (typeof Chart !== 'undefined') {
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    Chart.defaults.color = textColor;
  }
}

function initPlatform() {
  const platform = (window.hiwayAPI && window.hiwayAPI.platform) || '';
  if (platform) {
    document.documentElement.classList.add('platform-' + platform);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  appState.data.theme = next;
  scheduleSave();
  if (typeof Chart !== 'undefined') {
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    Chart.defaults.color = textColor;
  }
  updateCharts();
}

/* Auth */
let authMode = 'login';

function initAuth() {
  const toggle = document.getElementById('auth-toggle');
  toggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      authMode = btn.dataset.mode;
      toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('confirm-wrap').style.display = authMode === 'create' ? 'block' : 'none';
      document.getElementById('auth-error').textContent = '';
    });
  });

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm = document.getElementById('auth-confirm').value;
    const users = appState.users;

    if (!username || !password) return;

    if (authMode === 'create') {
      if (password !== confirm) {
        document.getElementById('auth-error').textContent = 'Passwords do not match.';
        return;
      }
      if (users[username]) {
        document.getElementById('auth-error').textContent = 'Username already exists.';
        return;
      }
      users[username] = { password };
      await window.hiwayAPI.saveUsers(users);
      appState.user = username;
    } else {
      if (!users[username] || users[username].password !== password) {
        document.getElementById('auth-error').textContent = 'Invalid username or password.';
        return;
      }
      appState.user = username;
    }

    enterApp();
  });
}

function enterApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('main-screen').classList.add('active');
  document.getElementById('current-user').textContent = '@' + appState.user;
  initMain();
}

function logout() {
  appState.user = null;
  document.getElementById('main-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-confirm').value = '';
}

/* Navigation */
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('logout-btn').addEventListener('click', logout);
}

function switchView(view) {
  appState.currentView = view;
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  document.getElementById('page-title').textContent = view.charAt(0).toUpperCase() + view.slice(1);
  if (view === 'dashboard') renderDashboard();
  if (view === 'calendar') renderCalendar();
  if (view === 'projects') renderProjects();
  if (view === 'notes') renderNotes();
  if (view === 'deferred') renderDeferred();
  if (view === 'reports') renderReports();
  if (view === 'spreadsheets') renderSpreadsheets();
}

/* Dashboard */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getLast8Weeks() {
  const weeks = [];
  const start = getWeekStart(new Date());
  for (let i = 7; i >= 0; i--) {
    const w = new Date(start);
    w.setDate(w.getDate() - i * 7);
    weeks.push(w);
  }
  return weeks;
}

function countTasksDone(weekStart) {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const tasks = appState.data.tasks[dateKey(d)] || [];
    total += tasks.filter(t => t.done).length;
  }
  return total;
}

function countTasksTotal(weekStart) {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    total += (appState.data.tasks[dateKey(d)] || []).length;
  }
  return total;
}

function getAllTasks() {
  const all = [];
  Object.values(appState.data.tasks).forEach(arr => all.push(...arr));
  return all;
}

function getRecentWins(limit = 5) {
  const wins = [];
  Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
    tasks.filter(t => t.done).forEach(t => wins.push({ text: t.text, date }));
  });
  wins.sort((a, b) => new Date(b.date) - new Date(a.date));
  return wins.slice(0, limit);
}

function getUpcomingCount() {
  const today = dateKey(new Date());
  let count = 0;
  Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
    if (date <= today) return;
    count += tasks.filter(t => !t.done).length;
  });
  return count;
}

function autoRollover() {
  const today = dateKey(new Date());
  const moves = [];
  Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
    if (date >= today) return;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (!task.done) moves.push({ from: date, idx: i, task });
    }
  });
  moves.forEach(({ from, idx, task }) => {
    appState.data.tasks[from].splice(idx, 1);
    if (appState.data.tasks[from].length === 0) delete appState.data.tasks[from];
    if (!appState.data.tasks[today]) appState.data.tasks[today] = [];
    appState.data.tasks[today].push(task);
    task.plantedDate = task.plantedDate || from;
    updateProjectStepDate(task, today);
  });
  if (moves.length) scheduleSave();
}

function getRolloverStats() {
  let rolled = 0;
  let total = 0;
  Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
    tasks.forEach(task => {
      total++;
      if (!task.done && task.plantedDate && task.plantedDate !== date) rolled++;
    });
  });
  return { overdue: rolled, rate: total ? Math.round((rolled / total) * 100) : 0 };
}

function getOpenProjectSteps() {
  return appState.data.projects.reduce((sum, p) => sum + p.steps.filter(s => !s.done).length, 0);
}

function getTodayStats() {
  const today = dateKey(new Date());
  const tasks = appState.data.tasks[today] || [];
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  return { today, done, total };
}

function renderDashboard() {
  const { today, done: todayDone, total: todayTotal } = getTodayStats();
  const upcomingCount = getUpcomingCount();
  const { overdue, rate: rolloverRate } = getRolloverStats();
  const projects = appState.data.projects.filter(p => !p.completed).length;
  const openSteps = getOpenProjectSteps();

  document.getElementById('kpi-today-done').textContent = todayDone;
  document.getElementById('kpi-today-total').textContent = todayTotal;
  document.getElementById('kpi-today-sub').textContent = todayTotal - todayDone ? `${todayTotal - todayDone} left today` : 'all done';
  document.getElementById('kpi-upcoming').textContent = upcomingCount;
  document.getElementById('kpi-upcoming-sub').textContent = upcomingCount ? 'Get ahead of your tasks' : 'all caught up';

  const rolloverEl = document.getElementById('kpi-rollover');
  const rolloverLabel = document.getElementById('kpi-rollover-label');
  rolloverEl.textContent = rolloverRate + '%';
  rolloverEl.classList.remove('good', 'warn', 'bad');
  if (overdue === 0) {
    rolloverEl.classList.add('good');
    rolloverLabel.textContent = 'on track';
  } else if (rolloverRate <= 20) {
    rolloverEl.classList.add('warn');
    rolloverLabel.textContent = 'needs attention';
  } else {
    rolloverEl.classList.add('bad');
    rolloverLabel.textContent = 'falling behind';
  }

  const projectsEl = document.getElementById('kpi-projects');
  const projectsSub = document.getElementById('kpi-projects-sub');
  projectsEl.textContent = projects;
  projectsSub.textContent = openSteps ? `${openSteps} steps remaining` : 'all done';

  const winsList = document.getElementById('recent-wins');
  winsList.innerHTML = '';
  const wins = getRecentWins();
  if (wins.length === 0) {
    winsList.innerHTML = '<li style="color:var(--muted)">No completed tasks yet. Start crushing it.</li>';
  } else {
    wins.forEach(w => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(w.text)}</span><span class="win-date">${w.date}</span>`;
      winsList.appendChild(li);
    });
  }

  renderWaypointTracker();
  updateCharts();
}

function initDashboard() {
  document.querySelectorAll('.kpi-tile').forEach(tile => {
    if (tile.dataset.type === 'week') return;
    tile.addEventListener('click', () => openDashboardDetail(tile.dataset.type));
    const addBtn = tile.querySelector('.kpi-add');
    if (addBtn) {
      addBtn.addEventListener('click', e => {
        e.stopPropagation();
        openDashboardDetail(tile.dataset.type);
      });
    }
  });
  document.getElementById('detail-close').addEventListener('click', closeDashboardDetail);
  const detail = document.getElementById('dashboard-detail');
  detail.addEventListener('click', e => { if (e.target === detail) closeDashboardDetail(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && detail.classList.contains('open')) closeDashboardDetail();
  });
}

function openDashboardDetail(type, date = null) {
  dashboardDetailType = type;
  dashboardDetailDate = date;
  renderDashboardDetail(type, date);
  document.getElementById('dashboard-detail').classList.add('open');
}

function closeDashboardDetail() {
  document.getElementById('dashboard-detail').classList.remove('open');
  dashboardDetailType = null;
  dashboardDetailDate = null;
}

function refreshDashboardDetail() {
  if (dashboardDetailType) renderDashboardDetail(dashboardDetailType, dashboardDetailDate);
}

function buildTaskActions(task, date, idx) {
  const notesLabel = task.notes ? 'Edit a note' : 'Add a note';
  if (task.done) {
    return `
      <div class="task-actions completed-actions">
        <span class="completed-badge">Completed</span>
        <button class="notes-btn ${task.notes ? 'has-notes' : ''}" title="Notes">${notesLabel}</button>
        <button class="action-btn undo-btn" title="Undo">↩</button>
      </div>
    `;
  }
  return `
    <div class="task-actions">
      <button class="notes-btn ${task.notes ? 'has-notes' : ''}" title="Notes">${notesLabel}</button>
      <button class="action-btn done-btn" title="Complete">✓</button>
      <button class="action-btn postpone-btn" title="Postpone">↻</button>
      <button class="action-btn delete-btn" title="Delete">×</button>
    </div>
  `;
}

function bindTaskActionButtons(li, task, date, idx) {
  const notesBtn = li.querySelector('.notes-btn');
  if (notesBtn) notesBtn.addEventListener('click', () => openTaskNotes(date, idx));
  if (!task.done) {
    const doneBtn = li.querySelector('.done-btn');
    const postponeBtn = li.querySelector('.postpone-btn');
    const deleteBtn = li.querySelector('.delete-btn');
    if (doneBtn) doneBtn.addEventListener('click', () => completeTaskForDate(date, idx));
    if (postponeBtn) postponeBtn.addEventListener('click', () => openPostponeModalForDate(date, idx));
    if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteModalForDate(date, idx));
  } else {
    const undoBtn = li.querySelector('.undo-btn');
    if (undoBtn) undoBtn.addEventListener('click', () => undoTaskForDate(date, idx));
  }
}

function taskBadge(task) {
  if (task.projectId) return `<button class="task-project-badge task-badge" data-pid="${escapeHtml(task.projectId)}" title="Open project"><span class="badge-dot" aria-hidden="true">●</span><span class="badge-text">Project</span></button>`;
  if (task.spreadsheetId) return `<button class="task-spreadsheet-badge task-badge" data-sid="${escapeHtml(task.spreadsheetId)}" title="Open spreadsheet"><span class="badge-dot" aria-hidden="true">●</span><span class="badge-text">Spreadsheet</span></button>`;
  return '';
}

function buildDetailTaskItem(task, date, idx) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' done' : '') + (task.projectId ? ' project-task' : '') + (task.spreadsheetId ? ' spreadsheet-task' : '');
  const rolled = !task.done && task.plantedDate && task.plantedDate !== date;
  const rolledMeta = rolled ? `<span class="task-rolled-meta">Planted ${formatShortDate(task.plantedDate)} · now ${formatShortDate(date)}</span>` : '';
  li.innerHTML = `
    <span class="task-text">${taskBadge(task)}${escapeHtml(task.text)}${rolledMeta}</span>
    ${buildTaskActions(task, date, idx)}
  `;
  bindTaskActionButtons(li, task, date, idx);
  const badge = li.querySelector('.task-badge');
  if (badge) {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (badge.dataset.pid) openProjectPeek(badge.dataset.pid);
      if (badge.dataset.sid) openSpreadsheet(badge.dataset.sid, true);
    });
  }
  return li;
}

function completeTaskForDate(date, idx) {
  appState.selectedDate = date;
  completeTask(idx);
  refreshDashboardDetail();
}

function undoTaskForDate(date, idx) {
  appState.selectedDate = date;
  undoTask(idx);
  refreshDashboardDetail();
}

function openPostponeModalForDate(date, idx) {
  appState.selectedDate = date;
  openPostponeModal(idx);
}

function openDeleteModalForDate(date, idx) {
  appState.selectedDate = date;
  openDeleteModal(idx);
}

function addDetailTask(date, text) {
  if (!text) return;
  const key = dateKey(date);
  if (!appState.data.tasks[key]) appState.data.tasks[key] = [];
  appState.data.tasks[key].push(createTask(text, key));
  scheduleSave();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
}

function renderDashboardDetail(type, date = null) {
  const titleEl = document.getElementById('detail-title');
  const valueEl = document.getElementById('detail-value');
  const subtitleEl = document.getElementById('detail-subtitle');
  const bodyEl = document.getElementById('detail-body');
  const addEl = document.getElementById('detail-add');
  bodyEl.innerHTML = '';
  addEl.innerHTML = '';
  valueEl.className = 'detail-value';
  subtitleEl.textContent = '';

  const today = dateKey(new Date());

  if (type === 'day') {
    const key = date || today;
    const d = new Date(key + 'T00:00:00');
    const tasks = appState.data.tasks[key] || [];
    const done = tasks.filter(t => t.done).length;
    titleEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    valueEl.textContent = `${done}/${tasks.length}`;
    subtitleEl.textContent = tasks.length ? `${tasks.length - done} left` : 'Nothing scheduled';
    if (!tasks.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No tasks for this day.</div>';
    } else {
      tasks.forEach((task, idx) => bodyEl.appendChild(buildDetailTaskItem(task, key, idx)));
    }
    addEl.innerHTML = `
      <form class="detail-add-form">
        <input type="text" placeholder="Add a task for this day..." required>
        <button type="submit">Add</button>
      </form>
    `;
    const form = addEl.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = form.querySelector('input[type="text"]').value.trim();
      if (text) { addDetailTask(key, text); form.reset(); }
    });
  }

  if (type === 'today') {
    const tasks = appState.data.tasks[today] || [];
    const done = tasks.filter(t => t.done).length;
    const total = tasks.length;
    titleEl.textContent = "Today's Task";
    valueEl.textContent = `${done}/${total}`;
    subtitleEl.textContent = total ? `${total - done} left today` : 'Nothing scheduled';
    if (!tasks.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No tasks for today yet. Add one below.</div>';
    } else {
      tasks.forEach((task, idx) => bodyEl.appendChild(buildDetailTaskItem(task, today, idx)));
    }
    addEl.innerHTML = `
      <form class="detail-add-form">
        <input type="text" placeholder="Add a task for today..." required>
        <button type="submit">Add Today</button>
      </form>
    `;
    const form = addEl.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = form.querySelector('input[type="text"]').value.trim();
      if (text) { addDetailTask(today, text); form.reset(); }
    });
  }

  if (type === 'week') {
    const start = getWeekStart(new Date());
    const weekDone = countTasksDone(start);
    const weekTotal = countTasksTotal(start);
    titleEl.textContent = 'This Week';
    valueEl.textContent = `${weekDone}/${weekTotal}`;
    subtitleEl.textContent = weekTotal ? `${weekTotal - weekDone} left this week` : 'Nothing scheduled';
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    let hasAny = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      const tasks = appState.data.tasks[key] || [];
      if (!tasks.length) continue;
      hasAny = true;
      const group = document.createElement('div');
      group.className = 'detail-date-group';
      group.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + (key === today ? ' • Today' : '');
      bodyEl.appendChild(group);
      tasks.forEach((task, idx) => bodyEl.appendChild(buildDetailTaskItem(task, key, idx)));
    }
    if (!hasAny) bodyEl.innerHTML = '<div class="detail-empty">No tasks scheduled this week. Add one below.</div>';

    const min = dateKey(start);
    const max = dateKey(end);
    addEl.innerHTML = `
      <form class="detail-add-form">
        <input type="text" placeholder="Add a task for this week..." required>
        <input type="date" value="${today}" min="${min}" max="${max}" required>
        <button type="submit">Add</button>
      </form>
    `;
    const form = addEl.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = form.querySelector('input[type="text"]').value.trim();
      const date = form.querySelector('input[type="date"]').value;
      if (text && date) { addDetailTask(date, text); form.reset(); form.querySelector('input[type="date"]').value = today; }
    });
  }

  if (type === 'upcoming') {
    const upcoming = [];
    Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
      if (date <= today) return;
      tasks.forEach((task, idx) => { if (!task.done) upcoming.push({ date, task, idx }); });
    });
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    titleEl.textContent = 'Upcoming Task';
    valueEl.textContent = upcoming.length;
    subtitleEl.textContent = upcoming.length ? 'Get ahead of your tasks' : 'all caught up';
    if (!upcoming.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No upcoming tasks. You are all caught up.</div>';
    } else {
      let lastDate = null;
      upcoming.forEach(({ date, task, idx }) => {
        if (date !== lastDate) {
          const group = document.createElement('div');
          group.className = 'detail-date-group';
          const d = new Date(date + 'T00:00:00');
          group.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          bodyEl.appendChild(group);
          lastDate = date;
        }
        bodyEl.appendChild(buildDetailTaskItem(task, date, idx));
      });
    }
    const min = getNextDay(today);
    addEl.innerHTML = `
      <form class="detail-add-form">
        <input type="text" placeholder="Add an upcoming task..." required>
        <input type="date" value="${min}" min="${min}" required>
        <button type="submit">Add</button>
      </form>
    `;
    const form = addEl.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = form.querySelector('input[type="text"]').value.trim();
      const date = form.querySelector('input[type="date"]').value;
      if (text && date) { addDetailTask(date, text); form.reset(); form.querySelector('input[type="date"]').value = min; }
    });
  }

  if (type === 'rollover') {
    const { overdue, rate } = getRolloverStats();
    titleEl.textContent = 'Rollover Rate';
    valueEl.textContent = rate + '%';
    valueEl.className = 'detail-value' + (overdue === 0 ? ' good' : rate <= 25 ? ' warn' : ' bad');
    subtitleEl.textContent = overdue === 0 ? 'You are on track' : `${overdue} task${overdue === 1 ? '' : 's'} rolled over`;
    const rolledTasks = [];
    Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
      tasks.forEach((task, idx) => { if (!task.done && task.plantedDate && task.plantedDate !== date) rolledTasks.push({ date, task, idx }); });
    });
    rolledTasks.sort((a, b) => a.date.localeCompare(b.date));
    if (!rolledTasks.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No rolled-over tasks. You are on track.</div>';
    } else {
      const encourage = document.createElement('div');
      encourage.className = 'detail-encourage';
      encourage.textContent = `You have ${overdue} overdue rolled task${overdue === 1 ? '' : 's'}. Target these first to improve your rollover rating.`;
      bodyEl.appendChild(encourage);
      let lastDate = null;
      rolledTasks.forEach(({ date, task, idx }) => {
        if (date !== lastDate) {
          const group = document.createElement('div');
          group.className = 'detail-date-group';
          const d = new Date(date + 'T00:00:00');
          group.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          bodyEl.appendChild(group);
          lastDate = date;
        }
        bodyEl.appendChild(buildDetailTaskItem(task, date, idx));
      });
    }
  }

  if (type === 'projects') {
    titleEl.textContent = 'Projects';
    const active = appState.data.projects.filter(p => !p.completed);
    const completed = appState.data.projects.filter(p => p.completed);
    valueEl.textContent = active.length;
    subtitleEl.textContent = appState.data.projects.length ? (active.length ? `${active.length} active` : 'all done') : 'start something big';
    if (!active.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No active projects. Completed projects live on the Projects tab.</div>';
    } else {
      active.forEach(project => bodyEl.appendChild(buildProjectCard(project, 'detail-project glass-card')));
    }
    addEl.innerHTML = `
      <form class="detail-add-form">
        <input type="text" placeholder="New project or big idea..." required>
        <button type="submit">Create Project</button>
      </form>
    `;
    const form = addEl.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input[type="text"]');
      const title = input.value.trim();
      if (!title) return;
      appState.data.projects.push({ id: uuid(), title, steps: [], created: new Date().toISOString(), completed: false });
      scheduleSave();
      renderDashboard();
      refreshDashboardDetail();
      input.value = '';
    });
  }
}

function getWeekDayStats() {
  const start = getWeekStart(new Date());
  const days = [];
  const today = dateKey(new Date());
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const tasks = appState.data.tasks[key] || [];
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    days.push({ key, total, done, dayName: d.toLocaleDateString('en-US', { weekday: 'short' }), dayDate: d.getDate(), isToday: key === today });
  }
  return days;
}

function renderWaypointTracker() {
  const container = document.getElementById('waypoint-graph');
  const days = getWeekDayStats();
  const weekTotal = days.reduce((s, d) => s + d.total, 0);
  const weekDone = days.reduce((s, d) => s + d.done, 0);
  const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const ringRadius = 48;
  const ringCirc = 2 * Math.PI * ringRadius;
  const offset = ringCirc * (1 - pct / 100);

  const width = 600;
  const height = 130;
  const padX = 36;
  const padY = 44;
  const usableW = width - padX * 2;
  const points = days.map((d, i) => {
    const x = padX + (usableW * i) / (days.length - 1);
    const amplitude = 18;
    const y = padY + Math.sin((i / (days.length - 1)) * Math.PI) * amplitude;
    return { x, y, ...d };
  });

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (curr.x - prev.x) / 2;
    const cp2y = curr.y;
    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }

  const nodes = points.map((p, i) => {
    const isDone = p.total > 0 && p.done === p.total;
    const isPartial = p.done > 0 && p.done < p.total;
    const classes = ['waypoint-node'];
    if (isDone) classes.push('done');
    if (p.isToday) classes.push('today');
    const radius = p.isToday ? 10 : 8;
    const core = isDone || isPartial ? `<circle cx="${p.x}" cy="${p.y}" r="3" class="waypoint-node core" />` : '';
    const dayPct = p.total ? `<text x="${p.x}" y="${p.y + 22}" class="waypoint-day-pct">${p.done}/${p.total}</text>` : '';
    const dayDate = `<text x="${p.x}" y="${p.y + 48}" class="waypoint-date">${p.dayDate}</text>`;
    return `
      <g class="waypoint-group" data-date="${p.key}" style="cursor:pointer">
        <circle cx="${p.x}" cy="${p.y}" r="${radius}" class="${classes.join(' ')}" />
        ${core}
        <text x="${p.x}" y="${p.y + 34}" class="waypoint-label">${p.dayName}</text>
        ${dayDate}
        ${dayPct}
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg class="waypoint-ring" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="${ringRadius}" fill="none" stroke="rgba(148,153,179,0.12)" stroke-width="10" />
      <circle cx="60" cy="60" r="${ringRadius}" fill="none" stroke="url(#ringGradient)" stroke-width="10"
        stroke-dasharray="${ringCirc}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 60 60)" />
      <text x="60" y="60">${pct}%</text>
      <text x="60" y="82" class="waypoint-ring-label">Weekly</text>
    </svg>
    <div class="waypoint-path">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="waypointGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#22d3ee" />
            <stop offset="100%" stop-color="#a855f7" />
          </linearGradient>
        </defs>
        <path class="waypoint-track" d="${pathD}" />
        <path class="waypoint-line" d="${pathD}" />
        ${nodes}
      </svg>
    </div>
  `;

  container.querySelectorAll('.waypoint-group').forEach(g => {
    g.addEventListener('click', () => {
      const key = g.dataset.date;
      appState.selectedDate = key;
      openDashboardDetail('day', key);
    });
    g.addEventListener('mouseenter', () => g.classList.add('hover'));
    g.addEventListener('mouseleave', () => g.classList.remove('hover'));
  });
}

function updateCharts() {
  if (!appState.charts.activity) {
    appState.charts.activity = new Chart(document.getElementById('activity-chart').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: getChartOptions()
    });
  } else {
    Object.assign(appState.charts.activity.options, getChartOptions());
  }
  if (!appState.charts.distribution) {
    appState.charts.distribution = new Chart(document.getElementById('distribution-chart').getContext('2d'), {
      type: 'doughnut',
      data: { labels: [], datasets: [] },
      options: getChartOptions(false)
    });
  } else {
    Object.assign(appState.charts.distribution.options, getChartOptions(false));
  }
  if (!appState.charts.velocity) {
    appState.charts.velocity = new Chart(document.getElementById('velocity-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: getChartOptions()
    });
  } else {
    Object.assign(appState.charts.velocity.options, getChartOptions());
  }

  const allTasks = getAllTasks();
  const done = allTasks.filter(t => t.done).length;
  const total = allTasks.length;

  const weeks = getLast8Weeks();
  const labels = weeks.map(w => {
    const d = new Date(w);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const completed = weeks.map(w => countTasksDone(w));
  const totals = weeks.map(w => countTasksTotal(w));

  appState.charts.activity.data = {
    labels,
    datasets: [{
      label: 'Completed Tasks',
      data: completed,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.2)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 8
    }]
  };
  appState.charts.activity.update();

  appState.charts.distribution.data = {
    labels: ['Done', 'Open'],
    datasets: [{
      data: [done, total - done],
      backgroundColor: ['#22c55e', '#a855f7'],
      borderWidth: 0
    }]
  };
  appState.charts.distribution.update();

  appState.charts.velocity.data = {
    labels,
    datasets: [
      { label: 'Total', data: totals, backgroundColor: 'rgba(168,85,247,0.6)', borderRadius: 6 },
      { label: 'Done', data: completed, backgroundColor: 'rgba(34,197,94,0.8)', borderRadius: 6 }
    ]
  };
  appState.charts.velocity.update();
}

function getChartOptions(showScales = true) {
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: textColor } },
      tooltip: {
        backgroundColor: 'rgba(10,10,20,0.85)',
        padding: 12,
        cornerRadius: 10,
        titleFont: { size: 13 },
        bodyFont: { size: 13 },
        titleColor: '#e8eaf6',
        bodyColor: '#e8eaf6'
      }
    },
    scales: showScales ? {
      x: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor, maxRotation: 0 } },
      y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor, beginAtZero: true, precision: 0 }, min: 0 }
    } : {}
  };
}

/* Calendar */
function initCalendar() {
  const modeButtons = document.getElementById('cal-mode').querySelectorAll('button');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      appState.calMode = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCalendar();
    });
  });
  modeButtons[0].classList.add('active');

  document.getElementById('cal-prev').addEventListener('click', () => navigateCalendar(-1));
  document.getElementById('cal-next').addEventListener('click', () => navigateCalendar(1));

  document.getElementById('add-task-btn').addEventListener('click', addTaskForSelectedDate);
  document.getElementById('new-task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTaskForSelectedDate();
  });
  document.getElementById('share-day-btn').addEventListener('click', shareDay);

  const searchInput = document.getElementById('cal-search');
  searchInput.addEventListener('input', e => {
    appState.searchQuery = e.target.value.trim();
    renderCalendar();
    renderTaskPanel();
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      appState.searchQuery = '';
      renderCalendar();
      renderTaskPanel();
    }
  });
}

function navigateCalendar(dir) {
  const d = appState.calDate;
  if (appState.calMode === 'month') d.setMonth(d.getMonth() + dir);
  else if (appState.calMode === 'week') d.setDate(d.getDate() + dir * 7);
  else if (appState.calMode === 'day') d.setDate(d.getDate() + dir);
  renderCalendar();
}

function renderCalendar() {
  const body = document.getElementById('calendar-body');
  body.innerHTML = '';
  body.style.gridTemplateColumns = 'repeat(7, 1fr)';
  const query = appState.searchQuery;

  if (appState.calMode === 'month') renderMonth(body, query);
  else if (appState.calMode === 'week') renderWeek(body, query);
  else renderDay(body, query);

  document.getElementById('cal-label').textContent = formatCalendarLabel();
  renderTaskPanel();
}

function formatCalendarLabel() {
  const d = appState.calDate;
  if (appState.calMode === 'day') return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderMonth(body, query = '') {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach(day => {
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.textContent = day;
    body.appendChild(h);
  });

  const year = appState.calDate.getFullYear();
  const month = appState.calDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevTotal = new Date(year, month, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    body.appendChild(createDayCell(new Date(year, month - 1, prevTotal - i), true, false, false, query));
  }
  for (let i = 1; i <= totalDays; i++) {
    body.appendChild(createDayCell(new Date(year, month, i), false, false, false, query));
  }
  const remaining = (7 - ((firstDay + totalDays) % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    body.appendChild(createDayCell(new Date(year, month + 1, i), true, false, false, query));
  }
}

function renderWeek(body, query = '') {
  const start = getWeekStart(appState.calDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    body.appendChild(createDayCell(d, false, true, false, query));
  }
}

function renderDay(body, query = '') {
  body.style.gridTemplateColumns = '1fr';
  body.appendChild(createDayCell(appState.calDate, false, true, true, query));
}

function createDayCell(date, otherMonth, isWeek = false, isDay = false, query = '') {
  const key = dateKey(date);
  const todayKey = dateKey(new Date());
  const tasks = appState.data.tasks[key] || [];
  const hasMatch = query && tasks.some(t => matchesTask(t, query));

  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (otherMonth) cell.classList.add('other-month');
  if (key === todayKey) cell.classList.add('today');
  if (key === appState.selectedDate) cell.classList.add('selected');
  if (hasMatch) cell.classList.add('search-match');
  if (query && !hasMatch) cell.classList.add('search-dim');
  if (isDay) cell.style.aspectRatio = 'auto';

  const num = document.createElement('span');
  num.className = 'day-number';
  num.textContent = date.getDate();
  cell.appendChild(num);

  const dots = document.createElement('div');
  dots.className = 'day-dots';
  tasks.slice(0, 5).forEach(t => {
    const dot = document.createElement('span');
    dot.className = 'day-dot ' + (t.done ? 'done' : '');
    dots.appendChild(dot);
  });
  if (tasks.length > 5) {
    const more = document.createElement('span');
    more.style.cssText = 'font-size:9px;color:var(--muted);';
    more.textContent = '+' + (tasks.length - 5);
    dots.appendChild(more);
  }
  cell.appendChild(dots);

  if (isWeek || isDay) {
    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.7rem;color:var(--muted);margin-top:6px;';
    label.textContent = date.toLocaleDateString('en-US', { weekday: 'short' });
    cell.appendChild(label);
  }

  cell.addEventListener('click', () => {
    appState.selectedDate = key;
    appState.searchQuery = '';
    const searchInput = document.getElementById('cal-search');
    if (searchInput) searchInput.value = '';
    renderCalendar();
  });

  return cell;
}

function renderTaskPanel() {
  const label = document.getElementById('selected-date-label');
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  const query = appState.searchQuery;

  if (query) {
    label.textContent = 'Search results';
    const matches = [];
    Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
      tasks.forEach((task, idx) => {
        if (matchesTask(task, query)) matches.push({ date, task, idx });
      });
    });
    matches.sort((a, b) => a.date.localeCompare(b.date));
    if (matches.length === 0) {
      list.innerHTML = '<li class="task-empty" style="color:var(--muted)">No matching tasks.</li>';
      return;
    }
    let lastDate = null;
    matches.forEach(({ date, task, idx }) => {
      if (date !== lastDate) {
        const group = document.createElement('li');
        group.className = 'task-date-group';
        const d = new Date(date + 'T00:00:00');
        group.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        list.appendChild(group);
        lastDate = date;
      }
      list.appendChild(buildDetailTaskItem(task, date, idx));
    });
    return;
  }

  label.textContent = 'Tasks for ' + appState.selectedDate;
  const tasks = appState.data.tasks[appState.selectedDate] || [];
  if (tasks.length === 0) {
    list.innerHTML = '<li class="task-empty" style="color:var(--muted)">No tasks for this date. Add one above.</li>';
    return;
  }
  tasks.forEach((task, idx) => list.appendChild(buildDetailTaskItem(task, appState.selectedDate, idx)));
}

function addTaskForSelectedDate() {
  const input = document.getElementById('new-task-input');
  const text = input.value.trim();
  if (!text) return;
  if (!appState.data.tasks[appState.selectedDate]) appState.data.tasks[appState.selectedDate] = [];
  appState.data.tasks[appState.selectedDate].push(createTask(text, appState.selectedDate));
  input.value = '';
  scheduleSave();
  renderCalendar();
  renderTaskPanel();
}

function completeTask(idx) {
  const tasks = appState.data.tasks[appState.selectedDate];
  if (!tasks || !tasks[idx]) return;
  const task = tasks[idx];
  if (task.done) return;
  task.done = true;
  task.completedDate = dateKey(new Date());
  if (task.projectId) syncStepDone(task);
  tasks.splice(idx, 1);
  tasks.push(task);
  scheduleSave();
  renderCalendar();
  renderDashboard();
  renderProjects();
  refreshDashboardDetail();
  refreshPeek();
  openTaskNotes(appState.selectedDate, tasks.length - 1, true);
}

function undoTask(idx) {
  const tasks = appState.data.tasks[appState.selectedDate];
  if (!tasks || !tasks[idx]) return;
  const task = tasks[idx];
  if (!task.done) return;
  task.done = false;
  task.completedDate = null;
  if (task.projectId) syncStepDone(task);
  tasks.splice(idx, 1);
  tasks.unshift(task);
  scheduleSave();
  renderCalendar();
  renderDashboard();
  renderProjects();
  refreshDashboardDetail();
  refreshPeek();
}

function findTaskByIdWithDate(id) {
  for (const [date, tasks] of Object.entries(appState.data.tasks)) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) return { task: tasks[idx], date, idx };
  }
  return null;
}

function findProjectStep(task) {
  if (!task || !task.projectId) return null;
  const project = appState.data.projects.find(p => p.id === task.projectId);
  if (!project) return null;
  const step = project.steps.find(s => s.id === task.id);
  return step ? { project, step } : null;
}

function syncStepDone(task) {
  const found = findProjectStep(task);
  if (found) found.step.done = task.done;
}

function removeProjectStep(task) {
  const found = findProjectStep(task);
  if (found) found.project.steps = found.project.steps.filter(s => s.id !== task.id);
}

function updateProjectStepDate(task, date) {
  const found = findProjectStep(task);
  if (found) found.step.date = dateKey(date);
}

function extractTask(idx) {
  const tasks = appState.data.tasks[appState.selectedDate];
  const task = tasks[idx];
  tasks.splice(idx, 1);
  if (tasks.length === 0) delete appState.data.tasks[appState.selectedDate];
  return task;
}

function removeTaskAt(idx) {
  const task = extractTask(idx);
  removeProjectStep(task);
  scheduleSave();
  return task;
}

/* Modals */
function openModal(title, bodyHTML, confirmText = 'Confirm', onConfirm, onCancel) {
  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-card');
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = bodyHTML;
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  confirmBtn.textContent = confirmText;
  confirmBtn.style.display = '';

  const cleanup = () => {
    overlay.classList.remove('active');
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    overlay.onclick = null;
  };

  confirmBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = () => { cleanup(); if (onCancel) onCancel(); };
  overlay.onclick = e => { if (e.target === overlay) { cleanup(); if (onCancel) onCancel(); } };

  overlay.classList.add('active');
  card.classList.add('tilt-card');
}

function openDeleteModal(idx) {
  const task = appState.data.tasks[appState.selectedDate][idx];
  openModal(
    'Move to trash?',
    `<p style="color:var(--muted)">"${escapeHtml(task.text)}" will be moved to the trash bin. You can revive it later.</p>`,
    'Move to Trash',
    () => {
      const removed = removeTaskAt(idx);
      appState.data.trash.push({ id: uuid(), taskId: removed.id, text: removed.text, notes: removed.notes || '', plantedDate: removed.plantedDate || appState.selectedDate, completedDate: removed.completedDate || null, fromDate: appState.selectedDate, projectId: removed.projectId || null, spreadsheetId: removed.spreadsheetId || null, moved: new Date().toISOString() });
      scheduleSave();
      renderCalendar();
      renderDashboard();
      renderProjects();
      if (appState.currentView === 'deferred') renderDeferred();
      refreshDashboardDetail();
      refreshPeek();
    }
  );
}

function openPostponeModal(idx) {
  const task = appState.data.tasks[appState.selectedDate][idx];
  const tomorrow = getNextDay(appState.selectedDate);
  const bodyHTML = `
    <div class="modal-option" id="opt-tomorrow">
      <span>⏰</span><span>Snooze to tomorrow <strong>(${tomorrow})</strong></span>
    </div>
    <label class="modal-option" style="cursor:default">
      <span>📅</span><span>Reschedule to date:</span>
      <input type="date" id="postpone-date" value="${tomorrow}">
    </label>
    <div class="modal-option" id="opt-later">
      <span>🗂</span><span>Save to Postponed list (revive later)</span>
    </div>
  `;

  openModal('Postpone task', bodyHTML, 'Choose', () => {}, () => {});

  const overlay = document.getElementById('modal-overlay');
  const confirmBtn = document.getElementById('modal-confirm');
  const cleanup = () => { overlay.classList.remove('active'); };

  confirmBtn.onclick = null;
  confirmBtn.style.display = 'none';

  const closeAndMove = (targetDate, mode) => {
    cleanup();
    const removed = extractTask(idx);
    const planted = removed.plantedDate || appState.selectedDate;
    if (mode === 'postponed') {
      appState.data.postponed.push({
        id: uuid(),
        taskId: removed.id,
        text: removed.text,
        notes: removed.notes || '',
        plantedDate: planted,
        fromDate: appState.selectedDate,
        targetDate,
        projectId: removed.projectId || null,
        spreadsheetId: removed.spreadsheetId || null,
        moved: new Date().toISOString()
      });
    } else {
      if (!appState.data.tasks[targetDate]) appState.data.tasks[targetDate] = [];
      const movedTask = createTask(removed.text, targetDate, removed.notes || '', planted, removed.id, removed.projectId || null, removed.done, removed.completedDate, removed.spreadsheetId || null);
      appState.data.tasks[targetDate].push(movedTask);
      updateProjectStepDate(movedTask, targetDate);
    }
    scheduleSave();
    renderCalendar();
    renderDashboard();
    renderProjects();
    if (appState.currentView === 'deferred') renderDeferred();
    refreshDashboardDetail();
    refreshPeek();
  };

  document.getElementById('opt-tomorrow').addEventListener('click', () => closeAndMove(tomorrow, 'date'));
  document.getElementById('opt-later').addEventListener('click', () => closeAndMove(null, 'postponed'));
  document.getElementById('postpone-date').addEventListener('change', e => {
    if (e.target.value) closeAndMove(e.target.value, 'date');
  });

  // If modal is closed without action, default to tomorrow
  const cancelBtn = document.getElementById('modal-cancel');
  cancelBtn.onclick = () => { cleanup(); closeAndMove(tomorrow, 'date'); };
  overlay.onclick = e => { if (e.target === overlay) { cleanup(); closeAndMove(tomorrow, 'date'); } };
}

/* Deferred */
function initDeferred() {
  const modeButtons = document.getElementById('deferred-mode').querySelectorAll('button');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      appState.deferredMode = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDeferred();
    });
  });

  document.getElementById('clear-deferred-btn').addEventListener('click', () => {
    if (appState.deferredMode === 'postponed') appState.data.postponed = [];
    else appState.data.trash = [];
    scheduleSave();
    renderDeferred();
    renderDashboard();
  });
}

function renderDeferred() {
  const list = document.getElementById('deferred-list');
  list.innerHTML = '';
  const items = appState.deferredMode === 'postponed' ? appState.data.postponed : appState.data.trash;
  const clearBtn = document.getElementById('clear-deferred-btn');
  clearBtn.textContent = appState.deferredMode === 'postponed' ? 'Clear Postponed' : 'Empty Trash';

  if (items.length === 0) {
    list.innerHTML = `<div class="deferred-item glass-card"><p style="color:var(--muted)">Nothing here yet.</p></div>`;
    return;
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'deferred-item glass-card tilt-card';
    const meta = item.fromDate ? `From ${item.fromDate}` : 'Saved';
    const target = item.targetDate ? ` · Target ${item.targetDate}` : '';
    card.innerHTML = `
      <p>${escapeHtml(item.text)}</p>
      <div class="meta">${meta}${target}</div>
      <div class="deferred-item-actions">
        <button class="restore-today">Restore to today</button>
        <button class="restore-date">Restore to date</button>
        ${appState.deferredMode === 'trash' ? '<button class="delete-forever">Delete forever</button>' : ''}
      </div>
    `;

    card.querySelector('.restore-today').addEventListener('click', () => restoreDeferredItem(idx, dateKey(new Date())));
    card.querySelector('.restore-date').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'date';
      input.value = dateKey(new Date());
      input.addEventListener('change', e => {
        if (e.target.value) restoreDeferredItem(idx, e.target.value);
      });
      input.showPicker ? input.showPicker() : input.click();
    });
    const delBtn = card.querySelector('.delete-forever');
    if (delBtn) delBtn.addEventListener('click', () => deleteDeferredItemForever(idx));

    list.appendChild(card);
  });
}

function addProjectStepToProject(projectId, text, date, stepId, done = false) {
  const project = appState.data.projects.find(p => p.id === projectId);
  if (!project) return;
  if (!project.steps.find(s => s.id === stepId)) {
    project.steps.push({ id: stepId, text, date: dateKey(date), done: !!done });
  }
}

function restoreDeferredItem(idx, targetDate) {
  const items = appState.deferredMode === 'postponed' ? appState.data.postponed : appState.data.trash;
  const item = items[idx];
  const key = dateKey(targetDate);
  if (!appState.data.tasks[key]) appState.data.tasks[key] = [];
  const planted = item.plantedDate || key;
  const restored = createTask(item.text, key, item.notes || '', planted, item.taskId || null, item.projectId || null, !!item.completedDate, item.completedDate || null, item.spreadsheetId || null);
  appState.data.tasks[key].push(restored);
  if (item.projectId) addProjectStepToProject(item.projectId, item.text, key, item.taskId || restored.id, restored.done);
  items.splice(idx, 1);
  scheduleSave();
  renderDeferred();
  renderCalendar();
  renderDashboard();
  renderProjects();
}

function deleteDeferredItemForever(idx) {
  appState.data.trash.splice(idx, 1);
  scheduleSave();
  renderDeferred();
  renderDashboard();
}

/* Projects */
function initProjects() {
  document.getElementById('add-project-btn').addEventListener('click', addProject);
  document.getElementById('new-project-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addProject();
  });
  document.getElementById('projects-mode').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.projectMode = btn.dataset.mode;
      document.getElementById('projects-mode').querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderProjects();
    });
  });
}

function addProject() {
  const input = document.getElementById('new-project-input');
  const title = input.value.trim();
  if (!title) return;
  appState.data.projects.push({ id: uuid(), title, steps: [], created: new Date().toISOString(), completed: false });
  input.value = '';
  scheduleSave();
  renderProjects();
  renderDashboard();
  refreshDashboardDetail();
}

function deleteProject(pid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  if (!confirm(`Delete "${project.title}"? This will also delete all associated tasks and spreadsheets. This cannot be undone.`)) return;
  Object.keys(appState.data.tasks).forEach(date => {
    appState.data.tasks[date] = appState.data.tasks[date].filter(t => t.projectId !== pid);
    if (appState.data.tasks[date].length === 0) delete appState.data.tasks[date];
  });
  appState.data.spreadsheets = appState.data.spreadsheets.filter(s => s.projectId !== pid);
  appState.data.projects = appState.data.projects.filter(p => p.id !== pid);
  scheduleSave();
  renderProjects();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
  refreshPeek();
}

function toggleProjectCompleted(pid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  project.completed = !project.completed;
  if (project.completed) {
    project.steps.forEach(step => {
      if (step.done) return;
      step.done = true;
      const found = findTaskByIdWithDate(step.id);
      if (found) {
        found.task.done = true;
        found.task.completedDate = dateKey(new Date());
      }
    });
  }
  scheduleSave();
  renderProjects();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
  refreshPeek();
}

function addStep(pid, textInput, dateInput) {
  const text = typeof textInput === 'string' ? textInput : textInput.value.trim();
  const dateVal = typeof dateInput === 'string' ? dateInput : (dateInput ? dateInput.value : '');
  if (!text) return;
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  const key = dateVal || dateKey(new Date());
  const stepId = uuid();
  project.steps.push({ id: stepId, text, date: key, done: false });
  if (!appState.data.tasks[key]) appState.data.tasks[key] = [];
  appState.data.tasks[key].push(createTask(text, key, '', key, stepId, pid));
  if (typeof textInput !== 'string') textInput.value = '';
  scheduleSave();
  renderProjects();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
  refreshPeek();
}

function toggleStep(pid, sid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  const step = project.steps.find(s => s.id === sid);
  if (!step) return;
  const found = findTaskByIdWithDate(sid);
  if (found) {
    const task = found.task;
    task.done = !task.done;
    task.completedDate = task.done ? dateKey(new Date()) : null;
    step.done = task.done;
    step.date = found.date;
  } else {
    step.done = !step.done;
  }
  scheduleSave();
  renderCalendar();
  renderDashboard();
  renderProjects();
  refreshDashboardDetail();
  refreshPeek();
}

function deleteStep(pid, sid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  const found = findTaskByIdWithDate(sid);
  if (found) {
    const tasks = appState.data.tasks[found.date];
    tasks.splice(found.idx, 1);
    if (tasks.length === 0) delete appState.data.tasks[found.date];
  }
  project.steps = project.steps.filter(s => s.id !== sid);
  scheduleSave();
  renderProjects();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
  refreshPeek();
}

function addProjectSpreadsheet(projectId, title) {
  const t = (title || '').trim();
  const sheet = createSpreadsheetData();
  if (t) sheet.title = t;
  sheet.projectId = projectId;
  appState.data.spreadsheets.push(sheet);
  scheduleSave();
  renderProjects();
  renderSpreadsheets();
  refreshPeek();
  openSpreadsheet(sheet.id, true);
}

function buildProjectCard(project, cardClass = 'project-card glass-card tilt-card') {
  const total = project.steps.length;
  const done = project.steps.filter(s => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isCompleted = project.completed;

  const card = document.createElement('div');
  card.className = cardClass;
  card.dataset.id = project.id;
  card.innerHTML = `
    <div class="project-header">
      <div>
        <div class="project-title">${escapeHtml(project.title)}</div>
        <div class="project-meta"><span>${done}/${total} steps</span><span>${pct}%</span></div>
      </div>
      <div class="project-header-actions">
        <button class="project-complete" title="${isCompleted ? 'Reactivate project' : 'Mark project complete'}">${isCompleted ? '↩' : '✓'}</button>
        <button class="project-delete" title="Delete project">×</button>
      </div>
    </div>
    <div class="project-progress"><div class="project-progress-bar" style="width:${pct}%"></div></div>
    <ul class="project-steps"></ul>
    ${isCompleted ? '' : `
    <div class="add-step-row">
      <input type="text" placeholder="Add a step...">
      <div class="step-date-field">
        <input type="date" value="${dateKey(new Date())}" title="Due date">
      </div>
      <button class="step-add-btn" title="Add step">+</button>
    </div>`}
    <div class="project-sheets">
      <div class="project-sheets-title">
        <span>Spreadsheets</span>
        ${isCompleted ? '' : `<button class="project-add-sheet" title="Add spreadsheet">+ Spreadsheet</button>`}
      </div>
      <ul class="project-sheets-list"></ul>
    </div>
  `;

  const stepsUl = card.querySelector('.project-steps');
  project.steps.forEach(step => {
    const li = document.createElement('li');
    li.className = 'project-step' + (step.done ? ' done' : '');
    const found = findTaskByIdWithDate(step.id);
    if (found) {
      const { task, date, idx } = found;
      li.innerHTML = `
        <span class="step-footprint" aria-hidden="true">●</span>
        <span class="step-text">${escapeHtml(step.text)}</span>
        <span class="step-date">${step.date ? formatShortDate(step.date) : ''}</span>
        ${buildTaskActions(task, date, idx)}
      `;
      bindTaskActionButtons(li, task, date, idx);
      li.querySelectorAll('.task-actions, .completed-actions').forEach(el => {
        el.addEventListener('click', e => e.stopPropagation());
      });
      li.addEventListener('click', () => toggleStep(project.id, step.id));
    } else {
      li.innerHTML = `
        <span class="step-footprint" aria-hidden="true">●</span>
        <span class="step-text">${escapeHtml(step.text)}</span>
        <span class="step-date">${step.date ? formatShortDate(step.date) : ''}</span>
      `;
      li.addEventListener('click', () => toggleStep(project.id, step.id));
    }
    stepsUl.appendChild(li);
  });

  if (!isCompleted) {
    const stepInput = card.querySelector('.add-step-row input[type="text"]');
    const dateInput = card.querySelector('.add-step-row input[type="date"]');
    const addBtn = card.querySelector('.add-step-row button');
    const add = () => addStep(project.id, stepInput, dateInput);
    addBtn.addEventListener('click', add);
    stepInput.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  const sheetList = card.querySelector('.project-sheets-list');
  const projectSheets = appState.data.spreadsheets.filter(s => s.projectId === project.id);
  if (!projectSheets.length) {
    sheetList.innerHTML = `<li class="project-sheet-empty">No spreadsheets yet.</li>`;
  } else {
    projectSheets.forEach(sheet => {
      const li = document.createElement('li');
      li.className = 'project-sheet-item';
      li.innerHTML = `
        <span class="sheet-dot" aria-hidden="true">●</span>
        <span class="project-sheet-name">${escapeHtml(sheet.title || 'Untitled Spreadsheet')}</span>
        <button class="project-sheet-delete" title="Delete spreadsheet">×</button>
      `;
      const name = li.querySelector('.project-sheet-name');
      const del = li.querySelector('.project-sheet-delete');
      if (name) name.addEventListener('click', () => openSpreadsheet(sheet.id, true));
      if (del) del.addEventListener('click', e => { e.stopPropagation(); deleteSpreadsheet(sheet.id); });
      sheetList.appendChild(li);
    });
  }
  if (!isCompleted) {
    const addSheetBtn = card.querySelector('.project-add-sheet');
    if (addSheetBtn) addSheetBtn.addEventListener('click', () => addProjectSpreadsheet(project.id));
  }

  card.querySelector('.project-complete').addEventListener('click', () => toggleProjectCompleted(project.id));
  card.querySelector('.project-delete').addEventListener('click', () => deleteProject(project.id));

  return card;
}

function renderProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  const mode = appState.projectMode || 'active';
  const filtered = appState.data.projects.filter(p => mode === 'active' ? !p.completed : p.completed);
  if (filtered.length === 0) {
    list.innerHTML = `<div class="projects-empty" style="color:var(--muted)">No ${mode} projects.</div>`;
    return;
  }
  filtered.forEach(project => list.appendChild(buildProjectCard(project)));
}

let currentPeekProjectId = null;

function initPeek() {
  document.getElementById('peek-close')?.addEventListener('click', closePeek);
  document.getElementById('peek-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('peek-overlay')) closePeek();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('peek-overlay').classList.contains('open')) closePeek();
  });
}

function openProjectPeek(pid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  currentPeekProjectId = project.id;
  closeSpreadsheet();
  const overlay = document.getElementById('peek-overlay');
  const title = document.getElementById('peek-title');
  const body = document.getElementById('peek-body');
  title.textContent = project.title || 'Project';
  body.innerHTML = '';
  body.appendChild(buildProjectCard(project, 'project-card glass-card'));
  overlay.classList.add('open');
}

function closePeek() {
  currentPeekProjectId = null;
  document.getElementById('peek-overlay').classList.remove('open');
  document.getElementById('peek-body').innerHTML = '';
}

function refreshPeek() {
  if (!currentPeekProjectId) return;
  const project = appState.data.projects.find(p => p.id === currentPeekProjectId);
  if (!project) { closePeek(); return; }
  openProjectPeek(project.id);
}

/* Notes / Brainstorm */
const BS_CARD_W = 220;
const BS_CARD_H = 160;
const BS_GAP = 54;

function initNotes() {
  document.getElementById('new-idea-btn').addEventListener('click', createNote);
  document.getElementById('brainstorm-title').addEventListener('input', saveCurrentNote);
  document.getElementById('brainstorm-body').addEventListener('input', saveCurrentNote);
  document.getElementById('prev-idea').addEventListener('click', prevIdea);
  document.getElementById('next-idea').addEventListener('click', nextIdea);
  window.addEventListener('resize', () => { if (appState.currentView === 'notes') renderBrainstormStage(); });
}

function noteDayKey(note) {
  return dateKey(note.created || note.updated);
}

function getBrainstormDays() {
  const days = {};
  appState.data.notes.forEach(n => {
    const d = noteDayKey(n);
    if (!days[d]) days[d] = [];
    days[d].push(n);
  });
  Object.keys(days).forEach(d => days[d].sort((a, b) => new Date(a.created || a.updated) - new Date(b.created || b.updated)));
  return days;
}

function getSortedDayKeys(days) {
  return Object.keys(days).sort((a, b) => new Date(b) - new Date(a));
}

function createNote() {
  const now = new Date().toISOString();
  const note = { id: uuid(), title: 'New idea', body: '', created: now, updated: now };
  appState.data.notes.push(note);
  appState.selectedBrainstormDay = noteDayKey(note);
  appState.selectedBrainstormNoteId = note.id;
  scheduleSave();
  renderNotes();
  setTimeout(() => {
    const el = document.querySelector(`.brainstorm-card[data-id="${note.id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, 60);
}

function selectNote(id) {
  appState.selectedBrainstormNoteId = id;
  const note = appState.data.notes.find(n => n.id === id);
  if (note) {
    document.getElementById('brainstorm-title').value = note.title;
    document.getElementById('brainstorm-body').value = note.body;
  }
  renderBrainstormStage();
  updateIdeaCounter();
}

function saveCurrentNote() {
  const note = appState.data.notes.find(n => n.id === appState.selectedBrainstormNoteId);
  if (!note) return;
  note.title = document.getElementById('brainstorm-title').value || 'Untitled';
  note.body = document.getElementById('brainstorm-body').value;
  note.updated = new Date().toISOString();
  scheduleSave();
  renderDaysRail();
  renderBrainstormStage();
}

function deleteNote(id) {
  appState.data.notes = appState.data.notes.filter(n => n.id !== id);
  const days = getBrainstormDays();
  const keys = getSortedDayKeys(days);
  if (appState.selectedBrainstormNoteId === id) {
    appState.selectedBrainstormNoteId = null;
    if (keys.length) {
      const day = appState.selectedBrainstormDay && days[appState.selectedBrainstormDay] ? appState.selectedBrainstormDay : keys[0];
      const list = days[day] || days[keys[0]];
      appState.selectedBrainstormDay = day;
      appState.selectedBrainstormNoteId = list[0]?.id || null;
    }
  }
  scheduleSave();
  renderNotes();
}

function prevIdea() {
  const days = getBrainstormDays();
  const list = days[appState.selectedBrainstormDay] || [];
  const idx = list.findIndex(n => n.id === appState.selectedBrainstormNoteId);
  if (idx > 0) selectNote(list[idx - 1].id);
}

function nextIdea() {
  const days = getBrainstormDays();
  const list = days[appState.selectedBrainstormDay] || [];
  const idx = list.findIndex(n => n.id === appState.selectedBrainstormNoteId);
  if (idx >= 0 && idx < list.length - 1) selectNote(list[idx + 1].id);
}

function renderNotes() {
  const days = getBrainstormDays();
  const keys = getSortedDayKeys(days);
  if (!appState.selectedBrainstormDay || !days[appState.selectedBrainstormDay]) {
    appState.selectedBrainstormDay = keys[0] || dateKey(new Date());
  }
  const list = days[appState.selectedBrainstormDay];
  if (!appState.selectedBrainstormNoteId || !appState.data.notes.find(n => n.id === appState.selectedBrainstormNoteId)) {
    appState.selectedBrainstormNoteId = list ? list[0]?.id : null;
  }
  const note = appState.data.notes.find(n => n.id === appState.selectedBrainstormNoteId);
  if (note) {
    document.getElementById('brainstorm-title').value = note.title;
    document.getElementById('brainstorm-body').value = note.body;
  } else {
    document.getElementById('brainstorm-title').value = '';
    document.getElementById('brainstorm-body').value = '';
  }
  renderDaysRail();
  renderBrainstormStage();
  updateIdeaCounter();
}

function renderDaysRail() {
  const rail = document.getElementById('days-rail');
  rail.innerHTML = '';
  const days = getBrainstormDays();
  const keys = getSortedDayKeys(days);
  if (keys.length === 0) {
    rail.innerHTML = `<div class="day-stack empty"><div class="stack-top">Today</div><p>No ideas yet</p></div>`;
    return;
  }
  keys.forEach(day => {
    const list = days[day];
    const isActive = day === appState.selectedBrainstormDay;
    const stack = document.createElement('button');
    stack.className = 'day-stack' + (isActive ? ' active' : '');
    const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const today = day === dateKey(new Date()) ? '<span class="today-badge">Today</span>' : '';
    stack.innerHTML = `
      <div class="stack-visual">
        <div class="stack-card stack-card-3"></div>
        <div class="stack-card stack-card-2"></div>
        <div class="stack-card stack-card-1">
          <span class="stack-count">${list.length}</span>
          <span class="stack-date">${dateLabel}</span>
          ${today}
        </div>
      </div>
    `;
    stack.addEventListener('click', () => {
      appState.selectedBrainstormDay = day;
      appState.selectedBrainstormNoteId = list[0]?.id;
      renderNotes();
    });
    rail.appendChild(stack);
  });
}

function renderBrainstormStage() {
  const canvas = document.getElementById('brainstorm-canvas');
  const container = document.getElementById('brainstorm-cards');
  const svg = document.getElementById('brainstorm-connections');
  if (!canvas || !container || !svg) return;
  container.innerHTML = '';
  svg.innerHTML = '';

  const days = getBrainstormDays();
  const list = days[appState.selectedBrainstormDay] || [];
  const totalWidth = Math.max(canvas.clientWidth, list.length * (BS_CARD_W + BS_GAP) + 140);
  container.style.width = totalWidth + 'px';
  svg.setAttribute('width', totalWidth);
  svg.setAttribute('height', canvas.clientHeight);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.id = 'bs-conn-gradient';
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
  grad.innerHTML = '<stop offset="0%" stop-color="#22d3ee" /><stop offset="100%" stop-color="#a855f7" />';
  defs.appendChild(grad);
  svg.appendChild(defs);

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(group);

  const canvasH = canvas.clientHeight;
  const centerY = Math.round(canvasH * 0.45);
  const startX = 70;

  const points = list.map((n, i) => {
    const x = startX + i * (BS_CARD_W + BS_GAP) + BS_CARD_W / 2;
    const y = centerY + Math.sin(i * 0.7) * 28;
    return { x, y, note: n, index: i };
  });

  if (points.length > 1) {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', d);
    track.setAttribute('class', 'brainstorm-track');
    group.appendChild(track);

    const active = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    active.setAttribute('d', d);
    active.setAttribute('class', 'brainstorm-line');
    group.appendChild(active);
  }

  points.forEach((p, i) => {
    const isFirst = i === 0;
    const isSelected = p.note.id === appState.selectedBrainstormNoteId;
    const card = document.createElement('div');
    card.className = 'brainstorm-card' + (isFirst ? ' first' : '') + (isSelected ? ' active' : '');
    card.style.left = (p.x - BS_CARD_W / 2) + 'px';
    card.style.top = (p.y - BS_CARD_H / 2) + 'px';
    card.style.setProperty('--rotate', `${(i - (list.length - 1) / 2) * -2}deg`);
    card.style.transform = `rotate(${(i - (list.length - 1) / 2) * -2}deg)`;
    card.dataset.id = p.note.id;
    card.dataset.index = i;
    card.innerHTML = `
      <div class="bs-card-header">
        <span class="bs-card-order">${i + 1}</span>
        ${isFirst ? '<span class="bs-card-spark">Spark</span>' : ''}
        <button class="bs-card-delete" title="Delete idea">×</button>
      </div>
      <h4>${escapeHtml(p.note.title) || 'Untitled'}</h4>
      <p>${escapeHtml(p.note.body).slice(0, 90)}${p.note.body.length > 90 ? '…' : ''}</p>
    `;
    card.addEventListener('click', () => selectNote(p.note.id));
    card.querySelector('.bs-card-delete').addEventListener('click', e => { e.stopPropagation(); deleteNote(p.note.id); });
    container.appendChild(card);

    const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    node.setAttribute('cx', p.x);
    node.setAttribute('cy', p.y);
    node.setAttribute('r', isFirst ? 8 : 5);
    node.setAttribute('class', 'brainstorm-node' + (isFirst ? ' first' : ''));
    group.appendChild(node);
  });

  requestAnimationFrame(() => {
    const active = container.querySelector('.brainstorm-card.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
}

function updateIdeaCounter() {
  const days = getBrainstormDays();
  const list = days[appState.selectedBrainstormDay] || [];
  const idx = Math.max(0, list.findIndex(n => n.id === appState.selectedBrainstormNoteId));
  const counter = document.getElementById('idea-counter');
  if (counter) counter.textContent = list.length ? `${idx + 1} / ${list.length}` : '0 / 0';
}

/* Liquid effects */
function initLiquidEffects() {
  document.querySelectorAll('.liquid-btn').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--x', ((e.clientX - rect.left) / rect.width * 100) + '%');
      btn.style.setProperty('--y', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
  });

  document.querySelectorAll('.tile, .project-card, .auth-card, .modal-card, .deferred-item').forEach(el => {
    el.classList.add('tilt-card');
    let raf = null;
    let pending = null;
    el.addEventListener('mousemove', e => {
      pending = { clientX: e.clientX, clientY: e.clientY };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const evt = pending;
        pending = null;
        if (!evt) return;
        const rect = el.getBoundingClientRect();
        const x = (evt.clientX - rect.left) / rect.width - 0.5;
        const y = (evt.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(800px) rotateX(${y * -6}deg) rotateY(${x * 6}deg) scale(1.01)`;
      });
    });
    el.addEventListener('mouseleave', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      pending = null;
      el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
    });
  });

  document.querySelectorAll('.nav-item, .cal-day, .task-item, .day-stack, .modal-option, .action-btn').forEach(el => {
    el.addEventListener('mousedown', () => el.style.transform = 'scale(0.94)');
    el.addEventListener('mouseup', () => el.style.transform = '');
    el.addEventListener('mouseleave', () => el.style.transform = '');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* Task notes overlay */
function initNotesOverlay() {
  document.getElementById('notes-close').addEventListener('click', closeNotesOverlay);
  document.getElementById('notes-save').addEventListener('click', saveTaskNotes);
  document.getElementById('notes-skip')?.addEventListener('click', closeNotesOverlay);
  document.getElementById('notes-overlay').addEventListener('click', e => { if (e.target === document.getElementById('notes-overlay')) closeNotesOverlay(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('notes-overlay').classList.contains('open')) closeNotesOverlay(); });
}

function openTaskNotes(date, idx, fromComplete = false) {
  const tasks = appState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  notesTarget = { date, idx, fromComplete };
  const task = tasks[idx];
  const overlay = document.getElementById('notes-overlay');
  const title = document.getElementById('notes-title');
  const existing = document.getElementById('notes-existing');
  const prompt = document.getElementById('notes-prompt');
  const skipBtn = document.getElementById('notes-skip');
  const saveBtn = document.getElementById('notes-save');
  const notesText = document.getElementById('notes-text');

  notesText.value = task.notes || '';
  if (fromComplete) {
    title.textContent = task.notes ? 'Notes already added' : 'Add additional notes?';
    saveBtn.textContent = task.notes ? 'Update notes' : 'Add notes';
    skipBtn.style.display = 'inline-flex';
    skipBtn.textContent = 'Skip';
  } else {
    title.textContent = 'Task Notes';
    saveBtn.textContent = 'Save notes';
    skipBtn.style.display = 'none';
  }
  if (task.notes) {
    existing.textContent = 'Existing notes: ' + task.notes;
    existing.style.display = 'block';
  } else {
    existing.style.display = 'none';
    existing.textContent = '';
  }
  prompt.style.display = fromComplete ? 'block' : 'none';
  overlay.classList.add('open');
  setTimeout(() => notesText.focus(), 50);
}

function saveTaskNotes() {
  if (!notesTarget) return;
  const tasks = appState.data.tasks[notesTarget.date];
  if (!tasks || !tasks[notesTarget.idx]) return;
  tasks[notesTarget.idx].notes = document.getElementById('notes-text').value.trim();
  scheduleSave();
  renderCalendar();
  renderDashboard();
  renderProjects();
  refreshDashboardDetail();
  refreshPeek();
  closeNotesOverlay();
}

function closeNotesOverlay() {
  document.getElementById('notes-overlay').classList.remove('open');
  notesTarget = null;
}

/* Share today's list */
function fallbackCopy(textarea) {
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  document.execCommand('copy');
}

function shareDay() {
  const tasks = appState.data.tasks[appState.selectedDate] || [];
  const d = new Date(appState.selectedDate + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (tasks.length === 0) {
    openModal(`Share ${dateLabel}`, '<p style="color:var(--muted)">No tasks on this day to share.</p>', 'Close', () => {});
    return;
  }
  const lines = tasks.map(t => `${t.done ? '- [x]' : '- [ ]'} ${t.text}${t.notes ? ' (' + t.notes + ')' : ''}`);
  const text = `Some things on my to-do list for ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:\n${lines.join('\n')}`;
  const body = `<textarea id="share-text" class="share-text" readonly>${escapeHtml(text)}</textarea>`;
  openModal(`Share ${dateLabel}`, body, 'Copy to clipboard', () => {
    const ta = document.getElementById('share-text');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).catch(() => fallbackCopy(ta));
    } else {
      fallbackCopy(ta);
    }
  });
}

/* Reports */
function initReports() {
  const start = document.getElementById('report-start');
  const end = document.getElementById('report-end');
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  start.value = dateKey(first);
  end.value = dateKey(now);
  ['input', 'change'].forEach(evt => {
    start.addEventListener(evt, renderReports);
    end.addEventListener(evt, renderReports);
  });
  document.getElementById('report-tasks').addEventListener('change', renderReports);
  document.getElementById('report-projects').addEventListener('change', renderReports);
  document.getElementById('download-report').addEventListener('click', downloadReportExcel);
}

function renderReports() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  const includeTasks = document.getElementById('report-tasks').checked;
  const includeProjects = document.getElementById('report-projects').checked;
  const preview = document.getElementById('reports-preview');
  const { taskRows, projectRows } = generateReportData(start, end, includeTasks, includeProjects);
  if (!taskRows.length && !projectRows.length) {
    preview.innerHTML = '<p>No completed tasks or projects match this range.</p>';
    return;
  }
  let html = '';
  if (taskRows.length) html += `<p><strong>${taskRows.length}</strong> completed task${taskRows.length === 1 ? '' : 's'}</p>`;
  if (projectRows.length) html += `<p><strong>${projectRows.length}</strong> completed project${projectRows.length === 1 ? '' : 's'}</p>`;
  preview.innerHTML = html;
}

function generateReportData(start, end, includeTasks, includeProjects) {
  const taskRows = [];
  const projectRows = [];
  if (includeTasks) {
    Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
      tasks.forEach(task => {
        if (!task.done) return;
        const reportDate = task.completedDate || date;
        if (reportDate < start || reportDate > end) return;
        taskRows.push({ date, originalDate: task.plantedDate || date, completedDate: task.completedDate || '', text: task.text, notes: task.notes || '' });
      });
    });
    taskRows.sort((a, b) => (a.completedDate || a.date).localeCompare(b.completedDate || b.date));
  }
  if (includeProjects) {
    appState.data.projects.forEach(project => {
      const total = project.steps.length;
      const done = project.steps.filter(s => s.done).length;
      if (total && done === total) {
        const created = (project.created || '').slice(0, 10);
        if (created >= start && created <= end) {
          projectRows.push({ title: project.title, steps: `${done}/${total}`, status: 'Completed', pct: 100, created: project.created });
        }
      }
    });
    projectRows.sort((a, b) => a.created.localeCompare(b.created));
  }
  return { taskRows, projectRows };
}

async function downloadReportExcel() {
  if (typeof window.createXlsx !== 'function') {
    alert('Excel export is not available.');
    return;
  }
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  const includeTasks = document.getElementById('report-tasks').checked;
  const includeProjects = document.getElementById('report-projects').checked;
  const { taskRows, projectRows } = generateReportData(start, end, includeTasks, includeProjects);
  const sheets = [];
  if (taskRows.length) {
    const taskData = [
      ['Original Date', 'Scheduled Date', 'Task', 'Completed Date', 'Status', 'Notes']
    ];
    taskRows.forEach(row => {
      taskData.push([
        { format: 'date', value: new Date((row.originalDate || row.date) + 'T00:00:00') },
        { format: 'date', value: new Date(row.date + 'T00:00:00') },
        row.text,
        row.completedDate ? { format: 'date', value: new Date(row.completedDate + 'T00:00:00') } : '',
        'Completed',
        row.notes
      ]);
    });
    sheets.push({ name: 'Completed Tasks', freeze: { rows: 1 }, cols: '14,14,36,14,12,40', data: taskData });
  }
  if (projectRows.length) {
    const projectData = [
      ['Project', 'Steps', 'Status', 'Completion %', 'Created', 'Notes']
    ];
    projectRows.forEach(row => {
      projectData.push([row.title, row.steps, row.status, row.pct + '%', { format: 'date', value: new Date(row.created) }, '']);
    });
    sheets.push({ name: 'Completed Projects', freeze: { rows: 1 }, cols: '30,12,14,14,14,40', data: projectData });
  }
  if (!sheets.length) {
    alert('No data to export for the selected range.');
    return;
  }
  const workbook = { sheets };
  const uint8 = await window.createXlsx(workbook);
  const blob = new Blob([uint8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Onward-Report-${start}-to-${end}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Spreadsheets */
const SHEET_DEFAULT_ROWS = 30;
const SHEET_DEFAULT_COLS = 10;

function colToIndex(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n - 1;
}

function indexToCol(idx) {
  let col = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col || 'A';
}

function cellRefToPos(ref) {
  const m = String(ref).toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const c = colToIndex(m[1]);
  const r = parseInt(m[2], 10) - 1;
  if (r < 0 || c < 0) return null;
  return { r, c };
}

function posToKey(r, c) {
  return `R${r}:C${c}`;
}

function createSpreadsheetData() {
  return {
    id: uuid(),
    title: 'Untitled Spreadsheet',
    projectId: null,
    rows: SHEET_DEFAULT_ROWS,
    cols: SHEET_DEFAULT_COLS,
    cells: {},
    colScale: 1,
    rowScale: 1,
    filter: null
  };
}

function tokenizeFormula(formula) {
  const tokens = [];
  const regex = /([A-Z]+\d+|[A-Z]+(?=\()|\d+(?:\.\d+)?|"[^"]*"|\+|-|\*|\/|\^|:|\(|\)|,)/gi;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    const t = match[0].toUpperCase();
    if (/^[A-Z]+\d+$/.test(t)) tokens.push({ type: 'cell', value: t });
    else if (/^[A-Z]+$/.test(t)) tokens.push({ type: 'func', value: t });
    else if (/^\d+(?:\.\d+)?$/.test(t)) tokens.push({ type: 'number', value: parseFloat(t) });
    else if (t === '"') continue;
    else if (t.startsWith('"')) tokens.push({ type: 'string', value: t.slice(1, -1) });
    else tokens.push({ type: 'op', value: t });
  }
  return tokens;
}

function parseRange(tokens, start) {
  if (tokens[start].type !== 'cell' || tokens[start + 1]?.value !== ':' || tokens[start + 2]?.type !== 'cell') return null;
  const a = cellRefToPos(tokens[start].value);
  const b = cellRefToPos(tokens[start + 2].value);
  if (!a || !b) return null;
  return { a, b, consumed: 3 };
}

function evaluateFormula(formula, sheet, computing, currentKey) {
  const expr = String(formula).startsWith('=') ? formula.slice(1) : formula;
  const tokens = tokenizeFormula(expr);
  let pos = 0;

  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }
  function expect(v) { if (peek()?.value !== v) throw new Error('expected ' + v); consume(); }

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v === '' || v === undefined || v === null) return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function truthy(v) {
    const n = toNum(v);
    return n !== 0;
  }

  function cellValue(ref) {
    const p = cellRefToPos(ref);
    if (!p) return 0;
    const key = posToKey(p.r, p.c);
    if (computing.has(key)) return '#CIRC!';
    return getSheetCellValue(sheet, p.r, p.c, computing);
  }

  function parseArgList() {
    const args = [];
    if (peek()?.value === ')') return args;
    while (true) {
      const range = parseRange(tokens, pos);
      if (range) {
        const vals = [];
        for (let r = Math.min(range.a.r, range.b.r); r <= Math.max(range.a.r, range.b.r); r++) {
          for (let c = Math.min(range.a.c, range.b.c); c <= Math.max(range.a.c, range.b.c); c++) {
            vals.push(getSheetCellValue(sheet, r, c, computing));
          }
        }
        args.push(vals);
        pos += range.consumed;
      } else {
        args.push(parseExpression());
      }
      if (peek()?.value === ',') { consume(); continue; }
      break;
    }
    return args;
  }

  function parseFunction(name) {
    consume();
    expect('(');
    const args = parseArgList();
    expect(')');
    const flat = args.flat();
    switch (name) {
      case 'SUM': return flat.reduce((s, v) => s + toNum(v), 0);
      case 'AVERAGE': return flat.length ? flat.reduce((s, v) => s + toNum(v), 0) / flat.length : 0;
      case 'COUNT': return flat.filter(v => v !== '' && !isNaN(parseFloat(v))).length;
      case 'MIN': return Math.min(...flat.map(toNum));
      case 'MAX': return Math.max(...flat.map(toNum));
      case 'IF': return truthy(args[0]) ? args[1] : args[2];
      default: return 0;
    }
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('unexpected end');
    if (t.type === 'number') { consume(); return t.value; }
    if (t.type === 'string') { consume(); return t.value; }
    if (t.type === 'func') { return parseFunction(t.value); }
    if (t.type === 'cell') {
      const range = parseRange(tokens, pos);
      if (range) {
        const vals = [];
        for (let r = Math.min(range.a.r, range.b.r); r <= Math.max(range.a.r, range.b.r); r++) {
          for (let c = Math.min(range.a.c, range.b.c); c <= Math.max(range.a.c, range.b.c); c++) {
            vals.push(getSheetCellValue(sheet, r, c, computing));
          }
        }
        pos += range.consumed;
        return vals;
      }
      consume();
      return cellValue(t.value);
    }
    if (t.value === '(') { consume(); const v = parseExpression(); expect(')'); return v; }
    throw new Error('unexpected token ' + t.value);
  }

  function parsePower() {
    let v = parsePrimary();
    if (peek()?.value === '^') { consume(); return Math.pow(toNum(v), toNum(parsePower())); }
    return v;
  }

  function parseFactor() {
    let v = parsePower();
    while (peek() && (peek().value === '*' || peek().value === '/')) {
      const op = consume().value;
      const rhs = parsePower();
      v = op === '*' ? toNum(v) * toNum(rhs) : toNum(v) / toNum(rhs);
    }
    return v;
  }

  function parseExpression() {
    let v = parseFactor();
    while (peek() && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const rhs = parseFactor();
      v = op === '+' ? toNum(v) + toNum(rhs) : toNum(v) - toNum(rhs);
    }
    return v;
  }

  try {
    if (!tokens.length) return '';
    const result = parseExpression();
    return result;
  } catch (e) {
    return '#ERR';
  }
}

function getSheetCellValue(sheet, r, c, computing) {
  const key = posToKey(r, c);
  const raw = sheet.cells[key] || '';
  if (raw === '' || raw === undefined) return '';
  if (String(raw).startsWith('=')) {
    if (computing.has(key)) return '#CIRC!';
    computing.add(key);
    const val = evaluateFormula(raw, sheet, computing, key);
    computing.delete(key);
    return val;
  }
  const n = parseFloat(raw);
  return isNaN(n) ? raw : n;
}

function getSheetCellDisplay(sheet, r, c) {
  const v = getSheetCellValue(sheet, r, c, new Set());
  if (v === '' || v === undefined || v === null) return '';
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(2).replace(/\.?0+$/, '');
  return String(v);
}

function setSheetCell(sheet, r, c, value) {
  const key = posToKey(r, c);
  if (value === '' || value === undefined) {
    delete sheet.cells[key];
  } else {
    sheet.cells[key] = value;
  }
  scheduleSave();
  renderSheet();
}

let activeSheet = null;

async function exportSpreadsheet() {
  if (!activeSheet) return;
  if (typeof window.createXlsx !== 'function') {
    alert('Excel export is not available.');
    return;
  }
  const rows = activeSheet.rows || SHEET_DEFAULT_ROWS;
  const cols = activeSheet.cols || SHEET_DEFAULT_COLS;
  const colWidths = [];
  for (let c = 0; c < cols; c++) colWidths.push(14);
  const data = [];
  const header = [''];
  for (let c = 0; c < cols; c++) header.push(indexToCol(c));
  data.push(header);
  for (let r = 0; r < rows; r++) {
    const row = [String(r + 1)];
    for (let c = 0; c < cols; c++) {
      const v = getSheetCellDisplay(activeSheet, r, c);
      row.push(v === '' ? '' : v);
    }
    data.push(row);
  }
  const workbook = { sheets: [{ name: activeSheet.title || 'Sheet1', freeze: { rows: 1, cols: 1 }, cols: colWidths.join(','), data }] };
  const uint8 = await window.createXlsx(workbook);
  const blob = new Blob([uint8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = (activeSheet.title || 'spreadsheet').replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-');
  a.download = `${safe}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initSpreadsheets() {
  const taskToggle = document.getElementById('new-sheet-task');
  const taskDate = document.getElementById('new-sheet-task-date');
  if (taskDate) {
    taskDate.value = dateKey(new Date());
    taskDate.disabled = !taskToggle.checked;
    taskToggle.addEventListener('change', () => { taskDate.disabled = !taskToggle.checked; });
  }
  document.getElementById('new-sheet-btn').addEventListener('click', () => {
    const input = document.getElementById('new-sheet-title');
    const title = input.value.trim();
    const sheet = createSpreadsheetData();
    if (title) sheet.title = title;
    appState.data.spreadsheets.push(sheet);
    if (taskToggle && taskToggle.checked) {
      const key = taskDate && taskDate.value ? taskDate.value : dateKey(new Date());
      if (!appState.data.tasks[key]) appState.data.tasks[key] = [];
      appState.data.tasks[key].push(createTask(`Spreadsheet: ${sheet.title}`, key, '', key, null, null, false, null, sheet.id));
      taskToggle.checked = false;
      if (taskDate) {
        taskDate.value = dateKey(new Date());
        taskDate.disabled = true;
      }
    }
    scheduleSave();
    renderSpreadsheets();
    renderDashboard();
    renderCalendar();
    input.value = '';
    openSpreadsheet(sheet.id);
  });
  document.getElementById('sheet-close').addEventListener('click', closeSpreadsheet);
  document.getElementById('sheet-export').addEventListener('click', exportSpreadsheet);
  document.getElementById('sheet-cols-narrow').addEventListener('click', () => adjustSheetScale('col', -0.2));
  document.getElementById('sheet-cols-wide').addEventListener('click', () => adjustSheetScale('col', 0.2));
  document.getElementById('sheet-rows-short').addEventListener('click', () => adjustSheetScale('row', -0.2));
  document.getElementById('sheet-rows-tall').addEventListener('click', () => adjustSheetScale('row', 0.2));
  document.getElementById('sheet-title-input').addEventListener('input', e => {
    if (activeSheet) {
      activeSheet.title = e.target.value;
      scheduleSave();
      renderSpreadsheets();
    }
  });
  const detail = document.getElementById('spreadsheet-detail');
  detail.addEventListener('click', e => { if (e.target === detail) closeSpreadsheet(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && detail.classList.contains('open')) closeSpreadsheet();
  });
}

function renderSpreadsheets() {
  const grid = document.getElementById('spreadsheets-grid');
  grid.innerHTML = '';
  const sheets = appState.data.spreadsheets || [];
  if (!sheets.length) {
    grid.innerHTML = '<div class="spreadsheets-empty">Create a spreadsheet to get started.</div>';
    return;
  }
  sheets.forEach(sheet => {
    const project = sheet.projectId ? appState.data.projects.find(p => p.id === sheet.projectId) : null;
    const tile = document.createElement('div');
    tile.className = 'spreadsheet-tile glass-card';
    tile.innerHTML = `
      <div class="spreadsheet-tile-header">
        <span class="spreadsheet-tile-title-text">${escapeHtml(sheet.title || 'Untitled')}</span>
        <div class="spreadsheet-tile-controls">
          ${project ? `<button class="spreadsheet-tile-badge project-badge" data-pid="${escapeHtml(sheet.projectId)}" title="Open project"><span class="badge-dot" aria-hidden="true">●</span><span class="badge-text">Project</span></button>` : ''}
          <button class="spreadsheet-tile-delete" title="Delete spreadsheet">×</button>
        </div>
      </div>
      <div class="spreadsheet-tile-body">
        <div class="spreadsheet-tile-icon">▦</div>
      </div>
    `;
    tile.addEventListener('click', () => openSpreadsheet(sheet.id));
    const delBtn = tile.querySelector('.spreadsheet-tile-delete');
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSpreadsheet(sheet.id); });
    const projBadge = tile.querySelector('.spreadsheet-tile-badge');
    if (projBadge) {
      projBadge.addEventListener('click', (e) => { e.stopPropagation(); openProjectPeek(projBadge.dataset.pid); });
    }
    grid.appendChild(tile);
  });
}

function openSpreadsheet(id, inPlace = false) {
  if (!inPlace) switchView('spreadsheets');
  else closePeek();
  const sheet = appState.data.spreadsheets.find(s => s.id === id);
  if (!sheet) return;
  activeSheet = sheet;
  if (activeSheet.colScale === undefined) activeSheet.colScale = 1;
  if (activeSheet.rowScale === undefined) activeSheet.rowScale = 1;
  if (!activeSheet.filter) activeSheet.filter = null;
  document.getElementById('sheet-title-input').value = sheet.title || '';
  document.getElementById('spreadsheet-detail').classList.add('open');
  renderSheet();
}

function deleteSpreadsheet(sid) {
  const sheet = appState.data.spreadsheets.find(s => s.id === sid);
  if (!sheet) return;
  const linked = findTaskBySpreadsheetId(sid);
  const msg = linked
    ? `Delete "${sheet.title || 'Untitled'}"? This will also delete the linked task: "${linked.text}". This cannot be undone.`
    : `Delete "${sheet.title || 'Untitled'}"? This cannot be undone.`;
  if (!confirm(msg)) return;
  if (linked) {
    Object.keys(appState.data.tasks).forEach(date => {
      appState.data.tasks[date] = appState.data.tasks[date].filter(t => t.id !== linked.id);
      if (appState.data.tasks[date].length === 0) delete appState.data.tasks[date];
    });
    appState.data.postponed = appState.data.postponed.filter(t => t.taskId !== linked.id);
    appState.data.trash = appState.data.trash.filter(t => t.taskId !== linked.id);
  }
  appState.data.spreadsheets = appState.data.spreadsheets.filter(s => s.id !== sid);
  if (activeSheet && activeSheet.id === sid) closeSpreadsheet();
  scheduleSave();
  renderSpreadsheets();
  renderProjects();
  renderDashboard();
  renderCalendar();
  refreshDashboardDetail();
  refreshPeek();
}

function findTaskBySpreadsheetId(sid) {
  for (const date of Object.keys(appState.data.tasks)) {
    const found = appState.data.tasks[date].find(t => t.spreadsheetId === sid);
    if (found) return found;
  }
  const inPost = appState.data.postponed.find(t => t.spreadsheetId === sid);
  if (inPost) return { id: inPost.taskId, text: inPost.text };
  const inTrash = appState.data.trash.find(t => t.spreadsheetId === sid);
  if (inTrash) return { id: inTrash.taskId, text: inTrash.text };
  return null;
}

function adjustSheetScale(type, delta) {
  if (!activeSheet) return;
  if (type === 'col') activeSheet.colScale = Math.max(0.4, Math.min(3, (activeSheet.colScale || 1) + delta));
  else activeSheet.rowScale = Math.max(0.4, Math.min(3, (activeSheet.rowScale || 1) + delta));
  scheduleSave();
  renderSheet();
}

function closeSpreadsheet() {
  document.getElementById('spreadsheet-detail').classList.remove('open');
  activeSheet = null;
}

function renderSheet() {
  const container = document.getElementById('sheet-container');
  if (!activeSheet) { container.innerHTML = ''; return; }
  const rows = activeSheet.rows || SHEET_DEFAULT_ROWS;
  const cols = activeSheet.cols || SHEET_DEFAULT_COLS;
  const colScale = activeSheet.colScale || 1;
  const rowScale = activeSheet.rowScale || 1;
  const colWidth = Math.round(90 * colScale);
  const rowHeight = Math.round(28 * rowScale);
  const filter = activeSheet.filter;

  const table = document.createElement('table');
  table.className = 'sheet-table';
  table.style.setProperty('--sheet-col-width', colWidth + 'px');
  table.style.setProperty('--sheet-row-height', rowHeight + 'px');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.appendChild(document.createElement('th'));
  for (let c = 0; c < cols; c++) {
    const th = document.createElement('th');
    th.className = 'sheet-col-header';
    const letter = indexToCol(c);
    th.innerHTML = `<span class="sheet-col-letter">${letter}</span><button class="sheet-filter-btn" data-col="${c}" title="Filter ${letter}">▾</button>`;
    if (filter && filter.col === c) th.classList.add('filtered');
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const visibleRows = [];
  for (let r = 0; r < rows; r++) {
    let ok = true;
    if (filter && filter.col >= 0) {
      const v = String(getSheetCellDisplay(activeSheet, r, filter.col) || '');
      if (v !== filter.value) ok = false;
    }
    if (ok) visibleRows.push(r);
  }

  const tbody = document.createElement('tbody');
  visibleRows.forEach(r => {
    const tr = document.createElement('tr');
    const rowHead = document.createElement('th');
    rowHead.className = 'sheet-row-header';
    rowHead.textContent = r + 1;
    tr.appendChild(rowHead);
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'sheet-cell';
      input.value = getSheetCellDisplay(activeSheet, r, c);
      input.dataset.r = r;
      input.dataset.c = c;
      input.addEventListener('change', e => {
        setSheetCell(activeSheet, parseInt(e.target.dataset.r), parseInt(e.target.dataset.c), e.target.value);
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = table.querySelector(`input[data-r="${r + 1}"][data-c="${c}"]`);
          if (next) next.focus();
        }
      });
      td.appendChild(input);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);

  table.querySelectorAll('.sheet-filter-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showSheetFilterMenu(parseInt(btn.dataset.col), btn);
    });
  });
}

function showSheetFilterMenu(col, anchor) {
  if (!activeSheet) return;
  const existing = document.querySelector('.sheet-filter-menu');
  if (existing) existing.remove();
  const values = new Set();
  const rows = activeSheet.rows || SHEET_DEFAULT_ROWS;
  for (let r = 0; r < rows; r++) {
    const v = String(getSheetCellDisplay(activeSheet, r, col) || '');
    if (v) values.add(v);
  }
  const menu = document.createElement('div');
  menu.className = 'sheet-filter-menu glass-card';
  const allBtn = document.createElement('button');
  allBtn.className = 'sheet-filter-item';
  allBtn.textContent = '(All)';
  allBtn.addEventListener('click', () => { activeSheet.filter = null; scheduleSave(); renderSheet(); menu.remove(); });
  menu.appendChild(allBtn);
  if (values.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'sheet-filter-empty';
    empty.textContent = 'No values';
    menu.appendChild(empty);
  } else {
    Array.from(values).sort().forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'sheet-filter-item';
      btn.textContent = v.length > 24 ? v.slice(0, 24) + '…' : v;
      btn.title = v;
      btn.addEventListener('click', () => { activeSheet.filter = { col, value: v }; scheduleSave(); renderSheet(); menu.remove(); });
      menu.appendChild(btn);
    });
  }
  anchor.parentElement.appendChild(menu);
  document.addEventListener('click', function close(e) { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('click', close); } });
}

/* Tour */
let tourSteps = [];
let tourIndex = 0;
let tourTargetEl = null;

function initTour() {
  const overlay = document.getElementById('tour-overlay');
  const tooltip = document.getElementById('tour-tooltip');
  const message = document.getElementById('tour-message');
  const nextBtn = document.getElementById('tour-next');
  const prevBtn = document.getElementById('tour-prev');
  const skipBtn = document.getElementById('tour-skip');
  const startBtn = document.getElementById('tour-btn');
  if (!overlay || !tooltip || !startBtn) return;

  tourSteps = [
    { target: '.topbar', message: 'This is the top bar. The question mark starts this tour any time.', position: 'bottom' },
    { target: '.kpi-tile[data-type="today"]', message: 'Today shows tasks scheduled for today. Click the tile to expand and add tasks quickly.', position: 'right' },
    { target: '.kpi-tile[data-type="upcoming"]', message: 'Upcoming shows future tasks so you can get ahead.', position: 'right' },
    { target: '.kpi-tile[data-type="rollover"]', message: 'Rollover rate tracks overdue tasks. Keep this low to stay on track.', position: 'right' },
    { target: '.kpi-tile[data-type="projects"]', message: 'Projects shows your active projects. Click to see progress and add steps.', position: 'right' },
    { target: '.sidebar nav', message: 'Switch between Dashboard, Calendar, Projects, Brainstorm, Reports, Spreadsheets, and Deferred.', position: 'right' },
    { target: '#calendar-card', message: 'Calendar lets you browse dates, search tasks, and share a day as text.', position: 'bottom' },
    { target: null, message: 'Notice the colored dots next to tasks. Purple means a project; green means a spreadsheet. Hover a dot to see the label, then click to open it.', position: 'center' }
  ];

  startBtn.addEventListener('click', () => { startTour(); });
  nextBtn?.addEventListener('click', () => { nextTourStep(); });
  prevBtn?.addEventListener('click', () => { prevTourStep(); });
  skipBtn?.addEventListener('click', () => { endTour(); });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) endTour();
  });
  document.addEventListener('keydown', e => {
    if (overlay.style.display === 'none') return;
    if (e.key === 'Escape') endTour();
    if (e.key === 'ArrowRight') nextTourStep();
    if (e.key === 'ArrowLeft') prevTourStep();
  });
}

function startTour() {
  const overlay = document.getElementById('tour-overlay');
  const tooltip = document.getElementById('tour-tooltip');
  overlay.style.display = 'block';
  tooltip.style.display = 'block';
  tourIndex = 0;
  showTourStep(0);
  requestAnimationFrame(() => { overlay.classList.add('active'); tooltip.classList.add('active'); });
}

function endTour() {
  const overlay = document.getElementById('tour-overlay');
  const tooltip = document.getElementById('tour-tooltip');
  const spotlight = document.querySelector('.tour-spotlight');
  overlay.classList.remove('active');
  tooltip.classList.remove('active');
  spotlight?.classList.remove('active');
  setTimeout(() => {
    overlay.style.display = 'none';
    tooltip.style.display = 'none';
    if (spotlight) spotlight.style.display = 'none';
    if (tourTargetEl) tourTargetEl.classList.remove('tour-target');
    tourTargetEl = null;
  }, 350);
}

function nextTourStep() {
  if (tourIndex < tourSteps.length - 1) showTourStep(tourIndex + 1);
  else endTour();
}

function prevTourStep() {
  if (tourIndex > 0) showTourStep(tourIndex - 1);
}

function showTourStep(idx) {
  tourIndex = idx;
  const step = tourSteps[idx];
  const overlay = document.getElementById('tour-overlay');
  const tooltip = document.getElementById('tour-tooltip');
  const message = document.getElementById('tour-message');
  const nextBtn = document.getElementById('tour-next');
  const prevBtn = document.getElementById('tour-prev');
  const skipBtn = document.getElementById('tour-skip');
  const spotlight = document.querySelector('.tour-spotlight');

  message.textContent = step.message;
  nextBtn.textContent = idx === tourSteps.length - 1 ? 'Finish' : 'Next';
  prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
  skipBtn.textContent = 'Exit';

  if (tourTargetEl) {
    tourTargetEl.classList.remove('tour-target');
    tourTargetEl = null;
  }

  let target = step.target ? document.querySelector(step.target) : null;
  if (step.target && !target) {
    const fallback = tourSteps.slice(idx + 1).find(s => !s.target || document.querySelector(s.target));
    if (fallback) { nextTourStep(); return; }
  }
  if (target) {
    target.classList.add('tour-target');
    tourTargetEl = target;
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
  positionTourSpotlight(target, step.position);
  positionTourTooltip(target, step.position);
}

function positionTourSpotlight(target, position) {
  const overlay = document.getElementById('tour-overlay');
  const spotlight = document.querySelector('.tour-spotlight');
  if (!target) {
    overlay.style.setProperty('--spot-x', '50%');
    overlay.style.setProperty('--spot-y', '50%');
    overlay.style.setProperty('--spot-radius', '0px');
    spotlight.style.opacity = '0';
    spotlight.classList.remove('active');
    spotlight.style.display = 'none';
    return;
  }
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) / 2 + 12;
  overlay.style.setProperty('--spot-x', `${cx}px`);
  overlay.style.setProperty('--spot-y', `${cy}px`);
  overlay.style.setProperty('--spot-radius', `${radius}px`);

  spotlight.style.display = 'block';
  spotlight.style.width = `${rect.width + 24}px`;
  spotlight.style.height = `${rect.height + 24}px`;
  spotlight.style.left = `${rect.left - 12}px`;
  spotlight.style.top = `${rect.top - 12}px`;
  spotlight.classList.add('active');
}

function positionTourTooltip(target, position) {
  const tooltip = document.getElementById('tour-tooltip');
  const margin = 16;
  let rect;
  if (target) rect = target.getBoundingClientRect();
  else rect = { left: window.innerWidth / 2 - 60, top: window.innerHeight / 2 - 40, width: 120, height: 80 };
  const tpRect = tooltip.getBoundingClientRect();
  let top, left;

  if (position === 'right') {
    left = rect.right + margin;
    top = rect.top + (rect.height - tpRect.height) / 2;
    if (left + tpRect.width > window.innerWidth - margin) {
      left = rect.left - tpRect.width - margin;
      position = 'left';
    }
  } else if (position === 'left') {
    left = rect.left - tpRect.width - margin;
    top = rect.top + (rect.height - tpRect.height) / 2;
    if (left < margin) { left = rect.right + margin; position = 'right'; }
  } else if (position === 'bottom') {
    left = rect.left + (rect.width - tpRect.width) / 2;
    top = rect.bottom + margin;
    if (left + tpRect.width > window.innerWidth - margin) left = window.innerWidth - tpRect.width - margin;
    if (left < margin) left = margin;
    if (top + tpRect.height > window.innerHeight - margin) { top = rect.top - tpRect.height - margin; position = 'top'; }
  } else if (position === 'top') {
    left = rect.left + (rect.width - tpRect.width) / 2;
    top = rect.top - tpRect.height - margin;
    if (left + tpRect.width > window.innerWidth - margin) left = window.innerWidth - tpRect.width - margin;
    if (left < margin) left = margin;
    if (top < margin) { top = rect.bottom + margin; position = 'bottom'; }
  } else {
    left = (window.innerWidth - tpRect.width) / 2;
    top = (window.innerHeight - tpRect.height) / 2;
  }

  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
  tooltip.setAttribute('data-pos', position);
}

function initMain() {
  initNavigation();
  initCalendar();
  initProjects();
  initNotes();
  initDeferred();
  initDashboard();
  initNotesOverlay();
  initReports();
  initSpreadsheets();
  initPeek();
  switchView('dashboard');
  initLiquidEffects();
  initTour();
}

async function boot() {
  appState.users = await window.hiwayAPI.getUsers();
  const saved = await window.hiwayAPI.getData();
  appState.data = Object.assign({ tasks: {}, projects: [], notes: [], postponed: [], trash: [], spreadsheets: [], theme: 'light' }, saved);
  appState.data.notes.forEach(n => {
    if (!n.created) n.created = n.updated || new Date().toISOString();
  });
  autoRollover();
  appState.data.projects.forEach(p => { if (typeof p.completed !== 'boolean') p.completed = false; });
  initTheme();
  initPlatform();
  initAuth();
  if (appState.user) enterApp();
}

boot();
