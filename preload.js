process.once('loaded', () => {
  global.OFFLINE_IPC = require('electron').ipcRenderer
})

