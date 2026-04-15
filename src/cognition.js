/* ═══════════════════════════════════════════════════════════════
   Codebase Cognition — Live file intelligence
   File watcher, heat map, impact analysis
═══════════════════════════════════════════════════════════════ */
'use strict'

const cogState = {
  watching: false,
  files: [],
  changes: [],
  initialized: false,
}

function cogInit() {
  if (cogState.initialized) return
  cogState.initialized = true

  document.getElementById('cogStartBtn')?.addEventListener('click', cogToggleWatch)
  document.getElementById('cogScanBtn')?.addEventListener('click', cogScan)

  window.helm.onFileChanged?.(entry => {
    if (state.view !== 'cognition') return
    addCogChange(entry)
  })
}

function cogToggleWatch() {
  if (!state.project) { showToast('Open a project first', 'error'); return }
  if (cogState.watching) {
    window.helm.stopCognition()
    cogState.watching = false
    setCogStatus(false)
    document.getElementById('cogStartBtn').textContent = '▶ Start Watching'
  } else {
    window.helm.startCognition(state.project.path)
    cogState.watching = true
    setCogStatus(true)
    document.getElementById('cogStartBtn').textContent = '■ Stop Watching'
    addFeedEntry('Cognition', 'watch:start', `Watching ${state.project.name}`)
  }
}

function setCogStatus(active) {
  const dot = document.querySelector('.cog-dot')
  const span = document.querySelector('.cog-status span')
  if (dot) { dot.className = `cog-dot ${active ? 'active' : 'inactive'}` }
  if (span) span.textContent = active ? `Watching ${state.project?.name || ''}` : 'Inactive'
}

async function cogScan() {
  if (!state.project) { showToast('Open a project first', 'error'); return }
  document.getElementById('cogScanBtn').textContent = '…Scanning'
  document.getElementById('cogScanBtn').disabled = true

  const files = await window.helm.scanProjectFiles(state.project.path)
  cogState.files = files

  // Calculate heat (recency rank)
  const now = Date.now()
  const maxAge = 7 * 24 * 60 * 60 * 1000  // 7 days
  const rendered = files.slice(0, 40).map(f => ({
    ...f,
    heat: Math.max(0, 1 - (now - f.mtime) / maxAge),
  }))

  renderCogFileList(rendered)
  document.getElementById('cogScanBtn').textContent = '⟳ Scan Files'
  document.getElementById('cogScanBtn').disabled = false
}

function renderCogFileList(files) {
  const list = document.getElementById('cogFileList')
  if (!list) return
  if (!files.length) { list.innerHTML = '<div class="cog-placeholder">No files found</div>'; return }

  list.innerHTML = files.map(f => {
    const heatClass = f.heat > 0.7 ? 'hot' : f.heat > 0.4 ? 'warm' : f.heat > 0.1 ? 'cool' : 'cold'
    const name = f.relative || f.path.split('/').pop()
    const lines = f.lines || 0
    const complexity = Math.min(100, Math.round(lines / 5))
    return `<div class="cog-file-row" onclick="cogInspectFile('${escAttr(f.path)}','${escAttr(f.relative || name)}')">
      <div class="cog-heat ${heatClass}" title="${Math.round(f.heat * 100)}% recent"></div>
      <div class="cog-file-info">
        <div class="cog-file-name">${escHtml(name)}</div>
        <div class="cog-file-meta">${lines} lines</div>
      </div>
      <div class="cog-complexity" title="Complexity score">${complexity}</div>
    </div>`
  }).join('')
}

async function cogInspectFile(filePath, relativePath) {
  const impact = document.getElementById('cogImpact')
  const content = document.getElementById('cogImpactContent')
  impact.style.display = 'block'
  content.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Analyzing impact…</div>'

  const result = await window.helm.analyzeFileImpact({
    projectPath: state.project?.path || '',
    filename: relativePath,
  })

  const complexity = await window.helm.getFileComplexity(filePath)

  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;font-size:11px">
      <div style="color:var(--text-muted)"><strong style="color:var(--text)">${escHtml(relativePath)}</strong></div>
      <div style="display:flex;gap:16px;color:var(--text-dim);font-family:var(--mono);font-size:10px">
        <span>${complexity.lines} lines</span>
        <span>${complexity.functions} functions</span>
        <span>Complexity: ${complexity.complexity}/100</span>
      </div>
      ${result.impactCount > 0
        ? `<div style="margin-top:4px;color:var(--amber)">⚠ Referenced by ${result.impactCount} file${result.impactCount > 1 ? 's' : ''}:</div>
           <div style="font-family:var(--mono);font-size:10px;color:var(--text-dim)">${result.impactedFiles.map(f => escHtml(f.split('/').pop())).join('<br>')}</div>`
        : `<div style="color:var(--text-dim)">No detected dependents</div>`
      }
    </div>`
}

function addCogChange(entry) {
  cogState.changes.unshift(entry)
  if (cogState.changes.length > 80) cogState.changes = cogState.changes.slice(0, 80)

  const feed = document.getElementById('cogFeed')
  if (!feed) return
  const empty = feed.querySelector('.cog-placeholder')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'cog-change-entry'

  const ext = entry.filename?.split('.').pop() || ''
  const isCode = ['js','ts','py','go','rs','jsx','tsx','css','html'].includes(ext)

  el.innerHTML = `
    <div class="cog-change-type ${entry.eventType === 'rename' ? 'rename' : 'change'}">${entry.eventType}</div>
    <div class="cog-change-info">
      <div class="cog-change-file">${escHtml(entry.filename || '')}</div>
      <div class="cog-change-meta">${new Date(entry.ts).toLocaleTimeString()} · ${fmtBytes(entry.size)}</div>
    </div>
    ${isCode ? `<div class="cog-impact-badge" onclick="cogInspectFile('${escAttr(entry.fullPath)}','${escAttr(entry.filename || '')}')" title="Analyze impact">⚡</div>` : ''}
  `
  feed.insertBefore(el, feed.firstChild)
  if (feed.children.length > 60) feed.lastChild?.remove()
}

function fmtBytes(b) {
  if (!b) return '0B'
  if (b < 1024) return b + 'B'
  if (b < 1048576) return (b / 1024).toFixed(1) + 'KB'
  return (b / 1048576).toFixed(1) + 'MB'
}

function escAttr(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;') }

function loadCognition() {
  cogInit()
  setCogStatus(cogState.watching)
  if (cogState.changes.length) {
    const feed = document.getElementById('cogFeed')
    if (feed) {
      feed.innerHTML = ''
      cogState.changes.forEach(c => addCogChange(c))
    }
  }
}

document.addEventListener('DOMContentLoaded', cogInit)
