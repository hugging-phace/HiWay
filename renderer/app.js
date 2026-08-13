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
    theme: 'light'
  },
  currentView: 'dashboard',
  calDate: new Date(),
  calMode: 'month',
  selectedDate: dateKey(new Date()),
  selectedBrainstormDay: null,
  selectedBrainstormNoteId: null,
  charts: {},
  deferredMode: 'postponed'
};

let saveTimeout;
let dashboardDetailType = null;
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

function getRolloverStats() {
  const today = dateKey(new Date());
  let overdue = 0;
  let total = 0;
  Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
    total += tasks.length;
    if (date < today) overdue += tasks.filter(t => !t.done).length;
  });
  return { overdue, rate: total ? Math.round((overdue / total) * 100) : 0 };
}

function getOpenProjectSteps() {
  return appState.data.projects.reduce((sum, p) => sum + p.steps.filter(s => !s.done).length, 0);
}

function renderDashboard() {
  const thisWeekStart = getWeekStart(new Date());
  const weekDone = countTasksDone(thisWeekStart);
  const weekTotal = countTasksTotal(thisWeekStart);
  const upcomingCount = getUpcomingCount();
  const { overdue, rate: rolloverRate } = getRolloverStats();
  const projects = appState.data.projects.length;
  const openSteps = getOpenProjectSteps();

  document.getElementById('kpi-week-done').textContent = weekDone;
  document.getElementById('kpi-week-total').textContent = weekTotal;
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

function openDashboardDetail(type) {
  dashboardDetailType = type;
  renderDashboardDetail(type);
  document.getElementById('dashboard-detail').classList.add('open');
}

function closeDashboardDetail() {
  document.getElementById('dashboard-detail').classList.remove('open');
  dashboardDetailType = null;
}

function refreshDashboardDetail() {
  if (dashboardDetailType) renderDashboardDetail(dashboardDetailType);
}

function buildDetailTaskItem(task, date, idx) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' done' : '');
  li.innerHTML = `
    <span class="task-text">${escapeHtml(task.text)}</span>
    <div class="task-actions">
      <button class="notes-btn ${task.notes ? 'has-notes' : ''}" title="Notes">📝</button>
      <button class="action-btn done-btn" title="Complete">✓</button>
      <button class="action-btn postpone-btn" title="Postpone">↻</button>
      <button class="action-btn delete-btn" title="Delete">×</button>
    </div>
  `;
  li.querySelector('.notes-btn').addEventListener('click', () => openTaskNotes(date, idx));
  li.querySelector('.done-btn').addEventListener('click', () => completeTaskForDate(date, idx));
  li.querySelector('.postpone-btn').addEventListener('click', () => openPostponeModalForDate(date, idx));
  li.querySelector('.delete-btn').addEventListener('click', () => openDeleteModalForDate(date, idx));
  return li;
}

function completeTaskForDate(date, idx) {
  appState.selectedDate = date;
  completeTask(idx);
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
  appState.data.tasks[key].push({ text, done: false, notes: '', id: uuid() });
  scheduleSave();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
}

function renderDashboardDetail(type) {
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

  if (type === 'week') {
    const start = getWeekStart(new Date());
    const weekDone = countTasksDone(start);
    const weekTotal = countTasksTotal(start);
    titleEl.textContent = 'Completed this Week';
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
    titleEl.textContent = 'Upcoming';
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
    valueEl.className = 'detail-value' + (overdue === 0 ? ' good' : rate <= 20 ? ' warn' : ' bad');
    subtitleEl.textContent = overdue === 0 ? 'You are on track' : `${overdue} task${overdue === 1 ? '' : 's'} rolled over`;
    const overdueTasks = [];
    Object.entries(appState.data.tasks).forEach(([date, tasks]) => {
      if (date >= today) return;
      tasks.forEach((task, idx) => { if (!task.done) overdueTasks.push({ date, task, idx }); });
    });
    overdueTasks.sort((a, b) => a.date.localeCompare(b.date));
    if (!overdueTasks.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No overdue tasks. You are on track.</div>';
    } else {
      let lastDate = null;
      overdueTasks.forEach(({ date, task, idx }) => {
        if (date !== lastDate) {
          const group = document.createElement('div');
          group.className = 'detail-date-group';
          const d = new Date(date);
          group.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          bodyEl.appendChild(group);
          lastDate = date;
        }
        bodyEl.appendChild(buildDetailTaskItem(task, date, idx));
      });
    }
    addEl.innerHTML = `
      <form class="detail-add-form">
        <input type="text" placeholder="Add a new task..." required>
        <input type="date" value="${today}" required>
        <button type="submit">Add Today</button>
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

  if (type === 'projects') {
    titleEl.textContent = 'Projects';
    valueEl.textContent = appState.data.projects.length;
    const activeProjects = appState.data.projects.filter(p => !p.steps.length || !p.steps.every(s => s.done)).length;
    const allDone = appState.data.projects.length && activeProjects === 0;
    subtitleEl.textContent = appState.data.projects.length ? (allDone ? 'all done' : `${activeProjects} active`) : 'start something big';
    if (!appState.data.projects.length) {
      bodyEl.innerHTML = '<div class="detail-empty">No projects yet. Create one below.</div>';
    } else {
      appState.data.projects.forEach(project => bodyEl.appendChild(buildProjectCard(project, 'detail-project glass-card')));
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
      appState.data.projects.push({ id: uuid(), title, steps: [], created: new Date().toISOString() });
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
  const shareBtn = document.getElementById('share-day-btn');
  shareBtn.style.display = appState.calMode === 'day' ? 'flex' : 'none';
  const list = document.getElementById('task-list');
  list.innerHTML = '';
  const tasks = appState.data.tasks[appState.selectedDate] || [];
  tasks.forEach((task, idx) => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.innerHTML = `
      <span class="task-text">${escapeHtml(task.text)}</span>
      <div class="task-actions">
        <button class="notes-btn ${task.notes ? 'has-notes' : ''}" title="Notes">📝</button>
        <button class="action-btn done-btn" title="Complete">✓</button>
        <button class="action-btn postpone-btn" title="Postpone">↻</button>
        <button class="action-btn delete-btn" title="Delete">×</button>
      </div>
    `;
    li.querySelector('.notes-btn').addEventListener('click', () => openTaskNotes(appState.selectedDate, idx));
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
  appState.data.tasks[appState.selectedDate].push({ text, done: false, notes: '', id: uuid() });
  input.value = '';
  scheduleSave();
  renderCalendar();
}

function completeTask(idx) {
  const tasks = appState.data.tasks[appState.selectedDate];
  if (!tasks || !tasks[idx]) return;
  const wasDone = tasks[idx].done;
  tasks[idx].done = !wasDone;
  scheduleSave();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
  if (!wasDone) openTaskNotes(appState.selectedDate, idx, true);
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
      appState.data.trash.push({ id: uuid(), text: removed.text, notes: removed.notes || '', fromDate: appState.selectedDate, moved: new Date().toISOString() });
      scheduleSave();
      renderCalendar();
      renderDashboard();
      if (appState.currentView === 'deferred') renderDeferred();
      refreshDashboardDetail();
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
        notes: removed.notes || '',
        fromDate: appState.selectedDate,
        targetDate,
        moved: new Date().toISOString()
      });
    } else {
      if (!appState.data.tasks[targetDate]) appState.data.tasks[targetDate] = [];
      appState.data.tasks[targetDate].push({ text: removed.text, done: false, notes: removed.notes || '', id: uuid() });
    }
    scheduleSave();
    renderCalendar();
    renderDashboard();
    if (appState.currentView === 'deferred') renderDeferred();
    refreshDashboardDetail();
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
  const key = dateKey(targetDate);
  if (!appState.data.tasks[key]) appState.data.tasks[key] = [];
  appState.data.tasks[key].push({ text: item.text, done: false, notes: item.notes || '', id: uuid() });
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
  refreshDashboardDetail();
}

function deleteProject(pid) {
  appState.data.projects = appState.data.projects.filter(p => p.id !== pid);
  scheduleSave();
  renderProjects();
  renderDashboard();
  refreshDashboardDetail();
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
  refreshDashboardDetail();
}

function toggleStep(pid, sid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  const step = project.steps.find(s => s.id === sid);
  if (step) { step.done = !step.done; scheduleSave(); renderProjects(); renderDashboard(); refreshDashboardDetail(); }
}

function deleteStep(pid, sid) {
  const project = appState.data.projects.find(p => p.id === pid);
  if (!project) return;
  project.steps = project.steps.filter(s => s.id !== sid);
  scheduleSave();
  renderProjects();
  renderDashboard();
  refreshDashboardDetail();
}

function buildProjectCard(project, cardClass = 'project-card glass-card tilt-card') {
  const total = project.steps.length;
  const done = project.steps.filter(s => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const card = document.createElement('div');
  card.className = cardClass;
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

  return card;
}

function renderProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  appState.data.projects.forEach(project => list.appendChild(buildProjectCard(project)));
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
  document.getElementById('notes-overlay').addEventListener('click', e => { if (e.target === document.getElementById('notes-overlay')) closeNotesOverlay(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('notes-overlay').classList.contains('open')) closeNotesOverlay(); });
}

function openTaskNotes(date, idx, fromComplete = false) {
  const tasks = appState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  notesTarget = { date, idx };
  const task = tasks[idx];
  document.getElementById('notes-text').value = task.notes || '';
  document.querySelector('#notes-overlay h3').textContent = fromComplete ? 'Add completion notes' : 'Task Notes';
  document.getElementById('notes-overlay').classList.add('open');
  setTimeout(() => document.getElementById('notes-text').focus(), 50);
}

function saveTaskNotes() {
  if (!notesTarget) return;
  const tasks = appState.data.tasks[notesTarget.date];
  if (!tasks || !tasks[notesTarget.idx]) return;
  tasks[notesTarget.idx].notes = document.getElementById('notes-text').value.trim();
  scheduleSave();
  renderCalendar();
  renderDashboard();
  refreshDashboardDetail();
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
  if (tasks.length === 0) {
    openModal("Share today's list", '<p style="color:var(--muted)">No tasks on this day to share.</p>', 'Close', () => {});
    return;
  }
  const lines = tasks.map(t => `${t.done ? '- [x]' : '- [ ]'} ${t.text}${t.notes ? ' (' + t.notes + ')' : ''}`);
  const text = `Some things on my to-do list for today:\n${lines.join('\n')}`;
  const body = `<textarea id="share-text" class="share-text" readonly>${escapeHtml(text)}</textarea>`;
  openModal("Share today's list", body, 'Copy to clipboard', () => {
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
      if (date < start || date > end) return;
      tasks.forEach(task => {
        if (task.done) taskRows.push({ date, text: task.text, notes: task.notes || '' });
      });
    });
    taskRows.sort((a, b) => a.date.localeCompare(b.date));
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
      ['Date', 'Task', 'Status', 'Notes']
    ];
    taskRows.forEach(row => {
      taskData.push([{ format: 'date', value: new Date(row.date + 'T00:00:00') }, row.text, 'Completed', row.notes]);
    });
    sheets.push({ name: 'Completed Tasks', freeze: { rows: 1 }, cols: '14,40,14,50', data: taskData });
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

function initMain() {
  initNavigation();
  initCalendar();
  initProjects();
  initNotes();
  initDeferred();
  initDashboard();
  initNotesOverlay();
  initReports();
  switchView('dashboard');
  initLiquidEffects();
}

async function boot() {
  appState.users = await window.hiwayAPI.getUsers();
  const saved = await window.hiwayAPI.getData();
  appState.data = Object.assign({ tasks: {}, projects: [], notes: [], postponed: [], trash: [], theme: 'light' }, saved);
  appState.data.notes.forEach(n => {
    if (!n.created) n.created = n.updated || new Date().toISOString();
  });
  initTheme();
  initPlatform();
  initAuth();
  if (appState.user) enterApp();
}

boot();
