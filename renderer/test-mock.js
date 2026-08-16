// Browser-only mock for hiwayAPI when testing outside Electron.
// Stores accounts and per-user data in localStorage.
const rawUsers = JSON.parse(localStorage.getItem('hiway-users') || '{}');
let allData = JSON.parse(localStorage.getItem('hiway-data') || '{}');

// Legacy migration: older PWA builds stored the app data object directly at the root.
// If we see that, wrap it under _legacy so the first logged-in user inherits it.
if (allData && (Array.isArray(allData.tasks) || Array.isArray(allData.projects) || allData.theme)) {
  allData = { _legacy: allData };
}

if (!rawUsers.testuser) {
  rawUsers.testuser = { password: 'testpass' };
}

let currentUser = null;

function clone(obj) {
  try { return JSON.parse(JSON.stringify(obj || {})); } catch (e) { return {}; }
}

function getUserData(user = currentUser) {
  const u = user || currentUser;
  if (!u) return allData;
  if (!allData[u]) {
    if (allData._legacy && Object.keys(allData).length === 1) {
      allData[u] = allData._legacy;
      delete allData._legacy;
    } else {
      allData[u] = {};
    }
  }
  return allData[u];
}

function persistAllData() {
  localStorage.setItem('hiway-data', JSON.stringify(allData));
}

if (!window.hiwayAPI) {
  window.hiwayAPI = {
    platform: 'browser',
    getUsers: async () => rawUsers,
    saveUsers: async (users) => {
      const saved = clone(users);
      localStorage.setItem('hiway-users', JSON.stringify(saved));
      Object.keys(rawUsers).forEach(k => delete rawUsers[k]);
      Object.assign(rawUsers, saved);
      return true;
    },
    setCurrentUser: (user) => { currentUser = user; },
    getData: async (user) => getUserData(user),
    saveData: async (data, user) => {
      const u = user || currentUser;
      if (u) allData[u] = data;
      else allData = data;
      persistAllData();
      return true;
    },
    windowAction: () => true,
    isMaximized: async () => false,
    setTitleBarOverlay: () => true,
    showNotification: async () => true
  };
}
