/* HiWay - app logic */

const appState = {
  user: null,
  users: {},
  data: {
    tasks: {},
    projects: [],
    notes: [],
    postponed: [],
    trash: [],
    theme: 'dark'
  },
  currentView: 'dashboard',
  calDate: new Date(),
  calMode: 'month',
  selectedDate: new Date().toISOString().split('T')[0],
  selectedNoteId: null,
  charts: {},
  deferredMode: 'postponed'
};

let saveTimeout;

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
  return new Date(date).toISOString().split('T')[0];
}

function getNextDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}

function initTheme() {
  const savedTheme = appState.data.theme || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  appState.data.theme = next;
  scheduleSave();
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

function renderDashboard() {
  const allTasks = getAllTasks();
  const done = allTasks.filter(t => t.done).length;
  const total = allTasks.length;
  const thisWeekStart = getWeekStart(new Date());
  const weekDone = countTasksDone(thisWeekStart);
  const projects = appState.data.projects.length;
  const rate = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('kpi-done').textContent = done;
  document.getElementById('kpi-week').textContent = weekDone;
  document.getElementById('kpi-projects').textContent = projects;
  document.getElementById('kpi-rate').textContent = rate + '%';

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
    days.push({ key, total, done, dayName: d.toLocaleDateString('en-US', { weekday: 'short' }), isToday: key === today });
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
  const height = 110;
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
    return `
      <circle cx="${p.x}" cy="${p.y}" r="${radius}" class="${classes.join(' ')}" />
      ${core}
      <text x="${p.x}" y="${p.y + 34}" class="waypoint-label">${p.dayName}</text>
      ${dayPct}
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
}

function updateCharts() {
  if (!appState.charts.activity) {
    appState.charts.activity = new Chart(document.getElementById('activity-chart').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: getChartOptions()
    });
  }
  if (!appState.charts.distribution) {
    appState.charts.distribution = new Chart(document.getElementById('distribution-chart').getContext('2d'), {
      type: 'doughnut',
      data: { labels: [], datasets: [] },
      options: getChartOptions(false)
    });
  }
  if (!appState.charts.velocity) {
    appState.charts.velocity = new Chart(document.getElementById('velocity-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: getChartOptions()
    });
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
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
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
        bodyFont: { size: 13 }
      }
    },
    scales: showScales ? {
      x: { grid: { color: gridColor }, ticks: { color: textColor } },
      y: { grid: { color: gridColor }, ticks: { color: textColor, beginAtZero: true, precision: 0 } }
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

  if (appState.calMode === 'month') renderMonth(body);
  else if (appState.calMode === 'week') renderWeek(body);
  else renderDay(body);

  document.getElementById('cal-label').textContent = formatCalendarLabel();
  renderTaskPanel();
}

function formatCalendarLabel() {
  const d = appState.calDate;
  if (appState.calMode === 'day') return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderMonth(body) {
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
    body.appendChild(createDayCell(new Date(year, month - 1, prevTotal - i), true));
  }
  for (let i = 1; i <= totalDays; i++) {
    body.appendChild(createDayCell(new Date(year, month, i), false));
  }
  const remaining = (7 - ((firstDay + totalDays) % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    body.appendChild(createDayCell(new Date(year, month + 1, i), true));
  }
}

function renderWeek(body) {
  const start = getWeekStart(appState.calDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    body.appendChild(createDayCell(d, false, true));
  }
}

function renderDay(body) {
  body.style.gridTemplateColumns = '1fr';
  body.appendChild(createDayCell(appState.calDate, false, true, true));
}

function createDayCell(date, otherMonth, isWeek = false, isDay = false) {
  const key = dateKey(date);
  const todayKey = dateKey(new Date());
  const tasks = appState.data.tasks[key] || [];

  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (otherMonth) cell.classList.add('other-month');
  if (key === todayKey) cell.classList.add('today');
  if (key === appState.selectedDate) cell.classList.add('selected');
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
    renderCalendar();
  });

  return cell;
}

function renderTaskPanel() {
  document.getElementById('selected-date-label').textContent = 'Tasks for ' + appState.selectedDate;
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  const tasks = appState.data.tasks[appState.selectedDate] || [];
  tasks.forEach((task, idx) => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.innerHTML = `
      <span class="task-text">${escapeHtml(task.text)}</span>
      <div class="task-actions">
        <button class="action-btn done-btn" title="Complete">✓</button>
        <button class="action-btn postpone-btn" title="Postpone">↻</button>
        <button class="action-btn delete-btn" title="Delete">×</button>
      </div>
    `;
    li.querySelector('.done-btn').addEventListener('click', () => completeTask(idx));
    li.querySelector('.postpone-btn').addEventListener('click', () => openPostponeModal(idx));
    li.querySelector('.delete-btn').addEventListener('click', () => openDeleteModal(idx));
    list.appendChild(li);
  });
}

function addTaskForSelectedDate() {
  const input = document.getElementById('new-task-input');
  const text = input.value.trim();
  if (!text) return;
  if (!appState.data.tasks[appState.selectedDate]) appState.data.tasks[appState.selectedDate] = [];
  appState.data.tasks[appState.selectedDate].push({ text, done: false, id: uuid() });
  input.value = '';
  scheduleSave();
  renderCalendar();
}

function completeTask(idx) {
  const tasks = appState.data.tasks[appState.selectedDate];
  if (!tasks || !tasks[idx]) return;
  tasks[idx].done = !tasks[idx].done;
  scheduleSave();
  renderCalendar();
  renderDashboard();
}

function removeTaskAt(idx) {
  const tasks = appState.data.tasks[appState.selectedDate];
  const task = tasks[idx];
  tasks.splice(idx, 1);
  if (tasks.length === 0) delete appState.data.tasks[appState.selectedDate];
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
      appState.data.trash.push({ id: uuid(), text: removed.text, fromDate: appState.selectedDate, moved: new Date().toISOString() });
      scheduleSave();
      renderCalendar();
      renderDashboard();
      if (appState.currentView === 'deferred') renderDeferred();
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
    const removed = removeTaskAt(idx);
    if (mode === 'postponed') {
      appState.data.postponed.push({
        id: uuid(),
        text: removed.text,
        fromDate: appState.selectedDate,
        targetDate,
        moved: new Date().toISOString()
      });
    } else {
      if (!appState.data.tasks[targetDate]) appState.data.tasks[targetDate] = [];
      appState.data.tasks[targetDate].push({ text: removed.text, done: false, id: uuid() });
    }
    scheduleSave();
    renderCalendar();
    renderDashboard();
    if (appState.currentView === 'deferred') renderDeferred();
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

function restoreDeferredItem(idx, targetDate) {
  const items = appState.deferredMode === 'postponed' ? appState.data.postponed : appState.data.trash;
  const item = items[idx];
  if (!appState.data.tasks[targetDate]) appState.data.tasks[targetDate] = [];
  appState.data.tasks[targetDate].push({ text: item.text, done: false, id: uuid() });
  items.splice(idx, 1);
  scheduleSave();
  renderDeferred();
  renderCalendar();
  renderDashboard();
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
}

function addProject() {
  const input = document.getElementById('new-project-input');
  const title = input.value.trim();
  if (!title) return;
  appState.data.projects.push({ id: uuid(), title, steps: [], created: new Date().toISOString() });
  input.value = '';
  scheduleSave();
  renderProjects();
  renderDashboard();
}

function deleteProject(pid) {
  appState.data.projects = appState.data.projects.filter(p => p.id !== pid);
  scheduleSave();
  renderProjects();
  renderDashboard();
}

function addStep(pid, input) {
  const text = input.value.trim();
  if (!text) return;
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  project.steps.push({ text, done: false, id: uuid() });
  input.value = '';
  scheduleSave();
  renderProjects();
  renderDashboard();
}

function toggleStep(pid, sid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  const step = project.steps.find(s => s.id === sid);
  if (step) { step.done = !step.done; scheduleSave(); renderProjects(); renderDashboard(); }
}

function deleteStep(pid, sid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  project.steps = project.steps.filter(s => s.id !== sid);
  scheduleSave();
  renderProjects();
  renderDashboard();
}

function renderProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  appState.data.projects.forEach(project => {
    const total = project.steps.length;
    const done = project.steps.filter(s => s.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'project-card glass-card tilt-card';
    card.innerHTML = `
      <div class="project-header">
        <div>
          <div class="project-title">${escapeHtml(project.title)}</div>
          <div class="project-meta"><span>${done}/${total} steps</span><span>${pct}%</span></div>
        </div>
        <button class="project-delete" title="Delete project">×</button>
      </div>
      <div class="project-progress"><div class="project-progress-bar" style="width:${pct}%"></div></div>
      <ul class="project-steps"></ul>
      <div class="add-step-row">
        <input type="text" placeholder="Add a step...">
        <button>Add</button>
      </div>
    `;

    const stepsUl = card.querySelector('.project-steps');
    project.steps.forEach(step => {
      const li = document.createElement('li');
      li.className = 'project-step' + (step.done ? ' done' : '');
      li.innerHTML = `<div class="task-check">${step.done ? '✓' : ''}</div><span class="step-text">${escapeHtml(step.text)}</span>`;
      li.addEventListener('click', () => toggleStep(project.id, step.id));
      stepsUl.appendChild(li);
    });

    const stepInput = card.querySelector('.add-step-row input');
    card.querySelector('.add-step-row button').addEventListener('click', () => addStep(project.id, stepInput));
    stepInput.addEventListener('keydown', e => { if (e.key === 'Enter') addStep(project.id, stepInput); });
    card.querySelector('.project-delete').addEventListener('click', () => deleteProject(project.id));

    list.appendChild(card);
  });
}

/* Notes */
function initNotes() {
  document.getElementById('new-note-btn').addEventListener('click', createNote);
  document.getElementById('note-title').addEventListener('input', saveCurrentNote);
  document.getElementById('note-body').addEventListener('input', saveCurrentNote);
}

function createNote() {
  const note = { id: uuid(), title: 'New brainstorm', body: '', updated: new Date().toISOString() };
  appState.data.notes.unshift(note);
  scheduleSave();
  selectNote(note.id);
  renderNotes();
}

function selectNote(id) {
  appState.selectedNoteId = id;
  const note = appState.data.notes.find(n => n.id === id);
  if (!note) return;
  document.getElementById('note-title').value = note.title;
  document.getElementById('note-body').value = note.body;
  renderNotesList();
}

function saveCurrentNote() {
  const note = appState.data.notes.find(n => n.id === appState.selectedNoteId);
  if (!note) return;
  note.title = document.getElementById('note-title').value || 'Untitled';
  note.body = document.getElementById('note-body').value;
  note.updated = new Date().toISOString();
  scheduleSave();
  renderNotesList();
}

function deleteNote(id) {
  appState.data.notes = appState.data.notes.filter(n => n.id !== id);
  if (appState.selectedNoteId === id) appState.selectedNoteId = null;
  scheduleSave();
  renderNotes();
}

function renderNotes() {
  if (appState.data.notes.length > 0 && !appState.selectedNoteId) {
    appState.selectedNoteId = appState.data.notes[0].id;
    selectNote(appState.selectedNoteId);
  }
  renderNotesList();
}

function renderNotesList() {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  appState.data.notes.forEach(note => {
    const li = document.createElement('li');
    li.className = 'note-item' + (note.id === appState.selectedNoteId ? ' active' : '');
    li.innerHTML = `<h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.body).slice(0, 40)}</p>`;
    li.addEventListener('click', () => selectNote(note.id));

    const del = document.createElement('button');
    del.className = 'delete-task';
    del.textContent = '×';
    del.style.opacity = '0';
    del.addEventListener('click', e => { e.stopPropagation(); deleteNote(note.id); });
    li.appendChild(del);
    li.addEventListener('mouseenter', () => del.style.opacity = '1');
    li.addEventListener('mouseleave', () => del.style.opacity = '0');

    list.appendChild(li);
  });
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

  document.querySelectorAll('.nav-item, .cal-day, .task-item, .note-item, .modal-option, .action-btn').forEach(el => {
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

function initMain() {
  initNavigation();
  initCalendar();
  initProjects();
  initNotes();
  initDeferred();
  switchView('dashboard');
  initLiquidEffects();
}

async function boot() {
  appState.users = await window.hiwayAPI.getUsers();
  const saved = await window.hiwayAPI.getData();
  appState.data = Object.assign({ tasks: {}, projects: [], notes: [], postponed: [], trash: [], theme: 'dark' }, saved);
  initTheme();
  initAuth();
  if (appState.user) enterApp();
}

boot();
