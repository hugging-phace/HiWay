// Browser-only mock for hiwayAPI when testing outside Electron
const rawUsers = JSON.parse(localStorage.getItem('hiway-users') || '{}');
let rawData = JSON.parse(localStorage.getItem('hiway-data') || '{}');

// Mirror main.js: if the stored data is a legacy flat user object, wrap it.
if (rawData && (typeof rawData.tasks !== 'undefined' || typeof rawData.projects !== 'undefined' || rawData.theme)) {
  rawData = { _legacy: rawData };
}

const mockStorage = {
  users: rawUsers,
  data: rawData && Object.keys(rawData).length ? rawData : {}
};

if (!window.hiwayAPI) {
  window.hiwayAPI = {
    platform: 'browser',
    getUsers: async () => mockStorage.users,
    saveUsers: async (users) => { mockStorage.users = users; localStorage.setItem('hiway-users', JSON.stringify(users)); return true; },
    getData: async () => mockStorage.data,
    saveData: async (data) => { mockStorage.data = data; localStorage.setItem('hiway-data', JSON.stringify(data)); return true; },
    windowAction: () => true,
    isMaximized: async () => false,
    setTitleBarOverlay: () => true,
    showNotification: async () => true
  };
}
