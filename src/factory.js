/* ═══════════════════════════════════════════════════════════════
   Dark Factory — Autonomous Agent Task Execution
   Goal → decompose → task DAG → run → report
═══════════════════════════════════════════════════════════════ */
'use strict'

const factoryState = {
  graph: null,
  taskStatus: {},   // taskId → 'pending'|'running'|'done'|'error'
  running: false,
  initialized: false,
}

function factoryInit() {
  if (factoryState.initialized) return
  factoryState.initialized = true

  document.getElementById('factoryDecomposeBtn')?.addEventListener('click', factoryDecompose)
  document.getElementById('factoryLaunchBtn')?.addEventListener('click', factoryLaunch)
  document.getElementById('factoryClearBtn')?.addEventListener('click', factoryClear)

  window.helm.onFactoryGraph?.(({ graph }) => {
    factoryState.graph = graph
    factoryState.taskStatus = {}
    graph.tasks.forEach(t => { factoryState.taskStatus[t.id] = 'pending' })
    renderFactoryGraph()
    factoryLog(`✓ Decomposed into ${graph.tasks.length} tasks`, 'success')
    document.getElementById('factoryLaunchBtn').disabled = false
    document.getElementById('factoryStatusBadge').textContent = 'Ready'
    document.getElementById('factoryStatusBadge').className = 'factory-status-badge'
    const total = graph.tasks.reduce((s, t) => s + (t.estimatedCost || 0), 0)
    document.getElementById('factoryEstCost').textContent = `$${total.toFixed(3)}`
    document.getElementById('factoryTaskCount').textContent = graph.tasks.length
    document.getElementById('factoryCostRow').style.display = 'flex'
  })

  window.helm.onFactoryError?.(({ error }) => {
    factoryLog(`✗ Error: ${error}`, 'error')
    setBadge('Error', 'error')
    document.getElementById('factoryDecomposeBtn').disabled = false
  })
}

function factoryDecompose() {
  if (!state.apiKey) { showToast('Add your API key in Settings first', 'error'); return }
  const goal = document.getElementById('factoryGoal').value.trim()
  if (!goal) { showToast('Enter a goal first', 'error'); return }

  factoryLog(`⚡ Decomposing goal: "${goal.slice(0, 60)}…"`, 'running')
  setBadge('Decomposing…', 'running')
  document.getElementById('factoryDecomposeBtn').disabled = true
  document.getElementById('factoryLaunchBtn').disabled = true

  const projectContext = state.project ? `Project: ${state.project.name}. ${state.systemPrompt?.slice(0, 300) || ''}` : ''

  window.helm.factoryDecompose({
    id: 'factory-' + Date.now(),
    apiKey: state.apiKey,
    model: state.model,
    goal,
    projectContext,
  })
}

async function factoryLaunch() {
  if (!factoryState.graph || factoryState.running) return
  factoryState.running = true
  setBadge('Running', 'running')
  document.getElementById('factoryLaunchBtn').disabled = true
  document.getElementById('factoryDecomposeBtn').disabled = true

  const tasks = factoryState.graph.tasks
  factoryLog(`▶ Launching ${tasks.length}-task factory…`, 'running')

  // Execute tasks respecting dependencies
  const done = new Set()
  const maxRounds = tasks.length * 2

  for (let round = 0; round < maxRounds && done.size < tasks.length; round++) {
    const ready = tasks.filter(t =>
      !done.has(t.id) &&
      factoryState.taskStatus[t.id] !== 'done' &&
      (t.depends || []).every(dep => done.has(dep))
    )

    if (!ready.length) break

    for (const task of ready) {
      factoryState.taskStatus[task.id] = 'running'
      updateTaskNode(task.id, 'running')
      factoryLog(`▶ [${task.agent}] ${task.name}`, 'running')

      try {
        await runFactoryTask(task)
        factoryState.taskStatus[task.id] = 'done'
        done.add(task.id)
        updateTaskNode(task.id, 'done')
        factoryLog(`✓ [${task.agent}] ${task.name} complete`, 'success')
        await window.helm.recordAgentUse({ agentName: task.agent, sessionId: 'factory-' + Date.now(), cost: task.estimatedCost || 0, success: true })
      } catch (e) {
        factoryState.taskStatus[task.id] = 'error'
        updateTaskNode(task.id, 'error')
        factoryLog(`✗ [${task.agent}] ${task.name}: ${e.message}`, 'error')
        done.add(task.id)  // continue despite error
      }
    }
  }

  factoryState.running = false
  const errors = Object.values(factoryState.taskStatus).filter(s => s === 'error').length
  if (errors === 0) {
    setBadge('Complete', 'done')
    factoryLog(`✦ Factory complete — ${tasks.length} tasks executed`, 'success')
    await window.helm.recordDecision({ description: `Dark Factory: ${factoryState.graph.title}`, source: 'factory' })
  } else {
    setBadge('Done (errors)', 'error')
    factoryLog(`⚠ Factory done with ${errors} error(s)`, 'error')
  }
  document.getElementById('factoryDecomposeBtn').disabled = false
}

function runFactoryTask(task) {
  return new Promise((resolve, reject) => {
    if (!state.apiKey) { reject(new Error('No API key')); return }

    const id = 'factory-task-' + Date.now()
    let text = ''
    let done = false

    const onChunk = ({ id: cid, text: t }) => { if (cid === id) text += t }
    const onDone  = ({ id: cid }) => {
      if (cid === id && !done) { done = true; resolve(text) }
    }
    const onError = ({ id: cid, error }) => {
      if (cid === id && !done) { done = true; reject(new Error(error)) }
    }

    window.helm.onStreamChunk(onChunk)
    window.helm.onStreamDone(onDone)
    window.helm.onStreamError(onError)

    const system = state.systemPrompt || `You are ${task.agent}, a specialist AI agent. Complete the task concisely and return structured output.`
    window.helm.streamStart(id, state.apiKey, state.model, [{ role: 'user', content: task.prompt }], system)

    // Timeout safety
    setTimeout(() => { if (!done) { done = true; resolve(text || '(timeout — partial result)') } }, 60000)
  })
}

function factoryClear() {
  factoryState.graph = null
  factoryState.taskStatus = {}
  factoryState.running = false
  document.getElementById('factoryGoal').value = ''
  document.getElementById('factoryLog').innerHTML = '<div class="factory-log-empty">Factory output appears here…</div>'
  document.getElementById('factoryCostRow').style.display = 'none'
  document.getElementById('factoryLaunchBtn').disabled = true
  document.getElementById('factoryDecomposeBtn').disabled = false
  setBadge('Idle', '')
  clearFactoryGraph()
}

function factoryLog(msg, type = '') {
  const log = document.getElementById('factoryLog')
  const empty = log.querySelector('.factory-log-empty')
  if (empty) empty.remove()
  const el = document.createElement('div')
  el.className = `factory-log-entry ${type}`
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  log.appendChild(el)
  log.scrollTop = log.scrollHeight
}

function setBadge(text, type) {
  const badge = document.getElementById('factoryStatusBadge')
  badge.textContent = text
  badge.className = `factory-status-badge ${type}`
}

// ─── SVG Task Graph ───────────────────────────────────────────────────────────
function renderFactoryGraph() {
  const svg = document.getElementById('factory-svg')
  if (!svg || !factoryState.graph) return
  const tasks = factoryState.graph.tasks
  svg.innerHTML = ''

  const W = svg.parentElement.clientWidth || 600
  const H = svg.parentElement.clientHeight || 300

  // Add arrow marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.3)"/></marker>`
  svg.appendChild(defs)

  // Layout: layered by dependency depth
  const depths = {}
  function getDepth(id, visited = new Set()) {
    if (visited.has(id)) return 0
    visited.add(id)
    const task = tasks.find(t => t.id === id)
    if (!task || !task.depends?.length) return 0
    return 1 + Math.max(...task.depends.map(d => getDepth(d, new Set(visited))))
  }
  tasks.forEach(t => { depths[t.id] = getDepth(t.id) })

  const maxDepth = Math.max(...Object.values(depths))
  const cols = maxDepth + 1
  const colGroups = {}
  for (let i = 0; i <= maxDepth; i++) colGroups[i] = []
  tasks.forEach(t => colGroups[depths[t.id]].push(t))

  const colW = W / cols
  const positions = {}

  for (let col = 0; col <= maxDepth; col++) {
    const group = colGroups[col]
    group.forEach((t, row) => {
      const x = colW * col + colW / 2
      const y = (H / (group.length + 1)) * (row + 1)
      positions[t.id] = { x, y }
    })
  }

  // Draw edges
  tasks.forEach(t => {
    ;(t.depends || []).forEach(dep => {
      const from = positions[dep], to = positions[t.id]
      if (!from || !to) return
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const mx = (from.x + to.x) / 2
      line.setAttribute('d', `M ${from.x} ${from.y} C ${mx} ${from.y} ${mx} ${to.y} ${to.x} ${to.y}`)
      line.setAttribute('class', 'task-edge')
      svg.appendChild(line)
    })
  })

  // Draw nodes
  tasks.forEach(t => {
    const { x, y } = positions[t.id]
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', `task-node ${factoryState.taskStatus[t.id] || 'pending'}`)
    g.setAttribute('id', `task-node-${t.id}`)

    const W_NODE = 120, H_NODE = 52
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', x - W_NODE / 2); rect.setAttribute('y', y - H_NODE / 2)
    rect.setAttribute('width', W_NODE); rect.setAttribute('height', H_NODE)
    rect.setAttribute('rx', 8)

    const name = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    name.setAttribute('x', x); name.setAttribute('y', y - 6)
    name.setAttribute('text-anchor', 'middle')
    name.setAttribute('fill', 'rgba(255,255,255,0.85)')
    name.setAttribute('font-size', '10')
    name.setAttribute('font-weight', '600')
    name.setAttribute('font-family', 'Inter, sans-serif')
    name.textContent = t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name

    const agent = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    agent.setAttribute('x', x); agent.setAttribute('y', y + 10)
    agent.setAttribute('text-anchor', 'middle')
    agent.setAttribute('fill', 'rgba(99,102,241,0.9)')
    agent.setAttribute('font-size', '9')
    agent.setAttribute('font-family', 'JetBrains Mono, monospace')
    agent.textContent = t.agent

    const cost = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    cost.setAttribute('x', x); cost.setAttribute('y', y + 22)
    cost.setAttribute('text-anchor', 'middle')
    cost.setAttribute('fill', 'rgba(148,163,184,0.5)')
    cost.setAttribute('font-size', '8')
    cost.setAttribute('font-family', 'JetBrains Mono, monospace')
    cost.textContent = `~$${(t.estimatedCost || 0).toFixed(3)}`

    g.appendChild(rect); g.appendChild(name); g.appendChild(agent); g.appendChild(cost)
    svg.appendChild(g)
  })

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  title.setAttribute('x', W / 2); title.setAttribute('y', 18)
  title.setAttribute('text-anchor', 'middle')
  title.setAttribute('fill', 'rgba(255,255,255,0.35)')
  title.setAttribute('font-size', '11')
  title.setAttribute('font-family', 'Inter, sans-serif')
  title.textContent = factoryState.graph.title
  svg.appendChild(title)
}

function updateTaskNode(taskId, status) {
  const node = document.getElementById(`task-node-${taskId}`)
  if (node) node.className.baseVal = `task-node ${status}`
}

function clearFactoryGraph() {
  const svg = document.getElementById('factory-svg')
  if (svg) svg.innerHTML = ''
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', factoryInit)
