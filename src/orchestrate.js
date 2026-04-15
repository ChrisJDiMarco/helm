/* ═══════════════════════════════════════════════════════════════
   Orchestrate — Visual Agent Canvas
   Physics-based force simulation, genome-sized nodes, live inspector
═══════════════════════════════════════════════════════════════ */
'use strict'

const orchState = {
  nodes: [],
  edges: [],
  genome: {},
  sim: null,
  canvas: null,
  ctx: null,
  W: 0, H: 0,
  hoveredNode: null,
  selectedNode: null,
  filter: '',
  animFrame: null,
  initialized: false,
  dragging: null,
  dragOffX: 0, dragOffY: 0,
}

const AGENT_COLORS = {
  jarvis:  { fill: 'rgba(167,139,250,0.18)', stroke: '#a78bfa', glow: 'rgba(167,139,250,0.5)' },
  ecc:     { fill: 'rgba(52,211,153,0.15)',  stroke: '#34d399', glow: 'rgba(52,211,153,0.45)' },
  project: { fill: 'rgba(251,191,36,0.15)',  stroke: '#fbbf24', glow: 'rgba(251,191,36,0.45)' },
}

const JARVIS_AGENTS = new Set([
  'orchestrator','researcher','content-creator','scheduler','finance','builder',
  'app-studio','analyst','web-designer','planner','architect'
])
const ECC_AGENTS = new Set([
  'code-reviewer','security-reviewer','tdd-guide','e2e-runner','refactor-cleaner',
  'build-error-resolver','performance-optimizer','doc-updater','typescript-reviewer',
  'python-reviewer','go-reviewer','rust-reviewer','loop-operator','harness-optimizer',
  'docs-lookup'
])

function getAgentCategory(name) {
  if (JARVIS_AGENTS.has(name)) return 'jarvis'
  if (ECC_AGENTS.has(name)) return 'ecc'
  return 'project'
}

function orchInit() {
  if (orchState.initialized) return
  orchState.initialized = true

  const canvas = document.getElementById('orchestrate-canvas')
  if (!canvas) return
  orchState.canvas = canvas
  orchState.ctx = canvas.getContext('2d')

  window.helm.onFileChanged?.(() => {})  // ensure IPC listener exists

  canvas.addEventListener('mousemove', orchOnMouseMove)
  canvas.addEventListener('click', orchOnClick)
  canvas.addEventListener('mousedown', orchOnMouseDown)
  canvas.addEventListener('mouseup', () => { orchState.dragging = null })
  canvas.addEventListener('mouseleave', () => { orchState.hoveredNode = null })

  document.getElementById('orchSearch')?.addEventListener('input', e => {
    orchState.filter = e.target.value.toLowerCase()
    orchRender()
  })

  window.addEventListener('resize', orchResize)
}

async function loadOrchestrate() {
  orchInit()
  const canvas = orchState.canvas
  if (!canvas) return

  orchResize()

  // Load genome data
  const store = await window.helm.storeGet()
  orchState.genome = store.genome || {}

  // Build nodes from agent list
  const agents = state.agents || []
  const maxUses = Math.max(1, ...Object.values(orchState.genome).map(g => g.uses || 0))

  orchState.nodes = agents.map((a, i) => {
    const cat = getAgentCategory(a.name)
    const g = orchState.genome[a.name] || { uses: 0, successRate: 1 }
    const useFrac = g.uses / maxUses
    const r = 10 + useFrac * 18  // radius 10–28 based on usage
    // Spiral initial placement
    const angle = (i / agents.length) * Math.PI * 2
    const dist = 160 + (i % 5) * 40
    return {
      id: a.name, label: a.name, model: a.model, desc: a.description,
      category: cat, r,
      x: orchState.W / 2 + Math.cos(angle) * dist,
      y: orchState.H / 2 + Math.sin(angle) * dist,
      vx: 0, vy: 0,
      genome: g, agent: a,
    }
  })

  // Build edges: connect agents that share keywords or are in same category
  orchState.edges = []
  const nodeMap = new Map(orchState.nodes.map(n => [n.id, n]))
  const pairs = new Set()
  for (const n of orchState.nodes) {
    // Within-team soft edges (1 per node to avoid clutter)
    const teammates = orchState.nodes.filter(m => m.id !== n.id && m.category === n.category)
    if (teammates.length) {
      const target = teammates[Math.floor(Math.random() * Math.min(3, teammates.length))]
      const key = [n.id, target.id].sort().join('|')
      if (!pairs.has(key)) { pairs.add(key); orchState.edges.push({ source: n, target }) }
    }
  }

  // Start physics simulation
  orchStartSim()

  document.getElementById('orchMeta').textContent =
    `${agents.length} agents · ${Object.values(orchState.genome).filter(g => g.uses > 0).length} with genome data`
}

function orchResize() {
  const canvas = orchState.canvas
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio
  orchState.ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
  orchState.W = rect.width
  orchState.H = rect.height
}

function orchStartSim() {
  if (orchState.animFrame) cancelAnimationFrame(orchState.animFrame)

  function tick() {
    // Force simulation
    const nodes = orchState.nodes.filter(n => !orchState.filter || n.id.includes(orchState.filter))
    const cx = orchState.W / 2, cy = orchState.H / 2

    for (const n of nodes) {
      if (orchState.dragging === n) continue
      // Center gravity
      n.vx += (cx - n.x) * 0.001
      n.vy += (cy - n.y) * 0.001

      // Repulsion between nodes
      for (const m of nodes) {
        if (m === n) continue
        const dx = n.x - m.x, dy = n.y - m.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const minDist = n.r + m.r + 20
        if (dist < minDist) {
          const force = (minDist - dist) / dist * 0.08
          n.vx += dx * force; n.vy += dy * force
        }
      }

      // Edge attraction
      for (const e of orchState.edges) {
        if (e.source === n || e.target === n) {
          const other = e.source === n ? e.target : e.source
          const dx = other.x - n.x, dy = other.y - n.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const target = 120
          const force = (dist - target) / dist * 0.003
          n.vx += dx * force; n.vy += dy * force
        }
      }

      // Damping + boundary
      n.vx *= 0.88; n.vy *= 0.88
      n.x = Math.max(n.r + 10, Math.min(orchState.W - n.r - 10, n.x + n.vx))
      n.y = Math.max(n.r + 50, Math.min(orchState.H - n.r - 10, n.y + n.vy))
    }

    orchRender()
    orchState.animFrame = requestAnimationFrame(tick)
  }
  tick()
}

function orchRender() {
  const { ctx, W, H, nodes, edges, hoveredNode, selectedNode, filter } = orchState
  if (!ctx) return

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = '#08061a'
  ctx.fillRect(0, 0, W, H)

  const visibleNodes = filter ? nodes.filter(n => n.id.includes(filter)) : nodes

  // Draw edges
  for (const e of edges) {
    if (filter && (!visibleNodes.includes(e.source) || !visibleNodes.includes(e.target))) continue
    ctx.beginPath()
    ctx.moveTo(e.source.x, e.source.y)
    ctx.lineTo(e.target.x, e.target.y)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Draw nodes
  for (const n of visibleNodes) {
    const colors = AGENT_COLORS[n.category] || AGENT_COLORS.project
    const isHovered = n === hoveredNode
    const isSelected = n === selectedNode
    const alpha = filter && !n.id.includes(filter) ? 0.15 : 1

    ctx.globalAlpha = alpha

    // Glow for hovered/selected
    if (isHovered || isSelected) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 8, 0, Math.PI * 2)
      const grd = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 16)
      grd.addColorStop(0, colors.glow)
      grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd
      ctx.fill()
    }

    // Node circle
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fillStyle = colors.fill
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#fff' : colors.stroke
    ctx.lineWidth = isSelected ? 2 : 1.5
    ctx.stroke()

    // Genome success ring (outer arc)
    if (n.genome.uses > 0) {
      const sr = n.genome.successRate || 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sr)
      ctx.strokeStyle = sr > 0.8 ? '#34d399' : sr > 0.5 ? '#fbbf24' : '#f87171'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label
    const fontSize = Math.max(8, Math.min(11, n.r * 0.75))
    ctx.font = `600 ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    const label = n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label
    ctx.fillText(label, n.x, n.y)

    // Usage count badge
    if (n.genome.uses > 0) {
      ctx.font = `700 8px JetBrains Mono, monospace`
      ctx.fillStyle = colors.stroke
      ctx.fillText(`×${n.genome.uses}`, n.x, n.y + n.r + 10)
    }

    ctx.globalAlpha = 1
  }
}

function orchGetNodeAt(mx, my) {
  const filter = orchState.filter
  for (const n of orchState.nodes) {
    if (filter && !n.id.includes(filter)) continue
    const dx = n.x - mx, dy = n.y - my
    if (Math.sqrt(dx * dx + dy * dy) <= n.r + 4) return n
  }
  return null
}

function orchOnMouseMove(e) {
  const rect = orchState.canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left, my = e.clientY - rect.top
  if (orchState.dragging) {
    orchState.dragging.x = mx + orchState.dragOffX
    orchState.dragging.y = my + orchState.dragOffY
    orchState.dragging.vx = 0; orchState.dragging.vy = 0
    return
  }
  const hit = orchGetNodeAt(mx, my)
  orchState.hoveredNode = hit
  orchState.canvas.style.cursor = hit ? 'pointer' : 'default'
}

function orchOnMouseDown(e) {
  const rect = orchState.canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left, my = e.clientY - rect.top
  const hit = orchGetNodeAt(mx, my)
  if (hit) {
    orchState.dragging = hit
    orchState.dragOffX = hit.x - mx
    orchState.dragOffY = hit.y - my
  }
}

function orchOnClick(e) {
  const rect = orchState.canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left, my = e.clientY - rect.top
  const hit = orchGetNodeAt(mx, my)
  if (hit) {
    orchState.selectedNode = hit
    showOrchInspector(hit)
  } else {
    orchState.selectedNode = null
    document.getElementById('orchInspector').style.display = 'none'
  }
}

function showOrchInspector(node) {
  const panel = document.getElementById('orchInspector')
  document.getElementById('orchInspName').textContent = node.label
  document.getElementById('orchInspModel').textContent = node.agent.model || 'claude-sonnet-4-6'
  document.getElementById('orchInspDesc').textContent = node.agent.description || '(no description)'

  const g = node.genome
  const genomeEl = document.getElementById('orchInspGenome')
  if (g.uses > 0) {
    genomeEl.innerHTML = `Uses: <strong>${g.uses}</strong> · Success: <strong>${Math.round((g.successRate || 1) * 100)}%</strong> · Cost: <strong>$${(g.totalCost || 0).toFixed(3)}</strong>`
  } else {
    genomeEl.textContent = 'No genome data yet — use this agent to build it'
  }

  document.getElementById('orchUseBtn').onclick = () => {
    switchView('chat')
    const input = document.getElementById('chatInput')
    if (input) {
      input.value = `Use the ${node.label} agent to `
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
    panel.style.display = 'none'
  }

  panel.style.display = 'block'
}

function closeOrchInspector() {
  orchState.selectedNode = null
  document.getElementById('orchInspector').style.display = 'none'
}
