const { contextBridge, ipcRenderer, webUtils } = require('electron');

// The page can only hand over File objects the person picked or dropped; their paths are resolved here,
// so it can never ask the main process to touch an arbitrary path.
contextBridge.exposeInMainWorld('OpenSesameDesktop', {
  claimOriginal: (file) => ipcRenderer.invoke('claim-original', webUtils.getPathForFile(file)),
  deleteOriginal: (token, hash) => ipcRenderer.invoke('delete-original', String(token), String(hash)),
});
