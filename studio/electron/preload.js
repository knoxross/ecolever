// 화면(웹)과 앱(데스크톱) 사이의 안전한 연결 통로
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  saveVideo: (data, name) => ipcRenderer.invoke('save-file', { data, name, label: '동영상', ext: name.split('.').pop() || 'mp4', kind: 'videos' }),
  saveFile: (data, name, label, ext) => ipcRenderer.invoke('save-file', { data, name, label, ext, kind: 'documents' }),
  openFiles: () => ipcRenderer.invoke('open-files'),
  openProject: () => ipcRenderer.invoke('open-project'),
  showItemInFolder: p => ipcRenderer.invoke('show-item', p),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  getSecret: k => ipcRenderer.invoke('secret-get', k),
  setSecret: (k, v) => ipcRenderer.invoke('secret-set', k, v),
  httpGet: (url, headers) => ipcRenderer.invoke('http-get', url, headers),
  setDirty: d => ipcRenderer.send('dirty', d),
  onMenu: cb => ipcRenderer.on('menu', (_e, action) => cb(action)),
  setKeepRunning: on => ipcRenderer.send('keep-running', on),
  chooseFolder: title => ipcRenderer.invoke('choose-folder', title),
  listFolder: dir => ipcRenderer.invoke('list-folder', dir),
  readFile: p => ipcRenderer.invoke('read-file', p),
  writeFile: (dir, name, data) => ipcRenderer.invoke('write-file', dir, name, data),
  openPath: p => ipcRenderer.invoke('open-path', p),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
});
