// Bridge between Relook's own pages and the main process.
//
// Only pages served from relook://app get it. Web pages opened in the viewer pane
// run in the same view but never see `relookHost`, so they can't talk to the app.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'relook:') {
  const listeners = [];
  ipcRenderer.on('host', (_event, data) => {
    for (const fn of listeners) fn({ data });
  });
  contextBridge.exposeInMainWorld('relookHost', {
    postMessage: (message) => ipcRenderer.send('host', message),
    addEventListener: (type, fn) => {
      if (type === 'message' && typeof fn === 'function') listeners.push(fn);
    },
  });
}
