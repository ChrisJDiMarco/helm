const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('helm', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),

  // Files
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  writeFile: (p, content) => ipcRenderer.invoke('write-file', p, content),
  listDir: (p) => ipcRenderer.invoke('list-dir', p),
  fileExists: (p) => ipcRenderer.invoke('file-exists', p),

  // Project
  pickProject: () => ipcRenderer.invoke('pick-project'),
  detectProjects: () => ipcRenderer.invoke('detect-projects'),
  readClaudeMd: (projectPath) => ipcRenderer.invoke('read-claude-md', projectPath),

  // Project data
  listAgents: (projectPath) => ipcRenderer.invoke('list-agents', projectPath),
  readMemoryStats: (projectPath) => ipcRenderer.invoke('read-memory-stats', projectPath),
  readLogEntries: (count) => ipcRenderer.invoke('read-log-entries', count),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  readHooks: () => ipcRenderer.invoke('read-hooks'),

  // Streaming
  streamStart: (id, apiKey, model, messages, system) =>
    ipcRenderer.send('claude-stream-start', { id, apiKey, model, messages, system }),
  onStreamChunk: (cb) => { ipcRenderer.on('stream-chunk', (_, d) => cb(d)) },
  onStreamDone: (cb) => { ipcRenderer.on('stream-done', (_, d) => cb(d)) },
  onStreamError: (cb) => { ipcRenderer.on('stream-error', (_, d) => cb(d)) },
  onStreamUsage: (cb) => { ipcRenderer.on('stream-usage', (_, d) => cb(d)) },

  // Log watcher
  onLogUpdated: (cb) => { ipcRenderer.on('log-updated', cb) },

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInFinder: (p) => ipcRenderer.invoke('open-in-finder', p),
  openInTerminal: (p) => ipcRenderer.invoke('open-in-terminal', p),
})
