/* Onward Mobile */

const DEFAULT_DATA = {
  tasks: {},
  projects: [],
  notes: [],
  postponed: [],
  trash: [],
  spreadsheets: [],
  recurring: [],
  theme: 'light',
  soundMuted: false,
  haptic: true
};

const mobileState = {
  user: null,
  users: {},
  data: Object.assign({}, DEFAULT_DATA),
  currentView: 'dashboard'
};

const appState = mobileState;
let settingsPopoutOpen = false;

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

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

async function resumeAudio() {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') {
    try { await ctx.resume(); } catch (e) {}
  }
  return ctx;
}

function unlockAudioContext() {
  resumeAudio().catch(() => {});
}

function isSoundMuted() {
  return !!(mobileState.data && mobileState.data.soundMuted);
}

async function playSound(type) {
  window._soundPlayedThisClick = true;
  if (isSoundMuted()) return;
  try {
    const ctx = await resumeAudio();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0.0001, t);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.5;
    filter.connect(master);
    let dur = 0.12;

    function tone(freqStart, freqEnd, gain, attack, decay, filterFreq, wave = 'sine') {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.connect(filter);
      filter.frequency.setValueAtTime(filterFreq, t);
      osc.frequency.setValueAtTime(freqStart, t);
      if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + decay);
      master.gain.linearRampToValueAtTime(gain, t + attack);
      master.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.start(t);
      osc.stop(t + decay);
    }

    switch (type) {
      case 'click': tone(820, 480, 0.035, 0.006, 0.14, 900, 'sine'); dur = 0.14; break;
      case 'complete': {
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.connect(filter);
        filter.frequency.setValueAtTime(2400, t);
        osc1.frequency.setValueAtTime(523.25, t);
        osc1.frequency.setValueAtTime(659.25, t + 0.12);
        master.gain.linearRampToValueAtTime(0.16, t + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc1.start(t);
        osc1.stop(t + 0.6);
        dur = 0.6;
        break;
      }
      case 'delete': tone(160, 80, 0.14, 0.005, 0.14, 900, 'triangle'); dur = 0.14; break;
      case 'confirm': tone(440, 550, 0.12, 0.015, 0.35, 2600, 'sine'); dur = 0.35; break;
      case 'open': tone(280, 520, 0.07, 0.02, 0.22, 1800, 'sine'); dur = 0.22; break;
      case 'defer': tone(420, 300, 0.06, 0.02, 0.22, 1600, 'sine'); dur = 0.22; break;
      case 'project': tone(180, 130, 0.1, 0.01, 0.18, 700, 'triangle'); dur = 0.18; break;
    }
  } catch (e) {}
}

function initAmbientSounds() {
  const SOUNDABLE = 'button, .nav-item, .mobile-tile, .day-row, .catch-card, .more-list li, .note-card, .deferred-card, .modal-option, .action-btn, .recurring-card, .recurring-weekday, .subtask-item button';
  document.addEventListener('pointerdown', () => {
    window._soundPlayedThisClick = false;
    unlockAudioContext();
  }, true);
  document.addEventListener('click', e => {
    if (window._soundPlayedThisClick || isSoundMuted()) return;
    if (e.target.closest(SOUNDABLE)) playSound('click');
  }, false);
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 2200);
}

function updateThemeMeta() {
  const isDark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
  const themeColor = isDark ? '#0b0c15' : '#eef2f7';
  const statusBar = isDark ? 'black-translucent' : 'default';
  const colorMeta = document.getElementById('theme-color-meta');
  const statusMeta = document.getElementById('status-bar-meta');
  if (colorMeta) colorMeta.setAttribute('content', themeColor);
  if (statusMeta) statusMeta.setAttribute('content', statusBar);
  try { localStorage.setItem('hiway-theme', isDark ? 'dark' : 'light'); } catch (e) {}
}

function initTheme() {
  const saved = mobileState.data.theme || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeMeta();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  mobileState.data.theme = next;
  updateThemeMeta();
  scheduleSave();
}

function initSettingsPopout() {
  const toggle = document.getElementById('settings-toggle');
  const popout = document.getElementById('settings-popout');
  const themeRow = document.getElementById('theme-toggle-row');
  const soundRow = document.getElementById('sound-toggle-row');
  const hapticRow = document.getElementById('haptic-toggle-row');
  const themePill = document.getElementById('theme-pill');
  const soundPill = document.getElementById('sound-pill');
  const hapticPill = document.getElementById('haptic-pill');
  if (!toggle || !popout) return;

  function updatePills() {
    const isDark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
    themePill.classList.toggle('active', isDark);
    soundPill.classList.toggle('active', !mobileState.data.soundMuted);
    hapticPill.classList.toggle('active', mobileState.data.haptic);
  }
  updatePills();

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    settingsPopoutOpen = !settingsPopoutOpen;
    popout.classList.toggle('active', settingsPopoutOpen);
    playSound('click');
  });

  const closePopout = () => {
    settingsPopoutOpen = false;
    popout.classList.remove('active');
  };

  document.addEventListener('click', e => {
    if (settingsPopoutOpen && !popout.contains(e.target) && e.target !== toggle) closePopout();
  });

  if (themeRow) {
    themeRow.addEventListener('click', () => {
      toggleTheme();
      updatePills();
      playSound('click');
    });
  }
  if (soundRow) {
    soundRow.addEventListener('click', () => {
      mobileState.data.soundMuted = !mobileState.data.soundMuted;
      scheduleSave();
      updatePills();
      playSound('click');
    });
  }
  if (hapticRow) {
    hapticRow.addEventListener('click', () => {
      mobileState.data.haptic = !mobileState.data.haptic;
      scheduleSave();
      updatePills();
      haptic('light');
      playSound('click');
    });
  }
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

function getFutureTasks() {
  const today = dateKey(new Date());
  const all = [];
  Object.entries(mobileState.data.tasks).forEach(([date, tasks]) => {
    if (date <= today) return;
    tasks.forEach((task, idx) => {
      if (task.done) return;
      all.push({ date, idx, task });
    });
  });

  const nextByRecurring = {};
  const nonRecurring = [];
  all.forEach(item => {
    if (item.task.recurringId) {
      const rid = item.task.recurringId;
      if (!nextByRecurring[rid] || item.date < nextByRecurring[rid].date) {
        nextByRecurring[rid] = item;
      }
    } else {
      nonRecurring.push(item);
    }
  });

  const combined = [...Object.values(nextByRecurring), ...nonRecurring];
  combined.sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx);
  return combined;
}

function getUpcomingCount() {
  return getFutureTasks().length;
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

function createTask(text, date, notes = '', plantedDate = null, id = null, projectId = null, done = false, completedDate = null, spreadsheetId = null) {
  return {
    text,
    done: !!done,
    notes: notes || '',
    plantedDate: plantedDate || dateKey(date),
    completedDate: completedDate || (done ? dateKey(new Date()) : null),
    id: id || uuid(),
    projectId: projectId || null,
    spreadsheetId: spreadsheetId || null,
    recurringId: null,
    recurringInstanceDate: null,
    frequency: null,
    subtasks: []
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

function getRecurringById(id) {
  return (mobileState.data.recurring || []).find(r => r.id === id);
}

function renderTaskMeta(task, date) {
  if (task.recurringId) {
    const rec = getRecurringById(task.recurringId);
    if (rec) {
      const freq = recurringMetaText(rec, true);
      return `<div class='task-recurring-meta' data-rid='${escapeHtml(task.recurringId)}'>↻ Recurring ${escapeHtml(freq)}</div>`;
    }
  }
  const planted = task.plantedDate || date;
  if (planted !== date) {
    return `<div class='task-recurring-meta' style='color:var(--muted);font-weight:500;'>Planted ${formatShortDate(planted)} · now ${formatShortDate(date)}</div>`;
  }
  return '';
}

function renderTaskItem(task, date, idx, includeDelete = false) {
  const subtasksHtml = (task.subtasks && task.subtasks.length) ? buildRecurringSubtasksHTML(task.subtasks) : '';
  return `
    <li class='task-item' data-date='${date}' data-idx='${idx}'>
      <span class='drag-handle' aria-label='Reorder'>⋮⋮</span>
      <div style='flex:1;min-width:0;'>
        <div class='task-text ${task.done ? 'done' : ''}'>${escapeHtml(task.text)}</div>
        ${renderTaskMeta(task, date)}
        ${subtasksHtml}
      </div>
      ${taskActionButtons(task, date, idx, includeDelete)}
    </li>
  `;
}

function bindTaskList(container, refreshFn, includeDelete = true) {
  container.querySelectorAll('.task-item').forEach(li => {
    const date = li.dataset.date;
    const idx = Number(li.dataset.idx);
    const tasks = mobileState.data.tasks[date];
    if (!tasks || !tasks[idx]) return;
    const task = tasks[idx];

    const doneBtn = li.querySelector('.done-btn');
    const undoBtn = li.querySelector('.undo-btn');
    const deferBtn = li.querySelector('.defer-btn');
    const deleteBtn = li.querySelector('.delete-btn');
    const meta = li.querySelector('.task-recurring-meta');

    if (doneBtn) doneBtn.addEventListener('click', e => { e.stopPropagation(); completeTask(date, idx); refreshFn(); });
    if (undoBtn) undoBtn.addEventListener('click', e => { e.stopPropagation(); undoTask(date, idx); refreshFn(); });
    if (deferBtn) deferBtn.addEventListener('click', e => { e.stopPropagation(); openDeferOptions(date, idx, refreshFn); });
    if (includeDelete && deleteBtn) deleteBtn.addEventListener('click', e => { e.stopPropagation(); confirmDelete(date, idx, refreshFn); });
    if (meta && meta.dataset.rid) {
      meta.addEventListener('click', e => {
        e.stopPropagation();
        const rec = getRecurringById(meta.dataset.rid);
        if (rec) openRecurringEditor(rec);
      });
    }

    li.querySelectorAll('.subtask-complete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid = btn.dataset.sid;
        const sub = (task.subtasks || []).find(s => s.id === sid);
        if (sub) {
          sub.done = !sub.done;
          scheduleSave();
          refreshFn();
        }
      });
    });

    li.querySelectorAll('.subtask-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid = btn.dataset.sid;
        const sub = (task.subtasks || []).find(s => s.id === sid);
        if (!sub) return;
        const text = sub.text;
        if (task.recurringId) {
          const rec = getRecurringById(task.recurringId);
          if (rec && rec.subtasks) rec.subtasks = rec.subtasks.filter(s => s.text !== text);
          Object.values(mobileState.data.tasks || {}).forEach(list => {
            list.forEach(t => {
              if (t.recurringId === task.recurringId && t.subtasks) {
                t.subtasks = t.subtasks.filter(s => s.text !== text);
              }
            });
          });
          syncRecurringInstances();
        } else {
          task.subtasks = (task.subtasks || []).filter(s => s.id !== sid);
        }
        scheduleSave();
        refreshFn();
      });
    });

    bindDragReorder(li, refreshFn);
  });
}

function bindDragReorder(li, refreshFn) {
  const handle = li.querySelector('.drag-handle');
  if (!handle) return;
  handle.style.touchAction = 'none';
  handle.style.userSelect = 'none';
  handle.style.webkitUserSelect = 'none';

  let dragEl = null;
  let dragList = null;
  let dragRefreshFn = null;
  let startY = null;
  let hasMoved = false;
  let placeholder = null;

  handle.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragEl = li;
    dragList = li.parentElement;
    dragRefreshFn = refreshFn;
    startY = e.clientY;
    hasMoved = false;

    const rect = dragEl.getBoundingClientRect();
    placeholder = document.createElement('li');
    placeholder.className = 'task-item drag-placeholder';
    placeholder.style.height = rect.height + 'px';
    placeholder.style.visibility = 'hidden';
    placeholder.style.marginBottom = getComputedStyle(dragEl).marginBottom;
    dragList.insertBefore(placeholder, dragEl);

    dragEl.classList.add('dragging');
    dragEl.style.position = 'fixed';
    dragEl.style.top = rect.top + 'px';
    dragEl.style.left = rect.left + 'px';
    dragEl.style.width = rect.width + 'px';
    dragEl.style.zIndex = '1000';
    dragEl.style.transition = 'none';
    dragEl.style.boxSizing = 'border-box';

    haptic('light');
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
  });

  const findDropTarget = y => {
    if (!dragList) return null;
    const siblings = [...dragList.children].filter(child => child !== dragEl && child !== placeholder);
    for (const child of siblings) {
      const rect = child.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return child;
    }
    return null;
  };

  const endDrag = e => {
    if (!dragEl) return;
    try { handle.releasePointerCapture(e.pointerId); } catch (err) {}

    const list = dragList;
    const refresh = dragRefreshFn;
    const moved = hasMoved;

    const target = findDropTarget(e.clientY);
    if (placeholder) {
      if (target) list.insertBefore(dragEl, target);
      else list.appendChild(dragEl);
      placeholder.remove();
      placeholder = null;
    }

    dragEl.classList.remove('dragging');
    dragEl.style.position = '';
    dragEl.style.top = '';
    dragEl.style.left = '';
    dragEl.style.width = '';
    dragEl.style.zIndex = '';
    dragEl.style.transition = '';
    dragEl.style.boxSizing = '';

    if (list && moved) {
      const items = [...list.querySelectorAll('.task-item')];
      if (items.length) {
        const sameDate = items.every(item => item.dataset.date === items[0].dataset.date);
        if (sameDate) {
          const date = items[0].dataset.date;
          const tasks = mobileState.data.tasks[date] || [];
          const ordered = items.map(item => {
            const idx = Number(item.dataset.idx);
            return tasks[idx];
          }).filter(Boolean);
          if (ordered.length === items.length) {
            mobileState.data.tasks[date] = ordered;
            scheduleSave();
          }
        }
      }
    }

    dragEl = dragList = dragRefreshFn = null;
    startY = null;
    hasMoved = false;
    if (refresh && moved) refresh();
  };

  handle.addEventListener('pointermove', e => {
    if (!dragEl || !dragList) return;
    e.preventDefault();
    if (startY !== null && Math.abs(e.clientY - startY) > 6) hasMoved = true;
    if (!hasMoved) return;

    const rect = placeholder ? placeholder.getBoundingClientRect() : dragEl.getBoundingClientRect();
    const deltaY = e.clientY - startY;
    dragEl.style.top = (rect.top + deltaY) + 'px';

    const target = findDropTarget(e.clientY);
    if (placeholder) {
      if (target) dragList.insertBefore(placeholder, target);
      else dragList.appendChild(placeholder);
    }
  });

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
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
    await enterApp();
  });
}

async function loadUserData() {
  const saved = await window.hiwayAPI.getData();
  mobileState.data = Object.assign({}, DEFAULT_DATA, saved);
  if (!Array.isArray(mobileState.data.recurring)) mobileState.data.recurring = [];
  if (typeof mobileState.data.soundMuted !== 'boolean') mobileState.data.soundMuted = false;
  if (typeof mobileState.data.haptic !== 'boolean') mobileState.data.haptic = true;
  if (!mobileState.calendarMonth) mobileState.calendarMonth = dateKey(new Date()).slice(0, 7) + '-01';
}

async function enterApp() {
  if (window.hiwayAPI && window.hiwayAPI.setCurrentUser) {
    window.hiwayAPI.setCurrentUser(mobileState.user);
  }
  await loadUserData();
  autoRollover();
  syncRecurringInstances();
  checkRecurringReminders();
  initTheme();

  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('main-screen').classList.add('active');
  document.getElementById('current-user').textContent = '@' + mobileState.user;
  initNavigation();
  initSettingsPopout();
  setView('dashboard');
}

/* Navigation */
function updateNavPill(view) {
  const nav = document.querySelector('.mobile-bottom-nav');
  if (!nav) return;
  let pill = nav.querySelector('.nav-active-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'nav-active-pill';
    nav.appendChild(pill);
  }
  const activeForMore = (view === 'brainstorm' || view === 'deferred' || view === 'projects' || view === 'recurring');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    const isActive = btn.dataset.view === view || (activeForMore && btn.dataset.view === 'more');
    btn.classList.toggle('active', isActive);
  });
  const item = nav.querySelector(`.nav-item[data-view="${activeForMore ? 'more' : view}"]`) || nav.querySelector('.nav-item.active');
  if (!item) return;
  const inset = 4;
  pill.style.width = `${item.offsetWidth - inset * 2}px`;
  pill.style.transform = `translateX(${item.offsetLeft + inset}px)`;
}

function initNavigation() {
  const nav = document.querySelector('.mobile-bottom-nav');
  let pill = nav.querySelector('.nav-active-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'nav-active-pill';
    nav.appendChild(pill);
  }

  let dragging = false;
  let activeItem = null;

  const setActiveItem = item => {
    if (!item) return;
    activeItem = item;
    nav.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    item.classList.add('active');
    const inset = 4;
    pill.style.width = `${item.offsetWidth - inset * 2}px`;
    pill.style.transform = `translateX(${item.offsetLeft + inset}px)`;
  };

  const itemAtPoint = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    return el && el.closest('.nav-item');
  };

  nav.addEventListener('pointerdown', e => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    dragging = true;
    try { nav.setPointerCapture(e.pointerId); } catch (err) {}
    pill.classList.add('dragging');
    setActiveItem(item);
  });

  nav.addEventListener('pointermove', e => {
    if (!dragging) return;
    const item = itemAtPoint(e.clientX, e.clientY);
    if (item) setActiveItem(item);
  });

  const endDrag = (clientX, clientY) => {
    if (!dragging) return;
    dragging = false;
    pill.classList.remove('dragging');
    const item = itemAtPoint(clientX, clientY) || activeItem;
    if (item) {
      setView(item.dataset.view);
      playSound('click');
    }
    activeItem = null;
  };

  nav.addEventListener('pointerup', e => endDrag(e.clientX, e.clientY));
  nav.addEventListener('pointerleave', e => endDrag(e.clientX, e.clientY));

  document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
}

function setView(view) {
  mobileState.currentView = view;
  closeFlipOut();
  updateNavPill(view);
  const content = document.getElementById('mobile-content');
  content.innerHTML = '';
  content.scrollTop = 0;
  renderView(view, content);
}

function refreshCurrentView() {
  updateNavPill(mobileState.currentView);
  const content = document.getElementById('mobile-content');
  content.innerHTML = '';
  content.scrollTop = 0;
  renderView(mobileState.currentView, content);
}

function renderView(view, content) {
  if (view === 'dashboard') renderMobileDashboard(content);
  else if (view === 'calendar') renderMobileCalendar(content);
  else if (view === 'catchup') renderCatchUp(content);
  else if (view === 'projects') renderProjects(content);
  else if (view === 'more') renderMore(content);
  else if (view === 'brainstorm') renderBrainstorm(content);
  else if (view === 'deferred') renderDeferred(content);
  else if (view === 'recurring') renderRecurringView(content);
}

/* Dashboard */
function renderMobileDashboard(container) {
  const { today, done, total } = getTodayStats();
  const upcoming = getUpcomingCount();
  const projects = mobileState.data.projects.filter(p => !p.completed).length;
  const { overdue, rate } = getRolloverStats();
  const rolled = getRolledTasks();
  const wins = getRecentWins();

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
      ${todayTasks.map((t, i) => renderTaskItem(t, today, i, false)).join('')}
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

  bindTaskList(container, () => renderMobileDashboard(container), false);

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

function getNextDay(date) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}

function completeTask(date, idx) {
  const tasks = mobileState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  const task = tasks[idx];
  if (task.done) return;
  task.done = true;
  task.completedDate = dateKey(new Date());
  if (task.projectId) {
    const p = getProjectById(task.projectId);
    if (p) {
      const step = p.steps.find(s => s.id === task.id);
      if (step) step.done = true;
    }
  }
  scheduleSave();
  playSound('complete');
  toast('Completed');
}

function undoTask(date, idx) {
  const tasks = mobileState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  const task = tasks[idx];
  if (!task.done) return;
  task.done = false;
  task.completedDate = null;
  if (task.projectId) {
    const p = getProjectById(task.projectId);
    if (p) {
      const step = p.steps.find(s => s.id === task.id);
      if (step) step.done = false;
    }
  }
  scheduleSave();
  playSound('click');
  toast('Reopened');
}

function taskActionButtons(task, date, idx, includeDelete = false) {
  if (task.done) {
    return `
      <div class='task-actions'>
        <span class='completed-badge'>Completed</span>
        <button class='action-btn undo-btn' data-date='${date}' data-idx='${idx}' title='Undo'>↩</button>
        ${includeDelete ? `<button class='action-btn delete-btn' data-date='${date}' data-idx='${idx}' title='Delete'>×</button>` : ''}
      </div>
    `;
  }
  return `
    <div class='task-actions'>
      <button class='action-btn defer-btn' data-date='${date}' data-idx='${idx}' title='Defer'>⧗</button>
      <button class='action-btn done-btn' data-date='${date}' data-idx='${idx}' title='Complete'>✓</button>
      ${includeDelete ? `<button class='action-btn delete-btn' data-date='${date}' data-idx='${idx}' title='Delete'>×</button>` : ''}
    </div>
  `;
}

function bindTaskButtons(container, refreshFn, includeDelete = true) {
  container.querySelectorAll('.done-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      completeTask(btn.dataset.date, Number(btn.dataset.idx));
      refreshFn();
    });
  });
  container.querySelectorAll('.undo-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      undoTask(btn.dataset.date, Number(btn.dataset.idx));
      refreshFn();
    });
  });
  container.querySelectorAll('.defer-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDeferOptions(btn.dataset.date, Number(btn.dataset.idx), refreshFn);
    });
  });
  if (includeDelete) {
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        confirmDelete(btn.dataset.date, Number(btn.dataset.idx), refreshFn);
      });
    });
  }
}

function openDeferOptions(date, idx, onComplete = null) {
  const tasks = mobileState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  const tomorrow = getNextDay(date);
  const modal = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const actionsEl = document.querySelector('.modal-actions');
  const confirmBtn = document.getElementById('modal-confirm');

  titleEl.textContent = 'Defer task';
  bodyEl.innerHTML = `
    <div class='modal-option' id='defer-tomorrow'>
      <span>⏰</span><span>Snooze to tomorrow <strong>(${tomorrow})</strong></span>
    </div>
    <label class='modal-option' style='cursor:default'>
      <span>📅</span><span>Reschedule to date:</span>
      <input type='date' id='defer-date' value='${tomorrow}'>
    </label>
    <div class='modal-option' id='defer-postpone'>
      <span>🗂</span><span>Save to Postponed list (put it aside)</span>
    </div>
  `;
  confirmBtn.style.display = 'none';

  const cleanup = () => {
    confirmBtn.style.display = '';
    bodyEl.innerHTML = '';
    bodyEl.textContent = '';
    modal.onclick = null;
    modal.classList.remove('active');
  };

  const move = (targetDate, mode) => {
    cleanup();
    if (mode === 'postpone') {
      deferTask(date, idx);
    } else {
      moveTaskToDate(date, idx, targetDate);
    }
    if (onComplete) onComplete();
    else refreshCurrentView();
  };

  document.getElementById('defer-tomorrow').addEventListener('click', () => move(tomorrow, 'date'), { once: true });
  document.getElementById('defer-postpone').addEventListener('click', () => move(null, 'postpone'), { once: true });
  document.getElementById('defer-date').addEventListener('change', e => {
    if (e.target.value) move(e.target.value, 'date');
  }, { once: true });

  const cancelBtn = document.getElementById('modal-cancel');
  cancelBtn.addEventListener('click', cleanup, { once: true });
  modal.onclick = e => { if (e.target === modal) cleanup(); };

  modal.classList.add('active');
}

/* Calendar */
function renderMobileCalendar(container) {
  const today = dateKey(new Date());
  if (!mobileState.calendarMonth) mobileState.calendarMonth = dateKey(new Date()).slice(0, 7) + '-01';
  const [year, month] = mobileState.calendarMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let html = `
    <div class='calendar-header'>
      <button class='calendar-nav' data-dir='-1' aria-label='Previous month'>&lsaquo;</button>
      <span class='calendar-month'>${monthLabel}</span>
      <button class='calendar-nav' data-dir='1' aria-label='Next month'>&rsaquo;</button>
    </div>
    <div class='calendar-weekdays'>${weekdays.map(d => `<span>${d}</span>`).join('')}</div>
    <div class='calendar-grid'>
  `;
  for (let i = 0; i < firstDay; i++) html += `<div class='calendar-cell empty'></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = (mobileState.data.tasks[date] || []).filter(t => !t.done).length;
    const isToday = date === today;
    html += `
      <div class='calendar-cell ${isToday ? 'today' : ''}' data-date='${date}'>
        <span class='calendar-day'>${day}</span>
        ${count ? `<span class='calendar-count'>${count}</span>` : ''}
      </div>
    `;
  }
  html += `</div><button class='calendar-today-btn primary-btn liquid-btn'>Today</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.calendar-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => openDayFlipOut(cell.dataset.date));
  });
  container.querySelectorAll('.calendar-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = parseInt(btn.dataset.dir, 10);
      const d = new Date(year, month - 1 + dir, 1);
      mobileState.calendarMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      refreshCurrentView();
    });
  });
  const todayBtn = container.querySelector('.calendar-today-btn');
  if (todayBtn) todayBtn.addEventListener('click', () => {
    mobileState.calendarMonth = dateKey(new Date()).slice(0, 7) + '-01';
    refreshCurrentView();
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
      const listHtml = tasks.length ? `<ul class='task-list'>${tasks.map((t, i) => renderTaskItem(t, date, i, true)).join('')}</ul>` : '<p class="empty-state">No tasks for this day.</p>';

      body.innerHTML = `
        <div class='add-row' style='margin-bottom:14px;'>
          <input type='text' id='add-task' class='glass-input' placeholder='Add a task...'>
          <button id='add-task-btn'>+</button>
        </div>
        ${listHtml}
      `;

      bindTaskList(body, () => { refreshCurrentView(); openDayFlipOut(date); }, true);
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
  const upcoming = getFutureTasks();

  openFlipOut({
    title: 'Upcoming Tasks',
    renderBody: body => {
      if (!upcoming.length) {
        body.innerHTML = '<p class="empty-state">No upcoming tasks. You are all caught up.</p>';
        return;
      }
      body.innerHTML = `<ul class='task-list'>${upcoming.map(({ date, idx, task }) => renderTaskItem(task, date, idx, true)).join('')}</ul>`;
      bindTaskList(body, () => { refreshCurrentView(); openUpcomingFlipOut(); }, true);
    }
  });
}

function addTask(date, text) {
  if (!mobileState.data.tasks[date]) mobileState.data.tasks[date] = [];
  mobileState.data.tasks[date].push(createTask(text, date));
  scheduleSave();
  playSound('confirm');
  toast('Task added');
  refreshCurrentView();
}

function confirmDelete(date, idx, refreshFn = null) {
  const tasks = mobileState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  const task = tasks[idx];
  showModal('Move to trash?', `"${escapeHtml(task.text)}" will be moved to trash.`, () => {
    const [removed] = tasks.splice(idx, 1);
    if (tasks.length === 0) delete mobileState.data.tasks[date];
    removed.deletedFrom = date;
    mobileState.data.trash.push(removed);
    scheduleSave();
    playSound('delete');
    toast('Moved to trash');
    if (refreshFn) refreshFn();
    else { closeFlipOut(); refreshCurrentView(); }
  });
}

function deferTask(date, idx) {
  const tasks = mobileState.data.tasks[date];
  if (!tasks || !tasks[idx]) return;
  const [task] = tasks.splice(idx, 1);
  if (tasks.length === 0) delete mobileState.data.tasks[date];
  if (!mobileState.data.postponed) mobileState.data.postponed = [];
  task.deferredFrom = date;
  task.deferredAt = dateKey(new Date());
  mobileState.data.postponed.unshift(task);
  scheduleSave();
  playSound('defer');
  toast('Deferred');
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
      completeTask(date, idx);
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
  playSound('defer');
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
  playSound('project');
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
  playSound('project');
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
      playSound(project.completed ? 'complete' : 'click');
      toast(project.completed ? 'Project completed' : 'Project reactivated');
      setView('projects');
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
  playSound('confirm');
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
  playSound(step.done ? 'complete' : 'click');
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
  playSound('delete');
  toast('Project deleted');
  setView('projects');
}

/* More */
function renderMore(container) {
  container.innerHTML = `
    <div class='section-title'>More</div>
    <ul class='more-list'>
      <li data-item='projects'><span>◬ Projects</span><span class='icon'>›</span></li>
      <li data-item='recurring'><span>↻ Recurring</span><span class='icon'>›</span></li>
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
      if (item === 'brainstorm') return setView('brainstorm');
      if (item === 'deferred') return setView('deferred');
      if (item === 'projects') return setView('projects');
      if (item === 'recurring') return setView('recurring');
      openPlaceholder(item);
    });
  });
}

function addNote(text) {
  if (!mobileState.data.notes) mobileState.data.notes = [];
  mobileState.data.notes.unshift({ id: uuid(), text: text.trim(), created: dateKey(new Date()) });
  scheduleSave();
  playSound('confirm');
}

function deleteNote(idx) {
  mobileState.data.notes.splice(idx, 1);
  scheduleSave();
  playSound('delete');
}

function renderBrainstorm(container) {
  const notes = mobileState.data.notes || [];
  container.innerHTML = `
    <div class='section-title'>Brainstorm</div>
    <div class='add-row'>
      <input type='text' id='new-note' class='glass-input' placeholder='Add a quick thought...'>
      <button id='add-note-btn'>+</button>
    </div>
    ${notes.length ? `<div class='notes-list'>${notes.map((n, i) => `
      <div class='note-card'>
        <p>${escapeHtml(n.text)}</p>
        <button class='note-delete' data-idx='${i}'>×</button>
      </div>
    `).join('')}</div>` : `<div class='mobile-tile'><p class='empty-state'>No notes yet. Jot one down.</p></div>`}
    <button class='secondary-btn' id='back-from-brainstorm' style='margin-top:16px;width:100%;'>Back</button>
  `;

  const input = container.querySelector('#new-note');
  container.querySelector('#add-note-btn').addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    addNote(text);
    input.value = '';
    renderBrainstorm(container);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') container.querySelector('#add-note-btn').click(); });
  container.querySelectorAll('.note-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteNote(Number(btn.dataset.idx));
      renderBrainstorm(container);
    });
  });
  container.querySelector('#back-from-brainstorm').addEventListener('click', () => setView('more'));
}

function restoreDeferred(idx) {
  const list = mobileState.data.postponed;
  if (!list || !list[idx]) return;
  const [task] = list.splice(idx, 1);
  const today = dateKey(new Date());
  if (!mobileState.data.tasks[today]) mobileState.data.tasks[today] = [];
  task.deferredAt = null;
  mobileState.data.tasks[today].push(task);
  scheduleSave();
  playSound('confirm');
  toast('Restored to today');
}

function deleteDeferred(idx) {
  const list = mobileState.data.postponed;
  if (!list || !list[idx]) return;
  const [removed] = list.splice(idx, 1);
  removed.deletedFrom = 'deferred';
  mobileState.data.trash.push(removed);
  scheduleSave();
  playSound('delete');
  toast('Deleted');
}

function renderDeferred(container) {
  const list = mobileState.data.postponed || [];
  container.innerHTML = `
    <div class='section-title'>Deferred</div>
    <p class='subtle-text' style='margin-bottom:16px;'>Tasks you've put off for later.</p>
    ${list.length ? `<div class='deferred-list'>${list.map((t, i) => `
      <div class='deferred-card'>
        <div style='flex:1;'>
          <div class='deferred-text'>${escapeHtml(t.text)}</div>
          <div class='catch-meta'>Deferred ${formatShortDate(t.deferredAt || t.deferredFrom)}</div>
        </div>
        <div class='task-actions'>
          <button class='restore-btn' data-idx='${i}' title='Move to today'>↩</button>
          <button class='delete-btn' data-idx='${i}'>×</button>
        </div>
      </div>
    `).join('')}</div>` : `<div class='mobile-tile'><p class='empty-state'>No deferred tasks. Keep up the momentum.</p></div>`}
    <button class='secondary-btn' id='back-from-deferred' style='margin-top:16px;width:100%;'>Back</button>
  `;

  container.querySelectorAll('.restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      restoreDeferred(Number(btn.dataset.idx));
      renderDeferred(container);
    });
  });
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteDeferred(Number(btn.dataset.idx));
      renderDeferred(container);
    });
  });
  container.querySelector('#back-from-deferred').addEventListener('click', () => setView('more'));
}

function renderRecurringView(container) {
  container.innerHTML = `
    <div class='section-title'>Recurring</div>
    <p class='subtle-text' style='margin-bottom:16px;'>Tasks that repeat on a schedule.</p>
    <div id='recurring-list'></div>
    <button id='new-recurring-btn' class='primary-btn liquid-btn' style='margin-top:16px;width:100%;'>+ New recurring task</button>
  `;
  if (typeof renderRecurring === 'function') renderRecurring();
  const btn = document.getElementById('new-recurring-btn');
  if (btn) btn.addEventListener('click', () => { if (typeof openRecurringEditor === 'function') openRecurringEditor(); });
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
function openModal(title, bodyHTML, confirmText = 'Confirm', onConfirm, onCancel) {
  playSound('open');
  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-card');
  if (card) card.classList.remove('wide');
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  if (body) body.innerHTML = bodyHTML || '';
  const confirm = document.getElementById('modal-confirm');
  const cancel = document.getElementById('modal-cancel');
  if (confirm) {
    confirm.textContent = confirmText;
    confirm.style.display = '';
  }
  if (overlay) overlay.classList.add('active');

  // remove stale recurring action buttons
  document.querySelectorAll('.modal-actions > .recurring-delete-btn, .modal-actions > .recurring-edit-btn').forEach(b => b.remove());

  const cleanup = () => {
    if (overlay) overlay.classList.remove('active');
    if (confirm) confirm.removeEventListener('click', onConfirmHandler);
    if (cancel) cancel.removeEventListener('click', onCancelHandler);
  };
  const onConfirmHandler = () => {
    cleanup();
    if (typeof onConfirm === 'function') onConfirm();
  };
  const onCancelHandler = () => {
    cleanup();
    if (typeof onCancel === 'function') onCancel();
  };

  if (confirm) confirm.addEventListener('click', onConfirmHandler, { once: true });
  if (cancel) cancel.addEventListener('click', onCancelHandler, { once: true });
}

// mobile legacy wrapper: showModal(title, body, onConfirm)
function showModal(title, body, onConfirm) {
  openModal(title, body, 'Confirm', onConfirm, () => {});
}

function haptic(style = 'light') {
  if (mobileState.data && mobileState.data.haptic === false) return;
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
    try { window.Capacitor.Plugins.Haptics.impact({ style }); } catch (e) {}
  } else if (navigator.vibrate) {
    navigator.vibrate(15);
  }
}

function bindGlobalHaptics() {
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('button, [role="button"], .mobile-tile, .day-row, .catch-card, .more-list li, .note-card, .deferred-card, .modal-option')) {
      haptic();
    }
  });
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

function initEdgeSwipe() {
  let startX = null;
  let startY = null;
  let startTime = null;
  const edgeWidth = 28;

  document.addEventListener('touchstart', e => {
    const touch = e.touches[0];
    if (touch.clientX > edgeWidth) return;
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = e.timeStamp;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (startX === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    if (dx > 10) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (startX === null || startY === null || startTime === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dt = e.timeStamp - startTime;
    if (dx > 60 && Math.abs(dy) < 60 && dt < 700) {
      const flipout = document.getElementById('flipout');
      const modal = document.getElementById('modal-overlay');
      const popout = document.getElementById('settings-popout');
      if (modal && modal.classList.contains('active')) {
        closeModal();
      } else if (flipout && flipout.classList.contains('active')) {
        closeFlipOut();
      } else if (popout && popout.classList.contains('active')) {
        popout.classList.remove('active');
      } else if (mobileState.currentView !== 'dashboard') {
        setView('dashboard');
      }
    }
    startX = startY = startTime = null;
  }, { passive: true });
}

/* Boot */
// Global stubs expected by renderer/recurring.js
window.renderCalendar = () => refreshCurrentView();
window.renderDashboard = () => refreshCurrentView();
window.refreshDashboardDetail = () => {};

function initOrientationLock() {
  function lock() {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'orientation-lock';
  overlay.className = 'orientation-lock';
  overlay.innerHTML = `<div class='orientation-icon'>↻</div><p>Please rotate your device back to portrait.</p>`;
  document.body.appendChild(overlay);

  function update() {
    const isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
    const isPhone = window.innerHeight < 500;
    if (isLandscape && isPhone) {
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
      if (mobileState.currentView) updateNavPill(mobileState.currentView);
      window.scrollTo(0, 0);
    }
    lock();
  }

  lock();
  window.addEventListener('orientationchange', update);
  window.addEventListener('resize', update);
  update();
}

async function boot() {
  if (!window.hiwayAPI) {
    document.getElementById('auth-error').textContent = 'Onward mobile must run inside the Onward app or a local server with test-mock.';
    return;
  }
  mobileState.users = await window.hiwayAPI.getUsers();
  initAuth();
  bindGlobalHaptics();
  initAmbientSounds();
  initEdgeSwipe();
  initOrientationLock();
  document.getElementById('flipout').addEventListener('click', e => {
    if (e.target === document.getElementById('flipout') || e.target.classList.contains('flipout-backdrop')) closeFlipOut();
  });
}

boot();
