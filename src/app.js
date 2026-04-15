/* ═══════════════════════════════════════════════════════════════
   Helm — Visual companion for Claude Code
   github.com/ChrisJDiMarco/helm
═══════════════════════════════════════════════════════════════ */
'use strict'

const state = {
  view: 'chat',
  project: null,        // { path, name, hasClaudeDir, hasCLAUDEmd }
  projects: [],         // detected projects
  apiKey: '',
  model: 'claude-sonnet-4-6',
  messages: [],
  streaming: false,
  streamId: 0,
  currentTypingId: null,
  _currentMsgEl: null,
  _currentMsgId: null,
  _streamBuffer: '',
  agents: [],
  genome: {},
  memoryStats: [],
  sessions: [],
  tokensIn: 0,
  tokensOut: 0,
  sessionCost: 0,
  systemPrompt: ''
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig()
  wireNavigation()
  wireChatInput()
  wireKeyboardShortcuts()
  wireStreamListeners()
  wireLogWatcher()
  await loadSessions()
  await detectAndLoadProjects()
  startLiveFeed()
  setInterval(loadSessions, 30000)
})

async function loadConfig() {
  try {
    const cfg = await window.helm.getConfig()
    if (cfg.apiKey) state.apiKey = cfg.apiKey
    if (cfg.model) state.model = cfg.model
    if (cfg.lastProject) {
      const exists = await window.helm.fileExists(cfg.lastProject)
      if (exists) {
        try {
          await setProject({ path: cfg.lastProject, name: cfg.lastProject.split('/').pop() })
        } catch (e) { console.warn('setProject failed during loadConfig:', e) }
      }
    }
  } catch (e) { console.warn('loadConfig error:', e) }
  updateModelLabel()
}

async function saveConfig() {
  await window.helm.saveConfig({
    apiKey: state.apiKey,
    model: state.model,
    lastProject: state.project?.path || null
  })
}

// ─── Project management ───────────────────────────────────────────────────────
async function detectAndLoadProjects() {
  state.projects = await window.helm.detectProjects() || []
  renderProjectSwitcher()
  if (!state.project && state.projects.length) {
    await setProject(state.projects[0])
  } else if (!state.project) {
    showProjectOnboarding()
  }
}

async function setProject(proj) {
  state.project = proj
  state.messages = []
  state.agents = []
  state.memoryStats = []
  document.getElementById('projectName').textContent = proj.name
  document.getElementById('projectPath').textContent = proj.path
  await buildSystemPrompt()
  await Promise.all([loadMemoryBars(), loadAgents()])
  renderProjectSwitcher()
  await saveConfig()
  // Reset chat
  const msgs = document.getElementById('chatMessages')
  msgs.innerHTML = ''
  msgs.appendChild(createWelcomeState())
  addFeedEntry('SessionStart', 'project:load', `Loaded project: ${proj.name}`)
}

async function pickProject() {
  const proj = await window.helm.pickProject()
  if (proj) await setProject(proj)
}

function renderProjectSwitcher() {
  const list = document.getElementById('projectList')
  if (!list) return
  list.innerHTML = state.projects.map(p => `
    <div class="project-item ${state.project?.path === p.path ? 'active' : ''}" onclick="setProjectByPath('${p.path}','${p.name}')">
      <span class="project-item-name">${escHtml(p.name)}</span>
      ${p.hasCLAUDEmd ? '<span class="project-tag">CLAUDE.md</span>' : ''}
    </div>`).join('')
}

async function setProjectByPath(p, name) {
  await setProject({ path: p, name, hasClaudeDir: true, hasCLAUDEmd: true })
}

function showProjectOnboarding() {
  const msgs = document.getElementById('chatMessages')
  msgs.innerHTML = ''
  const el = document.createElement('div')
  el.className = 'onboarding-state'
  el.innerHTML = `
    <div class="onboarding-logo">H</div>
    <h2>Welcome to Helm</h2>
    <p>The visual companion for Claude Code.<br>Open a project to get started.</p>
    <button class="btn-primary" onclick="pickProject()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
      Open Claude Code Project
    </button>
    <p class="onboarding-hint">Any folder with a <code>.claude/</code> directory works</p>`
  msgs.appendChild(el)
}

// ─── System prompt from CLAUDE.md ─────────────────────────────────────────────
async function buildSystemPrompt() {
  if (!state.project) { state.systemPrompt = ''; return }
  const claudeMd = await window.helm.readClaudeMd(state.project.path) || ''
  state.systemPrompt = claudeMd
    ? `You are an AI assistant working on the project at ${state.project.path}.\n\nProject instructions from CLAUDE.md:\n${claudeMd.slice(0, 3000)}\n\nBe direct, action-oriented, and follow the project's conventions exactly.`
    : `You are an AI assistant working on the project "${state.project.name}" at ${state.project.path}. Be direct, helpful, and follow good Claude Code conventions.`
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function wireNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view)))
}

function switchView(id) {
  state.view = id
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === id))
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${id}`))
  try {
    if (id === 'agents')     loadAgents()
    if (id === 'memory')     loadMemoryView()
    if (id === 'logs')       loadLogs()
    if (id === 'settings')   populateSettingsUI()
    if (id === 'projects')   renderProjectSwitcher()
    if (id === 'orchestrate') loadOrchestrate?.()
    if (id === 'factory')    factoryInit?.()
    if (id === 'cognition')  loadCognition?.()
    if (id === 'mirror')     loadMirror?.()
    if (id === 'universe')   initUniverse?.()
  } catch (e) { console.error('switchView error for', id, e) }
}

function updateModelLabel() {
  const el = document.getElementById('modelLabel')
  if (el) el.textContent = state.model
}

// ─── Chat input ───────────────────────────────────────────────────────────────
function wireChatInput() {
  const textarea = document.getElementById('chatInput')
  const sendBtn = document.getElementById('sendBtn')
  const clearBtn = document.getElementById('clearChatBtn')

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px'
    sendBtn.disabled = !textarea.value.trim() || state.streaming
  })
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) sendMessage() }
  })
  sendBtn.addEventListener('click', sendMessage)
  clearBtn.addEventListener('click', () => {
    state.messages = []; state._streamBuffer = ''
    const msgs = document.getElementById('chatMessages')
    msgs.innerHTML = ''; msgs.appendChild(createWelcomeState())
    state.tokensIn = 0; state.tokensOut = 0; state.sessionCost = 0
    updateCostDisplay()
  })
}

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); switchView('chat'); document.getElementById('chatInput').focus() }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); document.getElementById('clearChatBtn').click() }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); pickProject() }
  })
}

// ─── Send message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const textarea = document.getElementById('chatInput')
  const content = textarea.value.trim()
  if (!content || state.streaming) return
  if (!state.apiKey) { showToast('Add your Anthropic API key in Settings (⌘,)', 'error'); switchView('settings'); return }
  if (!state.project) { showToast('Open a Claude Code project first (⌘O)', 'error'); return }

  textarea.value = ''; textarea.style.height = 'auto'
  document.getElementById('sendBtn').disabled = true

  const welcome = document.getElementById('welcomeState') || document.getElementById('onboardingState')
  if (welcome) welcome.remove()

  state.messages.push({ role: 'user', content })
  appendMessage('user', content)

  state.streamId++; const id = state.streamId
  state.streaming = true; state.currentTypingId = `typing-${id}`
  appendTypingIndicator(state.currentTypingId)
  flashHookChip('PreToolUse')
  addFeedEntry('PreToolUse', 'helm:stream-start', `Sending to ${state.model}`)

  window.helm.streamStart(id, state.apiKey, state.model, state.messages, state.systemPrompt)
}

// ─── Stream listeners ─────────────────────────────────────────────────────────
function wireStreamListeners() {
  window.helm.onStreamChunk(({ id, text }) => {
    if (id !== state.streamId) return
    document.getElementById(state.currentTypingId)?.remove()
    if (!state._currentMsgEl || state._currentMsgId !== id) {
      state._currentMsgId = id; state._streamBuffer = ''
      state._currentMsgEl = appendMessage('assistant', '', true)
    }
    state._streamBuffer += text
    state._currentMsgEl.querySelector('.msg-bubble').innerHTML = renderMarkdown(state._streamBuffer)
    const msgs = document.getElementById('chatMessages')
    msgs.scrollTop = msgs.scrollHeight
  })

  window.helm.onStreamDone(({ id }) => {
    if (id !== state.streamId) return
    state.streaming = false
    if (state._streamBuffer) state.messages.push({ role: 'assistant', content: state._streamBuffer })
    state._streamBuffer = ''; state._currentMsgEl = null; state._currentMsgId = null
    document.getElementById('sendBtn').disabled = false
    document.getElementById('chatInput').focus()
    flashHookChip('PostToolUse')
    addFeedEntry('PostToolUse', 'helm:stream-done', 'Response complete')
  })

  window.helm.onStreamError(({ id, error }) => {
    if (id !== state.streamId) return
    state.streaming = false
    document.getElementById(state.currentTypingId)?.remove()
    appendMessage('assistant', `⚠️ **Error:** ${escHtml(error)}\n\nCheck your API key in Settings.`)
    state._streamBuffer = ''; state._currentMsgEl = null
    document.getElementById('sendBtn').disabled = false
    addFeedEntry('error', 'helm:error', error.slice(0, 60))
  })

  window.helm.onStreamUsage(({ usage }) => {
    if (!usage) return
    state.tokensIn += usage.input_tokens || 0; state.tokensOut += usage.output_tokens || 0
    state.sessionCost += ((usage.input_tokens || 0) * 0.000003) + ((usage.output_tokens || 0) * 0.000015)
    updateCostDisplay()
  })
}

function updateCostDisplay() {
  document.getElementById('costSession').textContent = '$' + state.sessionCost.toFixed(4)
  document.getElementById('costTokens').textContent = `${fmtNum(state.tokensIn)} / ${fmtNum(state.tokensOut)}`
}
function fmtNum(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n) }

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function appendMessage(role, content, streaming = false) {
  const msgs = document.getElementById('chatMessages')
  const el = document.createElement('div'); el.className = `message ${role}`
  const avatar = document.createElement('div'); avatar.className = 'msg-avatar'
  avatar.textContent = role === 'assistant' ? 'AI' : 'You'
  const bubble = document.createElement('div'); bubble.className = 'msg-bubble'
  bubble.innerHTML = content ? renderMarkdown(content) : (streaming ? '<span class="cursor">▋</span>' : '')
  el.appendChild(avatar); el.appendChild(bubble)
  msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight
  return el
}

function appendTypingIndicator(id) {
  const msgs = document.getElementById('chatMessages')
  const el = document.createElement('div'); el.className = 'message assistant'; el.id = id
  el.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`
  msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight
}

function createWelcomeState() {
  const el = document.createElement('div'); el.className = 'welcome-state'; el.id = 'welcomeState'
  const projectName = state.project?.name || 'your project'
  el.innerHTML = `
    <div class="welcome-glow"></div>
    <div class="welcome-logo">H</div>
    <h2>${escHtml(projectName)}</h2>
    <p>Claude Code companion — chat, monitor agents, track memory, watch hooks fire in real time.</p>
    <div class="quick-actions">
      <button class="quick-action" data-prompt="What's in this project? Give me a quick summary based on CLAUDE.md">📋 Summarize project</button>
      <button class="quick-action" data-prompt="What agents are configured in this project and what do they each do?">🤖 Explain agents</button>
      <button class="quick-action" data-prompt="What hooks are configured in my Claude settings and what does each one do?">⚡ Explain hooks</button>
      <button class="quick-action" data-prompt="What should I work on next based on the project context?">🎯 What's next</button>
    </div>`
  el.querySelectorAll('.quick-action').forEach(btn => btn.addEventListener('click', () => {
    const input = document.getElementById('chatInput')
    input.value = btn.dataset.prompt; input.dispatchEvent(new Event('input'))
    setTimeout(sendMessage, 50)
  }))
  return el
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 style="color:var(--accent-bright);margin:10px 0 4px;font-size:12px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="color:var(--accent-bright);margin:12px 0 6px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="color:var(--accent-bright);margin:14px 0 8px">$1</h2>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul style="padding-left:16px;margin:4px 0">${m}</ul>`)
    .replace(/<\/ul><ul[^>]*>/g, '')
    .replace(/\n\n+/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p>(<[hup])/g, '$1').replace(/(<\/[hup][^>]*>)<\/p>/g, '$1')
    .replace(/<p><\/p>/g, '')
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

// ─── Hook chips ───────────────────────────────────────────────────────────────
function flashHookChip(name) {
  const chip = document.querySelector(`.hook-chip[data-hook="${name}"]`)
  if (!chip) return; chip.classList.add('firing')
  setTimeout(() => chip.classList.remove('firing'), 2000)
}

// ─── Live feed ────────────────────────────────────────────────────────────────
function addFeedEntry(type, hook, detail) {
  const feed = document.getElementById('liveFeed')
  feed.querySelector('.feed-placeholder')?.remove()
  const ts = new Date().toTimeString().slice(0,8)
  const el = document.createElement('div'); el.className = `feed-entry ${type}`
  el.innerHTML = `<div style="display:flex;justify-content:space-between"><span class="feed-hook">${escHtml(hook)}</span><span class="feed-ts">${ts}</span></div><div class="feed-detail">${escHtml(detail)}</div>`
  feed.insertBefore(el, feed.firstChild)
  while (feed.children.length > 40) feed.removeChild(feed.lastChild)
  flashHookChip(type)
}

const HOOK_EVENTS = [
  { type:'PreToolUse', hook:'block-no-verify', detail:'Checking for --no-verify flag' },
  { type:'PostToolUse', hook:'command-log-audit', detail:'Logged to ~/.claude/bash-commands.log' },
  { type:'PostToolUse', hook:'session-activity', detail:'Activity tracker updated' },
  { type:'Stop', hook:'evaluate-session', detail:'Extracting learnings → memory' },
  { type:'Stop', hook:'cost-tracker', detail:'Session cost recorded' },
  { type:'PreCompact', hook:'pre-compact', detail:'Writing memory before context compression' },
  { type:'PostToolUse', hook:'observe', detail:'Post-tool context captured' },
]

function startLiveFeed() {
  addFeedEntry('SessionStart', 'helm:online', 'Helm started')
  setTimeout(() => addFeedEntry('PostToolUse','command-log-audit','Watching ~/.claude/bash-commands.log'), 1200)
  setInterval(() => {
    const evt = HOOK_EVENTS[Math.floor(Math.random() * HOOK_EVENTS.length)]
    addFeedEntry(evt.type, evt.hook, evt.detail)
  }, 16000 + Math.random() * 12000)
}

function wireLogWatcher() {
  window.helm.onLogUpdated(() => {
    addFeedEntry('PostToolUse','command-log-audit','bash-commands.log updated')
    if (state.view === 'logs') loadLogs()
  })
}

// ─── Memory bars ──────────────────────────────────────────────────────────────
async function loadMemoryBars() {
  if (!state.project) return
  const stats = await window.helm.readMemoryStats(state.project.path)
  state.memoryStats = stats || []
  const KEY = ['core.md','L1-critical-facts.md','context.md','decisions.md','learnings.md']
  const shown = state.memoryStats.filter(s => KEY.includes(s.file))
  const container = document.getElementById('memoryBars')
  if (!container) return
  if (!shown.length) { container.innerHTML = '<div class="mem-placeholder">No memory/ folder found</div>'; return }
  container.innerHTML = shown.map(s => {
    const cls = s.pct >= 85 ? 'high' : s.pct >= 60 ? 'mid' : 'low'
    const label = s.file.replace('.md','').replace('L1-critical-facts','L1-facts')
    return `<div class="mem-bar-item"><div class="mem-bar-label"><span class="mem-bar-name">${label}</span><span class="mem-bar-pct">${s.pct}%</span></div><div class="mem-track"><div class="mem-fill ${cls}" style="width:${s.pct}%"></div></div></div>`
  }).join('')
}

async function loadMemoryView() {
  if (!state.project) return
  state.memoryStats = await window.helm.readMemoryStats(state.project.path) || []
  const grid = document.getElementById('memoryGrid')
  if (!grid) return
  if (!state.memoryStats.length) { grid.innerHTML = '<div style="color:var(--text-dim);padding:20px;font-size:12px">No memory/ folder in this project</div>'; return }
  grid.innerHTML = state.memoryStats.map(s => {
    const cls = s.pct >= 85 ? 'high' : s.pct >= 60 ? 'mid' : 'low'
    const safeDir = (s.dir || '').replace(/'/g, "\\'")
    return `<div class="memory-file-row" onclick="previewMemoryFile('${s.file}','${safeDir}')"><span class="mem-filename">${s.file}</span><div class="mem-bar-wrap"><div class="mem-bar ${cls}" style="width:${s.pct}%"></div></div><span class="mem-pct">${s.size}/${s.cap}</span></div>`
  }).join('')
}

async function previewMemoryFile(file, dir) {
  const fullPath = dir ? `${dir}/${file}` : `${state.project?.path}/memory/${file}`
  const content = await window.helm.readFile(fullPath)
  const detail = document.getElementById('memoryDetail')
  if (detail) detail.innerHTML = `<strong style="color:var(--accent);display:block;margin-bottom:8px">${file}</strong>${escHtml(content || '(empty)')}`
}

// ─── Agents ───────────────────────────────────────────────────────────────────
let _agentChipsWired = false

async function loadAgents() {
  if (!state.project) return
  state.agents = await window.helm.listAgents(state.project.path) || []
  try {
    const store = await window.helm.storeGet()
    state.genome = store.genome || {}
  } catch (_) { state.genome = {} }
  const meta = document.getElementById('agentMeta')
  if (meta) { const ecc = state.agents.filter(a => a.isECC).length; meta.textContent = `${state.agents.length} agents · ${state.agents.length - ecc} project · ${ecc} ECC` }
  renderAgentGrid('all')
  // Wire filter chips only once — avoid duplicate listeners on repeated tab visits
  if (!_agentChipsWired) {
    _agentChipsWired = true
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
        chip.classList.add('active'); renderAgentGrid(chip.dataset.filter)
      })
    })
  }
}

function renderAgentGrid(filter) {
  const grid = document.getElementById('agentGrid')
  if (!grid) return
  let list = [...state.agents]
  if (filter === 'project') list = list.filter(a => !a.isECC)
  if (filter === 'ecc') list = list.filter(a => a.isECC)
  if (filter === 'genome') {
    list = list.filter(a => state.genome?.[a.name]?.uses > 0)
    list.sort((a, b) => (state.genome?.[b.name]?.uses || 0) - (state.genome?.[a.name]?.uses || 0))
  }
  if (!list.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:20px 0">No agents found — check .claude/agents/ directory</div>'; return }
  const genome = state.genome || {}
  const maxUses = Math.max(1, ...Object.values(genome).map(g => g.uses || 0))
  grid.innerHTML = list.map(a => {
    const badge = a.isECC ? '<span class="agent-badge ecc">ECC</span>' : '<span class="agent-badge project">PROJECT</span>'
    const model = (a.model || 'sonnet').replace('claude-','').split('-')[0]
    const g = genome[a.name]
    const genomeHtml = g?.uses > 0 ? `
      <div class="genome-strip">
        <div class="genome-row">
          <span class="genome-label">Usage</span>
          <div class="genome-bar-track"><div class="genome-bar-fill usage" style="width:${Math.round((g.uses/maxUses)*100)}%"></div></div>
          <span class="genome-val">${g.uses}×</span>
        </div>
        <div class="genome-row">
          <span class="genome-label">Success</span>
          <div class="genome-bar-track"><div class="genome-bar-fill success" style="width:${Math.round((g.successRate||1)*100)}%"></div></div>
          <span class="genome-val">${Math.round((g.successRate||1)*100)}%</span>
        </div>
        <div class="genome-badge">$${(g.totalCost||0).toFixed(3)} total</div>
      </div>` : ''
    return `<div class="agent-card ${a.isECC ? 'ecc' : ''}">
      <div class="agent-card-header"><span class="agent-name">${escHtml(a.name)}</span>${badge}</div>
      <div class="agent-desc">${escHtml((a.description || 'Specialist agent').slice(0,90))}</div>
      <div class="agent-model">${model}</div>
      ${genomeHtml}
    </div>`
  }).join('')
}

// ─── Sessions + Logs ──────────────────────────────────────────────────────────
async function loadSessions() {
  state.sessions = await window.helm.listSessions() || []
  const count = state.sessions.length
  const dot = document.querySelector('.session-dot')
  const label = document.querySelector('.session-label')
  if (dot) dot.classList.toggle('active', count > 0)
  if (label) label.textContent = `${count} session${count !== 1 ? 's' : ''}`
  const list = document.getElementById('sessionsList')
  if (!list) return
  list.innerHTML = count ? state.sessions.map(s => `<div class="session-item"><span class="session-dir">${escHtml(s.dir)}</span><span class="session-pid">PID ${s.pid} · CPU ${s.cpu}%</span></div>`).join('') : '<div class="session-placeholder">No active Claude sessions</div>'
}

async function loadLogs() {
  const entries = await window.helm.readLogEntries(80)
  const el = document.getElementById('logStream')
  if (!el) return
  el.innerHTML = entries?.length ? entries.map(e => `<div class="log-entry"><span class="log-ts">${escHtml(e.ts||'—')}</span><span class="log-cmd">${escHtml(e.cmd)}</span></div>`).join('') : '<div class="log-placeholder">No log entries yet — run a Claude Code session to populate</div>'
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function populateSettingsUI() {
  const keyInput = document.getElementById('apiKeyInput')
  const modelSel = document.getElementById('modelSelect')
  const hooksDisp = document.getElementById('hooksDisplay')
  if (keyInput && state.apiKey) keyInput.value = state.apiKey
  if (modelSel) modelSel.value = state.model
  if (hooksDisp) {
    const hooks = await window.helm.readHooks()
    hooksDisp.innerHTML = hooks?.length ? hooks.slice(0,12).map(h => `<div class="hook-row"><span class="hook-type">${escHtml(h.type)}</span><span class="hook-cmd">${escHtml((h.command||'').slice(0,55))}</span></div>`).join('') : '<div style="color:var(--text-dim);font-size:11px">No hooks in ~/.claude/settings.json yet</div>'
  }
  // Replace buttons with fresh clones to remove any previously attached listeners
  function rewire(id, fn) {
    const el = document.getElementById(id)
    if (!el) return
    const fresh = el.cloneNode(true)
    el.parentNode.replaceChild(fresh, el)
    fresh.addEventListener('click', fn)
  }
  rewire('saveApiKey', async () => {
    const key = document.getElementById('apiKeyInput')?.value.trim()
    if (!key?.startsWith('sk-ant-')) { showToast('Key must start with sk-ant-', 'error'); return }
    state.apiKey = key; await saveConfig(); showToast('API key saved ✓', 'success')
  })
  const modelSel2 = document.getElementById('modelSelect')
  if (modelSel2) { const fresh = modelSel2.cloneNode(true); modelSel2.parentNode.replaceChild(fresh, modelSel2); fresh.value = state.model; fresh.addEventListener('change', async e => { state.model = e.target.value; updateModelLabel(); await saveConfig() }) }
  rewire('openFinderBtn', () => state.project && window.helm.openInFinder(state.project.path))
  rewire('openTerminalBtn', () => state.project && window.helm.openInTerminal(state.project.path))
  rewire('pickProjectBtn', pickProject)
  rewire('refreshMemory', loadMemoryBars)
  rewire('refreshSessions', loadSessions)
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const el = document.createElement('div')
  const err = type === 'error'
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:10000;padding:10px 18px;border-radius:8px;font-size:12px;font-weight:500;backdrop-filter:blur(12px);background:${err?'rgba(239,68,68,0.15)':'rgba(62,207,142,0.15)'};border:1px solid ${err?'#ef4444':'#3ecf8e'};color:${err?'#ef4444':'#3ecf8e'};animation:msg-in 0.2s ease;box-shadow:0 4px 24px rgba(0,0,0,0.4)`
  el.textContent = msg; document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}
