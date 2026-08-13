// Browser-only mock for hiwayAPI when testing outside Electron
const mockStorage = {
  users: JSON.parse(localStorage.getItem('hiway-users') || '{}'),
  data: JSON.parse(localStorage.getItem('hiway-data') || '{"tasks":{},"projects":[],"notes":[],"postponed":[],"trash":[],"spreadsheets":[],"theme":"light"}')
};

if (!window.hiwayAPI) {
  window.hiwayAPI = {
    getUsers: async () => mockStorage.users,
    saveUsers: async (users) => { mockStorage.users = users; localStorage.setItem('hiway-users', JSON.stringify(users)); return true; },
    getData: async () => mockStorage.data,
    saveData: async (data) => { mockStorage.data = data; localStorage.setItem('hiway-data', JSON.stringify(data)); return true; }
  };
}
