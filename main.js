const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { execSync } = require('child_process')

// ─── Config persistence ───────────────────────────────────────────────────────
const CONFIG_PATH = path.join(os.homedir(), '.helm-config.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch (_) { return {} }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

// ─── Memory caps (standard Claude Code project) ───────────────────────────────
const MEMORY_CAPS = {
  'core.md': 6000, 'context.md': 10000,
  'decisions.md': 6000, 'learnings.md': 6000,
  'relationships.md': 6000, 'L1-critical-facts.md': 1200
}

const LOG_FILE = path.join(os.homedir(), '.claude', 'settings.json')
const BASH_LOG = path.join(os.homedir(), '.claude', 'bash-commands.log')
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')

let mainWindow = null
let logWatcher = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520, height: 920, minWidth: 1200, minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'))
  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── Log watcher ──────────────────────────────────────────────────────────────
function startLogWatcher() {
  if (logWatcher) return
  try {
    if (!fs.existsSync(BASH_LOG)) {
      fs.mkdirSync(path.dirname(BASH_LOG), { recursive: true })
      fs.writeFileSync(BASH_LOG, '')
    }
    logWatcher = fs.watch(BASH_LOG, () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('log-updated')
    })
  } catch (_) {}
}

function stopLogWatcher() {
  if (logWatcher) { logWatcher.close(); logWatcher = null }
}

// ─── Core file ops ────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => loadConfig())
ipcMain.handle('save-config', (_, cfg) => { saveConfig({ ...loadConfig(), ...cfg }); return { ok: true } })

ipcMain.handle('read-file', async (_, p) => {
  try { return fs.readFileSync(p, 'utf8') } catch (_) { return null }
})

ipcMain.handle('write-file', async (_, p, content) => {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content, 'utf8'); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('list-dir', async (_, dirPath) => {
  try {
    return fs.readdirSync(dirPath).map(name => {
      const full = path.join(dirPath, name)
      const stat = fs.statSync(full)
      return { name, isDir: stat.isDirectory(), size: stat.size, mtime: stat.mtimeMs }
    })
  } catch (_) { return [] }
})

ipcMain.handle('file-exists', async (_, p) => fs.existsSync(p))

// ─── Project picker ───────────────────────────────────────────────────────────
ipcMain.handle('pick-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Claude Code Project',
    message: 'Select a folder containing a .claude directory',
    buttonLabel: 'Open Project',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  const dir = result.filePaths[0]
  // Validate it's a Claude Code project
  const hasClaudeDir = fs.existsSync(path.join(dir, '.claude'))
  const hasCLAUDEmd = fs.existsSync(path.join(dir, 'CLAUDE.md'))
  return { path: dir, hasClaudeDir, hasCLAUDEmd, name: path.basename(dir) }
})

// ─── Auto-detect Claude Code projects on disk ─────────────────────────────────
ipcMain.handle('detect-projects', async () => {
  const home = os.homedir()
  const candidates = [home, path.join(home, 'projects'), path.join(home, 'code'),
    path.join(home, 'dev'), path.join(home, 'workspace'), path.join(home, 'repos')]
  const found = []
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue
    try {
      const entries = fs.readdirSync(base)
      for (const entry of entries) {
        const full = path.join(base, entry)
        try {
          if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '.claude'))) {
            found.push({ path: full, name: entry, hasCLAUDEmd: fs.existsSync(path.join(full, 'CLAUDE.md')) })
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  // Also check home dir itself
  if (fs.existsSync(path.join(home, '.claude')))
    found.unshift({ path: home, name: '~', hasCLAUDEmd: fs.existsSync(path.join(home, 'CLAUDE.md')) })
  return found.slice(0, 20)
})

// ─── Project-relative helpers ─────────────────────────────────────────────────
ipcMain.handle('list-agents', async (_, projectPath) => {
  const agentsDir = path.join(projectPath, '.claude', 'agents')
  const globalAgents = path.join(os.homedir(), '.claude', 'agents')
  const ECC_NAMES = ['planner','architect','code-reviewer','security-reviewer','tdd-guide',
    'e2e-runner','refactor-cleaner','build-error-resolver','performance-optimizer',
    'doc-updater','typescript-reviewer','python-reviewer','go-reviewer','rust-reviewer',
    'loop-operator','harness-optimizer','docs-lookup']
  const dirs = [agentsDir, globalAgents].filter(d => fs.existsSync(d))
  const seen = new Set()
  const agents = []
  for (const dir of dirs) {
    try {
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
        if (seen.has(file)) continue; seen.add(file)
        const content = fs.readFileSync(path.join(dir, file), 'utf8')
        const fm = {}
        const match = content.match(/^---\n([\s\S]*?)\n---/)
        if (match) match[1].split('\n').forEach(line => {
          const [k, ...rest] = line.split(':')
          if (k && rest.length) fm[k.trim()] = rest.join(':').trim()
        })
        const name = fm.name || file.replace('.md','')
        agents.push({ file, name, description: fm.description || '', model: fm.model || 'claude-sonnet-4-6',
          isECC: ECC_NAMES.includes(name) })
      }
    } catch (_) {}
  }
  return agents
})

ipcMain.handle('read-memory-stats', async (_, projectPath) => {
  const memDir = path.join(projectPath, 'memory')
  if (!fs.existsSync(memDir)) return []
  try {
    return fs.readdirSync(memDir).filter(f => f.endsWith('.md')).map(file => {
      const content = fs.existsSync(path.join(memDir, file)) ? fs.readFileSync(path.join(memDir, file), 'utf8') : ''
      const size = Buffer.byteLength(content, 'utf8')
      const cap = MEMORY_CAPS[file] || 8000
      return { file, size, cap, pct: Math.min(100, Math.round((size / cap) * 100)) }
    })
  } catch (_) { return [] }
})

ipcMain.handle('read-claude-md', async (_, projectPath) => {
  const p = path.join(projectPath, 'CLAUDE.md')
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null } catch (_) { return null }
})

ipcMain.handle('read-log-entries', async (_, count = 80) => {
  try {
    if (!fs.existsSync(BASH_LOG)) return []
    const lines = fs.readFileSync(BASH_LOG, 'utf8').split('\n').filter(l => l.trim())
    return lines.slice(-count).reverse().map((line, i) => {
      const m = line.match(/^\[([^\]]+)\]\s+(.+)$/)
      return m ? { id: i, ts: m[1], cmd: m[2] } : { id: i, ts: '', cmd: line.trim() }
    })
  } catch (_) { return [] }
})

ipcMain.handle('list-sessions', async () => {
  try {
    const out = execSync("ps aux | grep -i 'claude' | grep -v grep | grep -v Electron", { encoding: 'utf8', timeout: 3000 })
    return out.split('\n').filter(l => l.trim()).map(line => {
      const parts = line.trim().split(/\s+/)
      const cmd = parts.slice(10).join(' ')
      const cwdM = cmd.match(/--cwd[= ]([^\s]+)/)
      return { pid: parts[1], cpu: parts[2], mem: parts[3], dir: cwdM ? path.basename(cwdM[1]) : 'claude', cmd: cmd.slice(0,80) }
    })
  } catch (_) { return [] }
})

ipcMain.handle('read-hooks', async () => {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS)) return []
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
    const result = []
    for (const [type, entries] of Object.entries(settings.hooks || {})) {
      if (Array.isArray(entries)) entries.forEach(e => {
        if (e.hooks) e.hooks.forEach(h => result.push({ type, command: h.command || '' }))
      })
    }
    return result
  } catch (_) { return [] }
})

// ─── Streaming Claude API ─────────────────────────────────────────────────────
ipcMain.on('claude-stream-start', async (event, { id, apiKey, model, messages, system }) => {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 8096, stream: true, system: system || '', messages })
    })
    if (!res.ok) { event.sender.send('stream-error', { id, error: await res.text() }); return }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const p = JSON.parse(data)
          if (p.type === 'content_block_delta' && p.delta?.type === 'text_delta')
            event.sender.send('stream-chunk', { id, text: p.delta.text })
          if (p.type === 'message_stop') event.sender.send('stream-done', { id })
          if (p.type === 'message_start' && p.message?.usage)
            event.sender.send('stream-usage', { id, usage: p.message.usage })
        } catch (_) {}
      }
    }
    event.sender.send('stream-done', { id })
  } catch (e) { event.sender.send('stream-error', { id, error: e.message }) }
})

// ─── Shell helpers ────────────────────────────────────────────────────────────
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))
ipcMain.handle('open-in-finder', (_, p) => shell.openPath(p))
ipcMain.handle('open-in-terminal', (_, dir) => {
  try { execSync(`open -a Terminal "${dir}"`); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  startLogWatcher()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { stopLogWatcher(); if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', stopLogWatcher)
