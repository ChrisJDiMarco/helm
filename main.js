const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
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
    icon: path.join(__dirname, 'assets', 'icon.icns'),
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
  const agentsDir    = path.join(projectPath, '.claude', 'agents')
  const globalAgents = path.join(os.homedir(), '.claude', 'agents')
  const jarvisAgents = path.join(os.homedir(), 'jarvis', '.claude', 'agents')
  const ECC_NAMES = ['planner','architect','code-reviewer','security-reviewer','tdd-guide',
    'e2e-runner','refactor-cleaner','build-error-resolver','performance-optimizer',
    'doc-updater','typescript-reviewer','python-reviewer','go-reviewer','rust-reviewer',
    'loop-operator','harness-optimizer','docs-lookup']
  const dirs = [agentsDir, jarvisAgents, globalAgents].filter(d => fs.existsSync(d))
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
          isECC: ECC_NAMES.includes(name), filePath: path.join(dir, file) })
      }
    } catch (_) {}
  }
  return agents
})

ipcMain.handle('read-memory-stats', async (_, projectPath) => {
  // Prefer the project's own memory/ folder; fall back to ~/jarvis/memory/
  const candidates = [
    path.join(projectPath, 'memory'),
    path.join(os.homedir(), 'jarvis', 'memory'),
  ]
  const memDir = candidates.find(d => fs.existsSync(d))
  if (!memDir) return []
  try {
    return fs.readdirSync(memDir).filter(f => f.endsWith('.md')).map(file => {
      const content = fs.readFileSync(path.join(memDir, file), 'utf8')
      const size = Buffer.byteLength(content, 'utf8')
      const cap = MEMORY_CAPS[file] || 8000
      return { file, size, cap, pct: Math.min(100, Math.round((size / cap) * 100)), dir: memDir }
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

// ─── Universe / Wiki Graph ────────────────────────────────────────────────────
const WIKI_ROOT  = path.join(os.homedir(), 'jarvis', 'wiki')
const GRAPH_FILE = path.join(WIKI_ROOT, 'graph.json')
const WIKI_BUILDER = path.join(os.homedir(), 'jarvis', 'skills', 'wiki-builder.py')

// load-graph is defined below in the auto-graph section

ipcMain.handle('open-obsidian', async (_, filePath) => {
  // First try to open the corresponding wiki article (inside ~/jarvis/wiki/ vault)
  // Wiki filenames are {type}_{basename}.md — scan for a match
  const baseName = path.basename(filePath, '.md')
  const prefixes = ['skill_', 'agent_', 'project_', 'memory_', 'person_', 'team_', '']
  for (const prefix of prefixes) {
    const wikiFile = path.join(WIKI_ROOT, `${prefix}${baseName}.md`)
    if (fs.existsSync(wikiFile)) {
      try {
        const obsUrl = `obsidian://open?path=${encodeURIComponent(wikiFile)}`
        await shell.openExternal(obsUrl)
        return { ok: true }
      } catch (_) {}
    }
  }
  // Fallback: open source file in default app (Obsidian, VS Code, etc.)
  try { await shell.openPath(filePath); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('run-wiki-builder', async () => {
  try {
    const out = execSync(`python3 "${WIKI_BUILDER}"`, { encoding: 'utf8', timeout: 60000 })
    return { ok: true, output: out }
  } catch (e) { return { ok: false, error: e.message } }
})

// ─── Helm Data Store (JSON, atomic writes) ───────────────────────────────────
const STORE_PATH = path.join(os.homedir(), '.helm-store.json')
const STORE_DEFAULTS = { genome: {}, sessions: [], decisions: [], patterns: [], cognition: {} }

function loadStore() {
  try { return { ...STORE_DEFAULTS, ...JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) } }
  catch (_) { return { ...STORE_DEFAULTS } }
}
function saveStore(store) {
  const tmp = STORE_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2))
  fs.renameSync(tmp, STORE_PATH)
}

ipcMain.handle('store-get', () => loadStore())
ipcMain.handle('store-set', (_, patch) => { saveStore({ ...loadStore(), ...patch }); return { ok: true } })

ipcMain.handle('record-agent-use', (_, { agentName, sessionId, cost, success }) => {
  const store = loadStore()
  if (!store.genome[agentName]) store.genome[agentName] = { uses: 0, sessions: [], successRate: 1.0, totalCost: 0, lastUsed: null }
  const g = store.genome[agentName]
  g.uses++; g.totalCost += (cost || 0); g.lastUsed = new Date().toISOString()
  g.sessions.push({ sessionId: sessionId || 'unknown', cost: cost || 0, success: success !== false, ts: g.lastUsed })
  if (g.sessions.length > 100) g.sessions = g.sessions.slice(-100)
  const recent = g.sessions.slice(-20)
  g.successRate = recent.filter(s => s.success).length / recent.length
  saveStore(store); return { ok: true }
})

ipcMain.handle('record-decision', (_, { description, context, source }) => {
  const store = loadStore()
  store.decisions.push({ id: Date.now().toString(36), timestamp: new Date().toISOString(), description, context: context || '', source: source || 'chat' })
  if (store.decisions.length > 500) store.decisions = store.decisions.slice(-500)
  saveStore(store); return { ok: true }
})

// ─── Codebase Cognition ───────────────────────────────────────────────────────
let cognitionWatcher = null

ipcMain.handle('start-cognition', async (_, projectPath) => {
  if (cognitionWatcher) { try { cognitionWatcher.close() } catch (_) {} cognitionWatcher = null }
  try {
    cognitionWatcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.includes('node_modules') || filename.includes('.git') || filename.includes('.DS_Store')) return
      if (mainWindow && !mainWindow.isDestroyed()) {
        const fullPath = path.join(projectPath, filename)
        let size = 0; try { size = fs.statSync(fullPath).size } catch (_) {}
        mainWindow.webContents.send('file-changed', { eventType, filename, fullPath, ts: Date.now(), size })
      }
    })
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('stop-cognition', () => {
  if (cognitionWatcher) { try { cognitionWatcher.close() } catch (_) {} cognitionWatcher = null }
  return { ok: true }
})

ipcMain.handle('analyze-file-impact', async (_, { projectPath, filename }) => {
  const basename = path.basename(filename, path.extname(filename))
  try {
    const out = execSync(
      `grep -r "${basename}" "${projectPath}" --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.py" -l 2>/dev/null | grep -v node_modules | grep -v ".git" | head -20`,
      { encoding: 'utf8', timeout: 5000 }
    )
    const files = out.split('\n').filter(f => f.trim() && !f.includes(filename))
    return { impactCount: files.length, impactedFiles: files.slice(0, 8) }
  } catch (_) { return { impactCount: 0, impactedFiles: [] } }
})

ipcMain.handle('get-file-complexity', async (_, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n').length
    const fns = (content.match(/function\s+\w+|\w+\s*=\s*(?:async\s*)?\(|=>\s*\{/g) || []).length
    return { lines, functions: fns, complexity: Math.min(100, Math.round((lines / 8) + (fns * 4))) }
  } catch (_) { return { lines: 0, functions: 0, complexity: 0 } }
})

ipcMain.handle('scan-project-files', async (_, projectPath) => {
  const results = []
  const exts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.md']
  function walk(dir, depth = 0) {
    if (depth > 4) return
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') continue
        const full = path.join(dir, entry)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) { walk(full, depth + 1) }
        else if (exts.includes(path.extname(entry))) {
          const content = fs.readFileSync(full, 'utf8')
          const lines = content.split('\n').length
          results.push({ path: full, relative: path.relative(projectPath, full), lines, size: stat.size, mtime: stat.mtimeMs })
        }
      }
    } catch (_) {}
  }
  walk(projectPath)
  return results.sort((a, b) => b.mtime - a.mtime).slice(0, 60)
})

// ─── Git log for Mirror ───────────────────────────────────────────────────────
ipcMain.handle('get-git-log', async (_, projectPath) => {
  try {
    const out = execSync(
      `git -C "${projectPath}" log --no-merges -60 --format="%h|%s|%ai|%an" 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    )
    return out.split('\n').filter(l => l.trim()).map(line => {
      const [hash, subject, date, author] = line.split('|')
      return { hash, subject, date: date?.slice(0, 10), author }
    })
  } catch (_) { return [] }
})

// ─── Dark Factory ─────────────────────────────────────────────────────────────
ipcMain.on('factory-decompose', async (event, { id, apiKey, model, goal, projectContext }) => {
  const system = `You are a task decomposition engine for a multi-agent AI coding system called Helm.
Given a high-level goal, decompose it into a JSON task graph. Return ONLY valid JSON, no prose.

Format:
{
  "title": "brief goal title (max 60 chars)",
  "estimatedTotal": 0.15,
  "tasks": [
    {
      "id": "t1",
      "name": "Task name",
      "agent": "agent-name",
      "prompt": "Exact, self-contained prompt for this agent",
      "depends": [],
      "estimatedCost": 0.04,
      "estimatedMins": 2
    }
  ]
}

Available agents: planner, architect, builder, code-reviewer, security-reviewer, tdd-guide, refactor-cleaner, doc-updater, researcher, analyst
Rules: max 8 tasks, no dependency cycles, prompts must be self-contained, total cost max $1.00
Project context: ${projectContext || 'Claude Code project'}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 2048, system, messages: [{ role: 'user', content: `Decompose this goal:\n\n${goal}` }] })
    })
    if (!res.ok) { event.sender.send('factory-error', { id, error: await res.text() }); return }
    const data = await res.json()
    const text = data.content[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) { event.sender.send('factory-error', { id, error: 'Could not parse task graph from response' }); return }
    event.sender.send('factory-graph', { id, graph: JSON.parse(match[0]) })
  } catch (e) { event.sender.send('factory-error', { id, error: e.message }) }
})

// ─── Mind Mirror ─────────────────────────────────────────────────────────────
ipcMain.on('mirror-analyze', async (event, { id, apiKey, model, memoryContent, gitLog, claudeMd, genomeSummary }) => {
  const system = `You are a project intelligence analyst for an AI development system called Helm.
Analyze project data and return a structured JSON intelligence report. Return ONLY valid JSON, no prose.

Format:
{
  "projectHealth": 82,
  "momentum": "increasing",
  "riskLevel": "low",
  "summary": "2-sentence executive summary",
  "keyDecisions": [{"description":"...","date":"YYYY-MM-DD","impact":"high"}],
  "detectedPatterns": [{"pattern":"...","frequency":3,"insight":"...","recommendation":"..."}],
  "contradictions": [{"a":"...","b":"...","severity":"medium"}],
  "opportunities": [{"opportunity":"...","effort":"low","impact":"high"}],
  "weeklyBriefing": "3 paragraph narrative: current state, trajectory, top 3 recommendations",
  "suggestedRules": ["Add to CLAUDE.md: ..."]
}`

  const userContent = `Analyze this project intelligence:

## Memory Files
${memoryContent || '(no memory files found)'}

## Git History (last 60 commits)
${gitLog?.map(c => `${c.date} ${c.subject}`).join('\n') || '(no git history)'}

## CLAUDE.md
${claudeMd || '(no CLAUDE.md)'}

## Agent Usage (Genome)
${genomeSummary || '(no usage data yet)'}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || 'claude-sonnet-4-6', max_tokens: 4096, system, messages: [{ role: 'user', content: userContent }] })
    })
    if (!res.ok) { event.sender.send('mirror-error', { id, error: await res.text() }); return }
    const data = await res.json()
    const text = data.content[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) { event.sender.send('mirror-error', { id, error: 'Could not parse analysis' }); return }
    event.sender.send('mirror-done', { id, analysis: JSON.parse(match[0]) })
  } catch (e) { event.sender.send('mirror-error', { id, error: e.message }) }
})

// ─── Co-occurrence store (for real Orchestrate edges) ────────────────────────
ipcMain.handle('increment-cooccurrence', (_, agentA, agentB) => {
  const store = loadStore()
  if (!store.cooccurrence) store.cooccurrence = {}
  const key = [agentA, agentB].sort().join('|')
  store.cooccurrence[key] = (store.cooccurrence[key] || 0) + 1
  saveStore(store); return { ok: true }
})

// ─── Universe — Auto Graph Builder ───────────────────────────────────────────
function buildAutoGraph(projectPath) {
  const nodes = []; const links = []
  const nodeIds = new Set()

  function addNode(id, label, type, subtype, excerpt, tags) {
    if (nodeIds.has(id)) return
    nodeIds.add(id)
    nodes.push({ id, label, type, subtype: subtype || type, excerpt: (excerpt || '').slice(0, 120), tags: tags || [], path: id })
  }

  function addLink(source, target, type) {
    if (nodeIds.has(source) && nodeIds.has(target))
      links.push({ source, target, type })
  }

  // Scan memory files
  const memDirs = [
    path.join(projectPath, 'memory'),
    path.join(os.homedir(), 'jarvis', 'memory'),
  ].filter(d => fs.existsSync(d))

  const MEMORY_LAYERS = { 'core.md': 'memory_L0', 'L1-critical-facts.md': 'memory_L1', 'context.md': 'memory_L2', 'decisions.md': 'memory_L2', 'learnings.md': 'memory_L2', 'relationships.md': 'memory_L3' }
  for (const dir of memDirs) {
    try {
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
        const fullPath = path.join(dir, file)
        const content = fs.readFileSync(fullPath, 'utf8').slice(0, 300)
        const subtype = MEMORY_LAYERS[file] || 'memory_L2'
        addNode(fullPath, file.replace('.md', ''), 'memory', subtype, content)
        // Link layer nodes
        if (file !== 'core.md') {
          const coreFile = path.join(dir, 'core.md')
          if (nodeIds.has(coreFile)) addLink(coreFile, fullPath, 'layer')
        }
      }
    } catch (_) {}
  }

  // Scan agents
  const agentDirs = [
    path.join(projectPath, '.claude', 'agents'),
    path.join(os.homedir(), 'jarvis', '.claude', 'agents'),
    path.join(os.homedir(), '.claude', 'agents'),
  ].filter(d => fs.existsSync(d))

  for (const dir of agentDirs) {
    try {
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
        const fullPath = path.join(dir, file)
        const content = fs.readFileSync(fullPath, 'utf8')
        const fm = {}; const m = content.match(/^---\n([\s\S]*?)\n---/)
        if (m) m[1].split('\n').forEach(l => { const [k,...v] = l.split(':'); if (k) fm[k.trim()] = v.join(':').trim() })
        const name = fm.name || file.replace('.md','')
        addNode(fullPath, name, 'agent', 'agent', fm.description, [])
        // Link agents to core memory
        for (const dir2 of memDirs) {
          const coreFile = path.join(dir2, 'core.md')
          if (nodeIds.has(coreFile)) addLink(coreFile, fullPath, 'reference')
        }
      }
    } catch (_) {}
  }

  // Scan skills
  const skillDirs = [
    path.join(projectPath, 'skills'),
    path.join(os.homedir(), 'jarvis', 'skills'),
  ].filter(d => fs.existsSync(d))

  for (const dir of skillDirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (entry.endsWith('.md') && !entry.startsWith('ecc')) {
          const content = fs.readFileSync(full, 'utf8').slice(0, 200)
          addNode(full, entry.replace('.md',''), 'skill', 'skill', content)
        }
      }
    } catch (_) {}
  }

  // Link agents to skills by name match
  for (const n of nodes.filter(n => n.type === 'agent')) {
    for (const s of nodes.filter(n => n.type === 'skill')) {
      if (s.label.includes(n.label) || n.label.includes(s.label))
        addLink(n.id, s.id, 'reference')
    }
  }

  return { nodes, links, meta: { generated: new Date().toISOString(), projectPath } }
}

ipcMain.handle('load-graph', async (_, projectPath) => {
  // Try wiki graph.json first
  try {
    if (fs.existsSync(GRAPH_FILE)) return JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'))
  } catch (_) {}
  // Fall back to auto-generated graph from project files
  if (projectPath) {
    const graph = buildAutoGraph(projectPath)
    if (graph.nodes.length) return graph
  }
  return null
})

// ─── Live Hook Server (receives real Claude Code hook events via HTTP POST) ───
let hookServer = null

function startHookServer() {
  if (hookServer) return
  hookServer = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(200); res.end('Helm hook server OK'); return }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(body)
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('hook-event', event)
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    req.on('error', () => { res.writeHead(400); res.end() })
  })
  hookServer.on('error', e => {
    if (e.code !== 'EADDRINUSE') console.warn('Helm hook server error:', e.message)
  })
  hookServer.listen(7841, '127.0.0.1')
}

function stopHookServer() {
  if (hookServer) { hookServer.close(); hookServer = null }
}

ipcMain.handle('hook-server-status', () => ({
  running: !!hookServer,
  port: 7841,
  url: 'http://127.0.0.1:7841'
}))

ipcMain.handle('install-helm-hooks', async () => {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS)) {
      fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true })
      fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify({ hooks: {} }, null, 2))
    }
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
    if (!settings.hooks) settings.hooks = {}

    const hookTypes = ['PreToolUse', 'PostToolUse', 'Stop']
    for (const hookType of hookTypes) {
      if (!settings.hooks[hookType]) settings.hooks[hookType] = []
      // Check if Helm hook already installed
      const existing = settings.hooks[hookType]
      const helmInstalled = existing.some(entry =>
        entry.hooks?.some(h => h.command?.includes('helm') || h.command?.includes('7841'))
      )
      if (!helmInstalled) {
        settings.hooks[hookType].push({
          matcher: '',
          hooks: [{
            type: 'command',
            command: `curl -s -X POST http://127.0.0.1:7841 -H "Content-Type: application/json" -d '{"type":"${hookType}","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' || true`
          }]
        })
      }
    }
    fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2))
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
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
  // Set dock icon explicitly (required in dev mode on macOS)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'))
  }
  createWindow()
  startLogWatcher()
  startHookServer()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { stopLogWatcher(); stopHookServer(); if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { stopLogWatcher(); stopHookServer() })
