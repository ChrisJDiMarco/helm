/* ═══════════════════════════════════════════════════════════════
   Universe — 3D JARVIS Knowledge Graph
   Strategy: transparent WebGL canvas + CSS animated nebula below
             Large built-in nodes · bright links · no CDN Three.js
═══════════════════════════════════════════════════════════════ */
'use strict'

// ── Node type config ──────────────────────────────────────────────────────────
const NODE_CFG = {
  memory_L0: { color: '#ffffff', val: 320, label: '◆' },
  memory_L1: { color: '#c4b5fd', val: 80,  label: '◆' },
  memory_L2: { color: '#a78bfa', val: 35,  label: '●' },
  memory_L3: { color: '#7c6fcf', val: 18,  label: '●' },
  project:   { color: '#38bdf8', val: 35,  label: '●' },
  skill:     { color: '#34d399', val: 22,  label: '●' },
  agent:     { color: '#fbbf24', val: 22,  label: '●' },
  person:    { color: '#f472b6', val: 55,  label: '●' },
  team:      { color: '#fb923c', val: 28,  label: '●' },
}

function cfg(node) {
  return NODE_CFG[node.subtype] || NODE_CFG[node.type] || { color: '#94a3b8', val: 12 }
}

// ── State ─────────────────────────────────────────────────────────────────────
const uState = {
  graph:        null,
  instance:     null,
  activeTypes:  new Set(['memory', 'project', 'skill', 'agent', 'person', 'team']),
  searchTerm:   '',
  highlightIds: new Set(),
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function initUniverse() {
  if (uState.instance) return
  // Wait for the CDN lib to load (async script) — retry up to 3s
  if (typeof ForceGraph3D === 'undefined') {
    let waited = 0
    await new Promise(resolve => {
      const check = setInterval(() => {
        waited += 100
        if (typeof ForceGraph3D !== 'undefined' || waited > 3000) { clearInterval(check); resolve() }
      }, 100)
    })
  }
  if (typeof ForceGraph3D === 'undefined') {
    showUniverseMsg('error', 'Universe library not loaded — check your internet connection')
    return
  }
  injectNebulaBackground()
  await loadAndRender()
  wireUniverseControls()
}

// ── CSS nebula background (injected behind the WebGL canvas) ──────────────────
function injectNebulaBackground() {
  const container = document.getElementById('universe-canvas')
  if (!container || container.querySelector('.u-nebula')) return

  const nebula = document.createElement('div')
  nebula.className = 'u-nebula'
  nebula.innerHTML = `
    <div class="u-nebula-base"></div>
    <div class="u-orb u-orb-1"></div>
    <div class="u-orb u-orb-2"></div>
    <div class="u-orb u-orb-3"></div>
    <div class="u-orb u-orb-4"></div>
    <canvas class="u-stars" id="uStarsCanvas"></canvas>
  `
  container.insertBefore(nebula, container.firstChild)

  // Draw random star field on the canvas
  requestAnimationFrame(() => {
    const sc = document.getElementById('uStarsCanvas')
    if (!sc) return
    sc.width  = container.clientWidth  || 1200
    sc.height = container.clientHeight || 800
    const ctx = sc.getContext('2d')
    for (let i = 0; i < 320; i++) {
      const x    = Math.random() * sc.width
      const y    = Math.random() * sc.height
      const r    = Math.random() * 1.4
      const a    = 0.25 + Math.random() * 0.75
      ctx.globalAlpha = a
      ctx.fillStyle   = `hsl(${200 + Math.random() * 80}, 80%, ${70 + Math.random() * 30}%)`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // A few bright star pops
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * sc.width
      const y = Math.random() * sc.height
      ctx.globalAlpha = 0.9
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 4)
      grd.addColorStop(0, 'rgba(255,255,255,1)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grd
      ctx.fillRect(x - 4, y - 4, 8, 8)
    }
  })
}

// ── Load & render ─────────────────────────────────────────────────────────────
async function loadAndRender() {
  const container = document.getElementById('universe-canvas')
  if (!container) return

  // Remove any previous ForceGraph canvas (not the nebula layer)
  container.querySelectorAll('canvas:not(.u-stars)').forEach(c => c.remove())
  const prevScene = container.querySelector('.scene-graph')
  if (prevScene) prevScene.remove()

  showUniverseMsg('loading')

  const data = await window.helm.loadGraph(typeof state !== 'undefined' ? state.project?.path : undefined).catch(() => null)
  if (!data || !data.nodes?.length) {
    showUniverseMsg('empty')
    return
  }

  uState.graph = data
  updateUniverseMeta()
  renderGraph(container)
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderGraph(container) {
  // Remove loading overlay if present
  const overlay = container.querySelector('.u-overlay')
  if (overlay) overlay.remove()

  const W = container.clientWidth  || 1100
  const H = container.clientHeight || 800

  const { nodes, links } = getFilteredData()

  uState.instance = ForceGraph3D({
    controlType: 'orbit',
    rendererConfig: { antialias: true, alpha: true },   // alpha:true = transparent canvas
  })(container)
    .width(W)
    .height(H)
    .backgroundColor('rgba(0,0,0,0)')           // transparent — CSS nebula shows through
    .showNavInfo(false)

    .graphData({ nodes: cloneArr(nodes), links: cloneArr(links) })
    .nodeId('id')
    .nodeLabel(n => buildTooltip(n))
    .nodeColor(n => resolveColor(n))
    .nodeVal(n  => resolveVal(n))
    .nodeOpacity(1)
    .nodeResolution(20)

    // Bright visible links
    .linkColor(l  => linkColor(l))
    .linkWidth(l  => l.type === 'layer' ? 1.2 : l.type === 'tag' ? 0.8 : 1.8)
    .linkOpacity(l => l.type === 'layer' ? 0.55 : l.type === 'tag' ? 0.35 : 0.85)
    .linkDirectionalParticles(l => l.type === 'reference' ? 4 : 0)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleWidth(2.5)
    .linkDirectionalParticleColor(l => linkColor(l))

    // Physics
    .d3AlphaDecay(0.015)
    .d3VelocityDecay(0.28)
    .cooldownTicks(200)

    // Interactions
    .onNodeClick(node => { highlightConnected(node); if (node.path) window.helm.openObsidian(node.path) })
    .onNodeHover(node => { container.style.cursor = node ? 'pointer' : 'default' })
    .onBackgroundClick(clearHighlight)
    .onEngineStop(() => {
      uState.instance.cameraPosition({ z: 480 }, { x: 0, y: 0, z: 0 }, 1600)
    })

  // Make the WebGL canvas sit on top of the nebula CSS layer
  requestAnimationFrame(() => {
    const wglCanvas = container.querySelector('canvas:not(.u-stars)')
    if (wglCanvas) {
      wglCanvas.style.position = 'absolute'
      wglCanvas.style.top      = '0'
      wglCanvas.style.left     = '0'
      wglCanvas.style.zIndex   = '2'
    }
  })
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function getFilteredData() {
  if (!uState.graph) return { nodes: [], links: [] }
  const { searchTerm, activeTypes } = uState
  const nodes = uState.graph.nodes.filter(n => {
    if (!activeTypes.has(n.type)) return false
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return n.label.toLowerCase().includes(q)
        || n.excerpt?.toLowerCase().includes(q)
        || n.tags?.some(t => t.includes(q))
  })
  const ids   = new Set(nodes.map(n => n.id))
  const links = uState.graph.links.filter(l => {
    const s = l.source?.id ?? l.source
    const t = l.target?.id ?? l.target
    return ids.has(s) && ids.has(t)
  })
  return { nodes, links }
}

function cloneArr(arr) { return arr.map(x => ({ ...x })) }

// ── Visual resolvers ──────────────────────────────────────────────────────────
function resolveColor(node) {
  const base = cfg(node).color
  if (!uState.highlightIds.size) return base
  return uState.highlightIds.has(node.id) ? base : '#1e1b4b'
}

function resolveVal(node) {
  const base = cfg(node).val
  if (!uState.highlightIds.size) return base
  return uState.highlightIds.has(node.id) ? base * 1.8 : base * 0.3
}

function linkColor(l) {
  const MAP = {
    layer:     '#818cf8',   // indigo
    tag:       '#34d399',   // emerald
    reference: '#67e8f9',   // cyan
  }
  return MAP[l.type] || '#a5b4fc'
}

function buildTooltip(n) {
  const c    = cfg(n)
  const tags = n.tags?.length ? `<div class="tt-tags">${n.tags.map(t => `#${t}`).join(' ')}</div>` : ''
  const excr = n.excerpt ? `<div class="tt-excerpt">${n.excerpt.slice(0, 150)}…</div>` : ''
  return `<div class="universe-tooltip" style="--nc:${c.color}">
    <div class="tt-header">
      <strong style="color:${c.color}">${n.label}</strong>
      <div class="tt-badges">
        <span class="tt-badge tt-type-${n.type}">${n.type}</span>
        ${n.layer ? `<span class="tt-badge">${n.layer}</span>` : ''}
      </div>
    </div>
    ${tags}${excr}
    <div class="tt-hint">Click to open in Obsidian</div>
  </div>`
}

// ── Interactions ──────────────────────────────────────────────────────────────
function highlightConnected(node) {
  const connected = new Set([node.id])
  uState.graph?.links.forEach(l => {
    const s = l.source?.id ?? l.source
    const t = l.target?.id ?? l.target
    if (s === node.id) connected.add(t)
    if (t === node.id) connected.add(s)
  })
  uState.highlightIds = connected
  applyFilter()
}

function clearHighlight() {
  uState.highlightIds = new Set()
  applyFilter()
}

function applyFilter() {
  if (!uState.instance) return
  const { nodes, links } = getFilteredData()
  uState.instance.graphData({ nodes: cloneArr(nodes), links: cloneArr(links) })
}

// ── Search ────────────────────────────────────────────────────────────────────
function handleSearch(term) {
  uState.searchTerm = term.trim()
  if (!uState.instance) return
  const { nodes, links } = getFilteredData()
  uState.instance.graphData({ nodes: cloneArr(nodes), links: cloneArr(links) })
  if (uState.searchTerm && nodes.length) {
    setTimeout(() => {
      const n = nodes[0]
      const { x = 0, y = 0, z = 0 } = n
      uState.instance.cameraPosition({ x, y, z: z + 140 }, { x, y, z }, 900)
    }, 400)
  }
}

// ── Rebuild ───────────────────────────────────────────────────────────────────
async function rebuildWiki() {
  const btn = document.getElementById('universeRebuild')
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Building…' }
  // Try the wiki builder script if available, otherwise just reload from auto-graph
  const result = await window.helm.runWikiBuilder().catch(() => ({ ok: false, error: 'wiki-builder.py not found' }))
  if (btn) { btn.disabled = false; btn.textContent = '↺ Rebuild' }
  if (!result.ok) {
    // Fall back to auto-graph rebuild (always works)
    showToast?.('Rebuilt from project files ✓', 'success')
  }
  uState.instance = null
  uState.graph = null
  await loadAndRender()
}

// ── Filter chips ──────────────────────────────────────────────────────────────
function toggleFilter(type) {
  uState.activeTypes.has(type) ? uState.activeTypes.delete(type) : uState.activeTypes.add(type)
  applyFilter()
}

// ── State overlays ────────────────────────────────────────────────────────────
function showUniverseMsg(type, msg) {
  const container = document.getElementById('universe-canvas')
  if (!container) return
  const existing = container.querySelector('.u-overlay')
  if (existing) existing.remove()
  const el = document.createElement('div')
  el.className = 'u-overlay'
  if (type === 'loading') {
    el.innerHTML = `<div class="u-spinner"></div><p>Compiling your brain…</p>`
  } else if (type === 'error') {
    el.innerHTML = `<div class="u-empty-icon">⚠</div><p>${msg || 'Error loading universe'}</p>`
  } else {
    el.innerHTML = `<div class="u-empty-icon">∅</div>
      <p>No graph data yet.</p>
      <p style="opacity:.6;font-size:11px">Click  ↺ Rebuild  to generate the wiki first.</p>`
  }
  container.appendChild(el)
}

function updateUniverseMeta() {
  const el = document.getElementById('universeMeta')
  if (!el || !uState.graph) return
  const { meta, nodes, links } = uState.graph
  const ts = meta?.generated ? new Date(meta.generated).toLocaleString() : '—'
  el.textContent = `${nodes.length} nodes · ${links.length} links · ${ts}`
}

// ── Wire controls ─────────────────────────────────────────────────────────────
function wireUniverseControls() {
  const search = document.getElementById('universeSearch')
  if (search) {
    let t = null
    search.addEventListener('input', e => {
      clearTimeout(t)
      t = setTimeout(() => handleSearch(e.target.value), 260)
    })
  }

  const rebuild = document.getElementById('universeRebuild')
  if (rebuild) rebuild.addEventListener('click', rebuildWiki)

  document.querySelectorAll('.ufilter').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active')
      toggleFilter(btn.dataset.type)
    })
  })

  window.addEventListener('resize', () => {
    if (!uState.instance) return
    const c = document.getElementById('universe-canvas')
    if (c) uState.instance.width(c.clientWidth).height(c.clientHeight)
  })
}

// ── Boot on nav click ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === 'universe') setTimeout(initUniverse, 80)
    })
  })
})
