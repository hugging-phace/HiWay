/* Onward Mobile */

const mobileState = {
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
  currentView: 'dashboard'
};

let saveTimeout;
let authMode = 'login';

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

function formatShortDate(date) {
  const key = dateKey(date);
  const d = new Date(key + 'T00:00:00');
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (window.hiwayAPI && window.hiwayAPI.saveData) {
      window.hiwayAPI.saveData(mobileState.data);
    }
  }, 400);
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 2200);
}

function initTheme() {
  const saved = mobileState.data.theme || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  mobileState.data.theme = next;
  scheduleSave();
}

function autoRollover() {
  const today = dateKey(new Date());
  const moves = [];
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    if (date >= today) return;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (!task.done) moves.push({ from: date, idx: i, task });
    }
  });
  moves.forEach(({ from, idx, task }) => {
    mobileState.data.tasks[from].splice(idx, 1);
    if (mobileState.data.tasks[from].length === 0) delete mobileState.data.tasks[from];
    if (!mobileState.data.tasks[today]) mobileState.data.tasks[today] = [];
    mobileState.data.tasks[today].push(task);
    task.plantedDate = task.plantedDate || from;
    updateProjectStepDate(task, today);
  });
  if (moves.length) scheduleSave();
}

function updateProjectStepDate(task, newDate) {
  if (!task.projectId) return;
  const p = mobileState.data.projects.find(pr => pr.id === task.projectId);
  if (!p) return;
  const step = p.steps.find(s => s.id === task.id);
  if (step) step.date = newDate;
}

function getTodayStats() {
  const today = dateKey(new Date());
  const tasks = mobileState.data.tasks[today] || [];
  const done = tasks.filter(t => t.done).length;
  return { today, done, total: tasks.length };
}

function getUpcomingCount() {
  const today = dateKey(new Date());
  let count = 0;
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    if (date <= today) return;
    count += tasks.filter(t => !t.done).length;
  });
  return count;
}

function getRolloverStats() {
  let rolled = 0;
  let total = 0;
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    tasks.forEach(task => {
      total++;
      if (!task.done && task.plantedDate && task.plantedDate !== date) rolled++;
    });
  });
  return { overdue: rolled, rate: total ? Math.round((rolled / total) * 100) : 0 };
}

function getRolledTasks() {
  const today = dateKey(new Date());
  const list = [];
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    tasks.forEach((task, idx) => {
      if (task.done) return;
      if (task.plantedDate && task.plantedDate !== date) {
        const planted = new Date(task.plantedDate + 'T00:00:00');
        const now = new Date(today + 'T00:00:00');
        const daysOver = Math.max(0, Math.floor((now - planted) / (1000 * 60 * 60 * 24)));
        list.push({ date, idx, task, daysOver });
      } else if (date < today) {
        const d = new Date(date + 'T00:00:00');
        const now = new Date(today + 'T00:00:00');
        const daysOver = Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
        list.push({ date, idx, task, daysOver });
      }
    });
  });
  list.sort((a, b) => b.daysOver - a.daysOver || a.date.localeCompare(b.date));
  return list;
}

function getRecentWins(limit = 5) {
  const wins = [];
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    tasks.filter(t => t.done).forEach(t => wins.push({ text: t.text, date }));
  });
  wins.sort((a, b) => new Date(b.date) - new Date(a.date));
  return wins.slice(0, limit);
}

function getProjectOpenSteps() {
  return mobileState.data.projects.reduce((sum, p) => sum + p.steps.filter(s => !s.done).length, 0);
}

function findTaskByIdWithDate(id) {
  for (const [date, tasks] of Object.entries(mobileState.data.tasks)) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) return { date, idx, task: tasks[idx] };
  }
  return null;
}

function getProjectById(id) {
  return mobileState.data.projects.find(p => p.id === id);
}

function createTask(text, date, notes = '', plantedDate = null, id = null, projectId = null, done = false) {
  return {
    text,
    done: !!done,
    notes: notes || '',
    plantedDate: plantedDate || dateKey(date),
    completedDate: done ? dateKey(new Date()) : null,
    id: id || uuid(),
    projectId: projectId || null,
    spreadsheetId: null
  };
}

function createProject(title) {
  return {
    id: uuid(),
    title: title.trim(),
    steps: [],
    completed: false,
    created: dateKey(new Date())
  };
}

/* Auth */
function initAuth() {
  const toggle = document.getElementById('auth-toggle');
  toggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      authMode = btn.dataset.mode;
      toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const confirm = document.getElementById('auth-confirm');
      confirm.style.display = authMode === 'create' ? 'block' : 'none';
      document.getElementById('auth-error').textContent = '';
    });
  });

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm = document.getElementById('auth-confirm').value;
    const users = mobileState.users;

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
      mobileState.user = username;
    } else {
      if (!users[username] || users[username].password !== password) {
        document.getElementById('auth-error').textContent = 'Invalid username or password.';
        return;
      }
      mobileState.user = username;
    }
    enterApp();
  });
}

function enterApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('main-screen').classList.add('active');
  document.getElementById('current-user').textContent = '@' + mobileState.user;
  initNavigation();
  setView('dashboard');
}

/* Navigation */
function initNavigation() {
  document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function setView(view) {
  mobileState.currentView = view;
  document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  const content = document.getElementById('mobile-content');
  content.innerHTML = '';
  content.scrollTop = 0;
  if (view === 'dashboard') renderDashboard(content);
  else if (view === 'calendar') renderCalendar(content);
  else if (view === 'catchup') renderCatchUp(content);
  else if (view === 'projects') renderProjects(content);
  else if (view === 'more') renderMore(content);
}

/* Dashboard */
function renderDashboard(container) {
  const { today, done, total } = getTodayStats();
  const upcoming = getUpcomingCount();
  const projects = mobileState.data.projects.filter(p => !p.completed).length;
  const { overdue, rate } = getRolloverStats();
  const rolled = getRolledTasks();
  const wins = getRecentWins(3);

  const greeting = `<div class='greeting'>Good day, @${escapeHtml(mobileState.user)}<span>Here is where you stand.</span></div>`;

  const focusCard = rolled.length ? `
    <div class='mobile-tile' style='background: linear-gradient(135deg, rgba(75,75,184,0.12), rgba(163,79,240,0.12));'>
      <h3>Focus</h3>
      <div style='font-size:1.05rem;font-weight:700;margin-bottom:6px;'>${rolled.length} rolled-over task${rolled.length === 1 ? '' : 's'} need${rolled.length === 1 ? 's' : ''} attention</div>
      <p class='subtle-text'>Tap Catch Up to get suggestions.</p>
    </div>
  ` : '';

  const todayTasks = (mobileState.data.tasks[today] || []).slice(0, 4);
  const todayList = todayTasks.length ? `
    <ul class='task-list' style='margin-top:10px;'>
      ${todayTasks.map((t, i) => `
        <li class='task-item'>
          <span class='task-text ${t.done ? 'done' : ''}'>${escapeHtml(t.text)}</span>
          <div class='task-actions'>
            <button class='done-btn' data-date='${today}' data-idx='${i}'>${t.done ? '↩' : '✓'}</button>
          </div>
        </li>
      `).join('')}
    </ul>
  ` : `<p class='empty-state'>No tasks for today yet.</p>`;

  container.innerHTML = `
    ${greeting}
    ${focusCard}
    <div class='mobile-tile' data-open='today'>
      <h3>Today\'s Task</h3>
      <span class='kpi-value'>${done}/${total}</span>
      <span class='kpi-sub'>${total - done} left today</span>
      ${todayList}
    </div>
    <div class='tile-row'>
      <div class='mobile-tile' data-open='upcoming'>
        <h3>Upcoming</h3>
        <span class='kpi-value'>${upcoming}</span>
        <span class='kpi-sub'>${upcoming ? 'ahead of you' : 'all caught up'}</span>
      </div>
      <div class='mobile-tile' data-open='projects'>
        <h3>Projects</h3>
        <span class='kpi-value'>${projects}</span>
        <span class='kpi-sub'>${getProjectOpenSteps()} steps left</span>
      </div>
    </div>
    <div class='mobile-tile' data-open='rollover'>
      <h3>Rollover Rate</h3>
      <span class='kpi-value'>${rate}%</span>
      <span class='kpi-sub'>${overdue ? 'needs attention' : 'on track'}</span>
    </div>
    ${wins.length ? `
      <div class='section-title'>Recent Wins</div>
      <div class='mobile-tile'>
        <ul class='wins-list'>
          ${wins.map(w => `<li><span>${escapeHtml(w.text)}</span><span class='win-date'>${formatShortDate(w.date)}</span></li>`).join('')}
        </ul>
      </div>
    ` : ''}
  `;

  container.querySelectorAll('.done-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const date = btn.dataset.date;
      const idx = Number(btn.dataset.idx);
      toggleTaskDone(date, idx);
      renderDashboard(container);
    });
  });

  container.querySelectorAll('[data-open]').forEach(tile => {
    tile.addEventListener('click', () => {
      const type = tile.dataset.open;
      if (type === 'today') openDayFlipOut(dateKey(new Date()));
      if (type === 'upcoming') openUpcomingFlipOut();
      if (type === 'projects') setView('projects');
      if (type === 'rollover') setView('catchup');
    });
  });
}

function toggleTaskDone(date, idx) {
  const task = mobileState.data.tasks[date][idx];
  task.done = !task.done;
  task.completedDate = task.done ? dateKey(new Date()) : null;
  if (task.projectId) {
    const p = getProjectById(task.projectId);
    if (p) {
      const step = p.steps.find(s => s.id === task.id);
      if (step) step.done = task.done;
    }
  }
  scheduleSave();
  toast(task.done ? 'Completed' : 'Reopened');
}

/* Calendar */
function renderCalendar(container) {
  const today = dateKey(new Date());
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(dateKey(d));
  }

  container.innerHTML = `
    <div class='section-title'>Next 14 days</div>
    ${days.map((date, i) => {
      const count = (mobileState.data.tasks[date] || []).filter(t => !t.done).length;
      const d = new Date(date + 'T00:00:00');
      const name = i18nDay(d.getDay());
      const isToday = date === today;
      return `
        <div class='day-row ${isToday ? 'today' : ''}' data-date='${date}'>
          <div class='day-info'>
            <span class='day-name'>${isToday ? 'Today' : name}</span>
            <span class='day-date'>${formatShortDate(date)}</span>
          </div>
          <span class='day-count ${count ? '' : 'zero'}'>${count}</span>
        </div>
      `;
    }).join('')}
  `;

  container.querySelectorAll('.day-row').forEach(row => {
    row.addEventListener('click', () => openDayFlipOut(row.dataset.date));
  });
}

function i18nDay(index) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index];
}

function openDayFlipOut(date) {
  const tasks = mobileState.data.tasks[date] || [];
  const label = formatShortDate(date);
  openFlipOut({
    title: label,
    renderBody: body => {
      if (!tasks.length) {
        body.innerHTML = '<p class="empty-state">No tasks for this day.</p>';
      } else {
        body.innerHTML = `<ul class='task-list'>${tasks.map((t, i) => `
          <li class='task-item'>
            <span class='task-text ${t.done ? 'done' : ''}'>${escapeHtml(t.text)}</span>
            <div class='task-actions'>
              <button class='done-btn' data-idx='${i}'>${t.done ? '↩' : '✓'}</button>
              <button class='delete-btn' data-idx='${i}'>×</button>
            </div>
          </li>
        `).join('')}</ul>`;
      }
      body.innerHTML += `
        <div class='add-row'>
          <input type='text' id='add-task' class='glass-input' placeholder='Add a task...'>
          <button id='add-task-btn'>+</button>
        </div>
      `;

      body.querySelectorAll('.done-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          toggleTaskDone(date, Number(btn.dataset.idx));
          openDayFlipOut(date);
        });
      });
      body.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => confirmDelete(date, Number(btn.dataset.idx)));
      });
      const input = body.querySelector('#add-task');
      const addBtn = body.querySelector('#add-task-btn');
      const add = () => {
        const text = input.value.trim();
        if (!text) return;
        addTask(date, text);
        input.value = '';
        openDayFlipOut(date);
      };
      addBtn.addEventListener('click', add);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    }
  });
}

function openUpcomingFlipOut() {
  const today = dateKey(new Date());
  const upcoming = [];
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    if (date <= today) return;
    tasks.forEach((task, idx) => { if (!task.done) upcoming.push({ date, idx, task }); });
  });
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  openFlipOut({
    title: 'Upcoming Tasks',
    renderBody: body => {
      if (!upcoming.length) {
        body.innerHTML = '<p class="empty-state">No upcoming tasks. You are all caught up.</p>';
        return;
      }
      body.innerHTML = `<ul class='task-list'>${upcoming.map(({ date, idx, task }) => `
        <li class='task-item'>
          <div style='flex:1;'>
            <div class='task-text'>${escapeHtml(task.text)}</div>
            <div class='catch-meta'>${formatShortDate(date)}</div>
          </div>
          <div class='task-actions'>
            <button class='done-btn' data-date='${date}' data-idx='${idx}'>✓</button>
          </div>
        </li>
      `).join('')}</ul>`;
      body.querySelectorAll('.done-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          toggleTaskDone(btn.dataset.date, Number(btn.dataset.idx));
          openUpcomingFlipOut();
        });
      });
    }
  });
}

function addTask(date, text) {
  if (!mobileState.data.tasks[date]) mobileState.data.tasks[date] = [];
  mobileState.data.tasks[date].push(createTask(text, date));
  scheduleSave();
  toast('Task added');
}

function confirmDelete(date, idx) {
  const task = mobileState.data.tasks[date][idx];
  showModal('Move to trash?', `"${escapeHtml(task.text)}" will be moved to trash.`, () => {
    const [removed] = mobileState.data.tasks[date].splice(idx, 1);
    if (mobileState.data.tasks[date].length === 0) delete mobileState.data.tasks[date];
    removed.deletedFrom = date;
    mobileState.data.trash.push(removed);
    scheduleSave();
    toast('Moved to trash');
    closeFlipOut();
  });
}

/* Catch Up */
function renderCatchUp(container) {
  const rolled = getRolledTasks();
  const today = dateKey(new Date());

  container.innerHTML = `
    <div class='section-title'>Catch Up</div>
    <p class='subtle-text' style='margin-bottom:16px;'>Smart suggestions for tasks that rolled over.</p>
    ${rolled.length ? rolled.map(({ date, idx, task, daysOver }) => `
      <div class='mobile-tile catch-card' data-date='${date}' data-idx='${idx}'>
        <div class='catch-title'>${escapeHtml(task.text)}</div>
        <div class='catch-meta'>${daysOver ? `${daysOver} day${daysOver === 1 ? '' : 's'} overdue` : 'Rolled over'} · originally ${formatShortDate(task.plantedDate || date)}</div>
        <div class='suggestion-row'>
          <button class='primary do-it'>Quick win</button>
          <button class='move-today'>Move to today</button>
          <button class='snooze'>Snooze 1 day</button>
          <button class='break'>Break into steps</button>
          <button class='drop' style='color:var(--danger);'>Drop</button>
        </div>
      </div>
    `).join('') : `<div class='mobile-tile'><p class='empty-state'>No rolled-over tasks. Great job.</p></div>`}
  `;

  container.querySelectorAll('.catch-card').forEach(card => {
    const date = card.dataset.date;
    const idx = Number(card.dataset.idx);
    const task = mobileState.data.tasks[date][idx];

    card.querySelector('.do-it').addEventListener('click', () => {
      toggleTaskDone(date, idx);
      renderCatchUp(container);
    });
    card.querySelector('.move-today').addEventListener('click', () => {
      moveTaskToDate(date, idx, today);
      renderCatchUp(container);
    });
    card.querySelector('.snooze').addEventListener('click', () => {
      const tomorrow = new Date(today + 'T00:00:00');
      tomorrow.setDate(tomorrow.getDate() + 1);
      moveTaskToDate(date, idx, dateKey(tomorrow));
      renderCatchUp(container);
    });
    card.querySelector('.break').addEventListener('click', () => {
      splitToProject(date, idx);
      renderCatchUp(container);
    });
    card.querySelector('.drop').addEventListener('click', () => confirmDelete(date, idx));
  });
}

function moveTaskToDate(fromDate, idx, toDate) {
  const [task] = mobileState.data.tasks[fromDate].splice(idx, 1);
  if (mobileState.data.tasks[fromDate].length === 0) delete mobileState.data.tasks[fromDate];
  if (!mobileState.data.tasks[toDate]) mobileState.data.tasks[toDate] = [];
  mobileState.data.tasks[toDate].push(task);
  updateProjectStepDate(task, toDate);
  scheduleSave();
  toast('Moved');
}

function splitToProject(date, idx) {
  const task = mobileState.data.tasks[date][idx];
  const project = createProject(task.text);
  project.steps = [
    { id: uuid(), text: 'Define the first step', date: dateKey(new Date()), done: false },
    { id: uuid(), text: 'Schedule focused time', date: dateKey(new Date()), done: false },
    { id: uuid(), text: 'Complete and review', date: dateKey(new Date()), done: false }
  ];
  mobileState.data.projects.unshift(project);
  mobileState.data.tasks[date].splice(idx, 1);
  if (mobileState.data.tasks[date].length === 0) delete mobileState.data.tasks[date];
  project.steps.forEach(step => {
    const key = dateKey(new Date());
    if (!mobileState.data.tasks[key]) mobileState.data.tasks[key] = [];
    mobileState.data.tasks[key].push(createTask(step.text, key, '', key, step.id, project.id));
  });
  scheduleSave();
  toast('Created project from task');
}

/* Projects */
function renderProjects(container) {
  const active = mobileState.data.projects.filter(p => !p.completed);
  container.innerHTML = `
    <div class='section-title'>Active Projects</div>
    <div class='add-row'>
      <input type='text' id='new-project' class='glass-input' placeholder='New project or big idea...'>
      <button id='add-project-btn'>+</button>
    </div>
    ${active.length ? active.map(p => renderProjectCard(p)).join('') : `<div class='mobile-tile'><p class='empty-state'>No active projects. Start one above.</p></div>`}
  `;

  const input = container.querySelector('#new-project');
  container.querySelector('#add-project-btn').addEventListener('click', () => {
    const title = input.value.trim();
    if (!title) return;
    addProject(title);
    input.value = '';
    renderProjects(container);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') container.querySelector('#add-project-btn').click(); });

  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openProjectFlipOut(card.dataset.id));
  });
}

function renderProjectCard(project) {
  const total = project.steps.length;
  const done = project.steps.filter(s => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `
    <div class='mobile-tile project-card' data-id='${project.id}'>
      <div class='project-title'>${escapeHtml(project.title)}</div>
      <div class='project-meta'><span>${done}/${total} steps</span><span>${pct}%</span></div>
      <div class='project-progress'><div class='project-progress-bar' style='width:${pct}%'></div></div>
      ${project.steps.slice(0, 3).map(s => `
        <div class='project-step ${s.done ? 'done' : ''}'>
          <span class='step-dot'>✓</span>
          <span>${escapeHtml(s.text)}</span>
        </div>
      `).join('')}
      ${total > 3 ? `<div class='subtle-text' style='margin-top:8px;'>+ ${total - 3} more</div>` : ''}
    </div>
  `;
}

function addProject(title) {
  mobileState.data.projects.unshift(createProject(title));
  scheduleSave();
  toast('Project created');
}

function openProjectFlipOut(pid) {
  const project = getProjectById(pid);
  if (!project) return;

  openFlipOut({
    title: escapeHtml(project.title),
    renderBody: body => {
      const total = project.steps.length;
      const done = project.steps.filter(s => s.done).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      body.innerHTML = `
        <div style='margin-bottom:14px;'>
          <div class='project-meta'><span>${done}/${total} steps</span><span>${pct}%</span></div>
          <div class='project-progress'><div class='project-progress-bar' style='width:${pct}%'></div></div>
        </div>
        <ul class='project-steps' id='flipout-steps'>
          ${project.steps.length ? project.steps.map(s => `
            <li class='project-step ${s.done ? 'done' : ''}' data-sid='${s.id}'>
              <span class='step-dot'>✓</span>
              <span>${escapeHtml(s.text)}</span>
            </li>
          `).join('') : `<li class='empty-state'>No steps yet.</li>`}
        </ul>
        <div class='add-row' style='margin-top:16px;'>
          <input type='text' id='new-step' class='glass-input' placeholder='Add a step...'>
          <input type='date' id='new-step-date' class='glass-input' value='${dateKey(new Date())}' style='flex:0.8;'>
          <button id='add-step-btn'>+</button>
        </div>
      `;

      body.querySelectorAll('.project-step').forEach(li => {
        li.addEventListener('click', () => {
          toggleStep(pid, li.dataset.sid);
          openProjectFlipOut(pid);
        });
      });

      const text = body.querySelector('#new-step');
      const dateInput = body.querySelector('#new-step-date');
      body.querySelector('#add-step-btn').addEventListener('click', () => {
        addStep(pid, text.value, dateInput.value);
        text.value = '';
        openProjectFlipOut(pid);
      });
    },
    actions: `
      <button class='secondary-btn' id='delete-project' style='color:var(--danger);'>Delete</button>
      <button class='primary-btn' id='mark-project' style='flex:2;'>${project.completed ? 'Reactivate' : 'Mark complete'}</button>
    `
  });

  setTimeout(() => {
    document.getElementById('delete-project').addEventListener('click', () => {
      showModal('Delete project?', 'This will delete the project and its steps.', () => {
        deleteProject(pid);
        closeFlipOut();
      });
    });
    document.getElementById('mark-project').addEventListener('click', () => {
      project.completed = !project.completed;
      scheduleSave();
      toast(project.completed ? 'Project completed' : 'Project reactivated');
      closeFlipOut();
    });
  }, 50);
}

function addStep(pid, text, dateVal) {
  const project = getProjectById(pid);
  if (!project) return;
  const clean = (typeof text === 'string' ? text : text.value).trim();
  if (!clean) return;
  const key = dateVal || dateKey(new Date());
  const stepId = uuid();
  project.steps.push({ id: stepId, text: clean, date: key, done: false });
  if (!mobileState.data.tasks[key]) mobileState.data.tasks[key] = [];
  mobileState.data.tasks[key].push(createTask(clean, key, '', key, stepId, pid));
  scheduleSave();
  toast('Step added');
}

function toggleStep(pid, sid) {
  const project = getProjectById(pid);
  if (!project) return;
  const step = project.steps.find(s => s.id === sid);
  if (!step) return;
  const found = findTaskByIdWithDate(sid);
  if (found) {
    found.task.done = !found.task.done;
    found.task.completedDate = found.task.done ? dateKey(new Date()) : null;
    step.done = found.task.done;
    step.date = found.date;
  } else {
    step.done = !step.done;
  }
  scheduleSave();
  toast(step.done ? 'Step completed' : 'Step reopened');
}

function deleteProject(pid) {
  const p = getProjectById(pid);
  if (!p) return;
  p.steps.forEach(s => {
    const found = findTaskByIdWithDate(s.id);
    if (found) {
      mobileState.data.tasks[found.date].splice(found.idx, 1);
      if (mobileState.data.tasks[found.date].length === 0) delete mobileState.data.tasks[found.date];
    }
  });
  mobileState.data.projects = mobileState.data.projects.filter(pr => pr.id !== pid);
  scheduleSave();
  toast('Project deleted');
  setView('projects');
}

/* More */
function renderMore(container) {
  container.innerHTML = `
    <div class='section-title'>More</div>
    <ul class='more-list'>
      <li data-item='spreadsheets'><span>▦ Spreadsheets</span><span class='icon'>›</span></li>
      <li data-item='reports'><span>▤ Reports</span><span class='icon'>›</span></li>
      <li data-item='brainstorm'><span>✦ Brainstorm</span><span class='icon'>›</span></li>
      <li data-item='deferred'><span>⧗ Deferred</span><span class='icon'>›</span></li>
      <li data-item='logout'><span>⎋ Log out</span><span class='icon'>›</span></li>
    </ul>
  `;

  container.querySelectorAll('.more-list li').forEach(li => {
    li.addEventListener('click', () => {
      const item = li.dataset.item;
      if (item === 'logout') {
        mobileState.user = null;
        document.getElementById('main-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.add('active');
        return;
      }
      openPlaceholder(item);
    });
  });
}

function openPlaceholder(name) {
  const titles = {
    spreadsheets: 'Spreadsheets',
    reports: 'Reports',
    brainstorm: 'Brainstorm',
    deferred: 'Deferred'
  };
  openFlipOut({
    title: titles[name] || name,
    renderBody: body => {
      body.innerHTML = `
        <div style='text-align:center;padding:40px 0;'>
          <div style='font-size:3rem;margin-bottom:12px;'>☁</div>
          <p style='font-weight:700;margin-bottom:8px;'>Not available on mobile yet</p>
          <p class='subtle-text'>This feature is designed for the desktop app. Cloud sync is coming so your data stays connected across devices.</p>
        </div>
      `;
    }
  });
}

/* Flip-out UI */
function openFlipOut({ title, renderBody, actions = '' }) {
  const flipout = document.getElementById('flipout');
  const titleEl = document.getElementById('flipout-title');
  const bodyEl = document.getElementById('flipout-body');
  const actionsEl = document.getElementById('flipout-actions');

  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  renderBody(bodyEl);
  actionsEl.innerHTML = actions || `<button class='secondary-btn' id='flipout-close-btn' style='width:100%;'>Close</button>`;
  flipout.classList.add('active');

  document.getElementById('flipout-close').onclick = closeFlipOut;
  const closeBtn = document.getElementById('flipout-close-btn');
  if (closeBtn) closeBtn.onclick = closeFlipOut;
}

function closeFlipOut() {
  document.getElementById('flipout').classList.remove('active');
}

/* Modal */
function showModal(title, body, onConfirm) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  modal.classList.add('active');

  const confirm = document.getElementById('modal-confirm');
  const cancel = document.getElementById('modal-cancel');

  const handler = () => {
    modal.classList.remove('active');
    onConfirm();
    confirm.removeEventListener('click', handler);
    cancel.removeEventListener('click', close);
  };
  const close = () => {
    modal.classList.remove('active');
    confirm.removeEventListener('click', handler);
    cancel.removeEventListener('click', close);
  };

  confirm.addEventListener('click', handler);
  cancel.addEventListener('click', close);
}

/* Boot */
async function boot() {
  if (!window.hiwayAPI) {
    document.getElementById('auth-error').textContent = 'Onward mobile must run inside the Onward app or a local server with test-mock.';
    return;
  }
  mobileState.users = await window.hiwayAPI.getUsers();
  const saved = await window.hiwayAPI.getData();
  mobileState.data = Object.assign({ tasks: {}, projects: [], notes: [], postponed: [], trash: [], spreadsheets: [], theme: 'light' }, saved);
  autoRollover();
  initTheme();
  initAuth();
  document.getElementById('flipout').addEventListener('click', e => {
    if (e.target === document.getElementById('flipout') || e.target.classList.contains('flipout-backdrop')) closeFlipOut();
  });
}

boot();
