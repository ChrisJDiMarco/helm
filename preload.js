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

  // Universe / Wiki
  loadGraph: (projectPath) => ipcRenderer.invoke('load-graph', projectPath),
  openObsidian: (filePath) => ipcRenderer.invoke('open-obsidian', filePath),
  runWikiBuilder: () => ipcRenderer.invoke('run-wiki-builder'),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInFinder: (p) => ipcRenderer.invoke('open-in-finder', p),
  openInTerminal: (p) => ipcRenderer.invoke('open-in-terminal', p),

  // Data Store
  storeGet: () => ipcRenderer.invoke('store-get'),
  storeSet: (patch) => ipcRenderer.invoke('store-set', patch),
  recordAgentUse: (data) => ipcRenderer.invoke('record-agent-use', data),
  recordDecision: (data) => ipcRenderer.invoke('record-decision', data),

  // Codebase Cognition
  startCognition: (projectPath) => ipcRenderer.invoke('start-cognition', projectPath),
  stopCognition: () => ipcRenderer.invoke('stop-cognition'),
  analyzeFileImpact: (data) => ipcRenderer.invoke('analyze-file-impact', data),
  getFileComplexity: (filePath) => ipcRenderer.invoke('get-file-complexity', filePath),
  scanProjectFiles: (projectPath) => ipcRenderer.invoke('scan-project-files', projectPath),
  onFileChanged: (cb) => ipcRenderer.on('file-changed', (_, d) => cb(d)),

  // Git
  getGitLog: (projectPath) => ipcRenderer.invoke('get-git-log', projectPath),

  // Dark Factory
  factoryDecompose: (data) => ipcRenderer.send('factory-decompose', data),
  onFactoryGraph: (cb) => ipcRenderer.on('factory-graph', (_, d) => cb(d)),
  onFactoryError: (cb) => ipcRenderer.on('factory-error', (_, d) => cb(d)),

  // Mind Mirror
  mirrorAnalyze: (data) => ipcRenderer.send('mirror-analyze', data),
  onMirrorDone: (cb) => ipcRenderer.on('mirror-done', (_, d) => cb(d)),
  onMirrorError: (cb) => ipcRenderer.on('mirror-error', (_, d) => cb(d)),

  // Co-occurrence (Orchestrate real edges)
  incrementCooccurrence: (a, b) => ipcRenderer.invoke('increment-cooccurrence', a, b),

  // Hook server
  hookServerStatus: () => ipcRenderer.invoke('hook-server-status'),
  installHelmHooks: () => ipcRenderer.invoke('install-helm-hooks'),
  onHookEvent: (cb) => ipcRenderer.on('hook-event', (_, d) => cb(d)),
})
