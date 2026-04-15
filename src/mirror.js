/* ═══════════════════════════════════════════════════════════════
   Mind Mirror — Project Intelligence
   Analyzes memory, git, genome → structured intelligence report
═══════════════════════════════════════════════════════════════ */
'use strict'

const mirrorState = {
  analysis: null,
  loading: false,
  initialized: false,
}

function mirrorInit() {
  if (mirrorState.initialized) return
  mirrorState.initialized = true

  document.getElementById('mirrorAnalyzeBtn')?.addEventListener('click', mirrorAnalyze)

  window.helm.onMirrorDone?.(({ analysis }) => {
    mirrorState.analysis = analysis
    mirrorState.loading = false
    renderMirror(analysis)
    document.getElementById('mirrorAnalyzeBtn').disabled = false
    document.getElementById('mirrorAnalyzeBtn').textContent = '✦ Generate Intelligence Report'
  })

  window.helm.onMirrorError?.(({ error }) => {
    mirrorState.loading = false
    showToast('Mirror analysis failed: ' + error.slice(0, 80), 'error')
    document.getElementById('mirrorAnalyzeBtn').disabled = false
    document.getElementById('mirrorAnalyzeBtn').textContent = '✦ Generate Intelligence Report'
  })
}

async function mirrorAnalyze() {
  if (!state.apiKey) { showToast('Add your API key in Settings first', 'error'); return }
  if (mirrorState.loading) return
  mirrorState.loading = true

  const btn = document.getElementById('mirrorAnalyzeBtn')
  btn.disabled = true
  btn.textContent = '… Analyzing'

  // Show loading state
  document.getElementById('mirrorGrid').innerHTML = `
    <div class="mirror-loading" style="grid-column:1/-1">
      <div class="mirror-spinner"></div>
      <span>Claude is analyzing your project's memory, git history, and agent patterns…</span>
    </div>`

  // Gather data
  const [store, gitLog, claudeMd] = await Promise.all([
    window.helm.storeGet().catch(() => ({})),
    state.project ? window.helm.getGitLog(state.project.path).catch(() => []) : Promise.resolve([]),
    state.project ? window.helm.readClaudeMd(state.project.path).catch(() => null) : Promise.resolve(null),
  ])

  // Read all memory files for content
  let memoryContent = ''
  if (state.memoryStats?.length) {
    const contents = await Promise.all(
      state.memoryStats.map(async s => {
        const path = s.dir ? `${s.dir}/${s.file}` : `${state.project?.path}/memory/${s.file}`
        const text = await window.helm.readFile(path)
        return text ? `### ${s.file}\n${text.slice(0, 1000)}` : null
      })
    )
    memoryContent = contents.filter(Boolean).join('\n\n').slice(0, 6000)
  }

  // Genome summary
  const genome = store.genome || {}
  const genomeSummary = Object.entries(genome)
    .sort(([,a],[,b]) => (b.uses || 0) - (a.uses || 0))
    .slice(0, 10)
    .map(([name, g]) => `${name}: ${g.uses} uses, ${Math.round((g.successRate || 1)*100)}% success`)
    .join('\n')

  window.helm.mirrorAnalyze({
    id: 'mirror-' + Date.now(),
    apiKey: state.apiKey,
    model: state.model,
    memoryContent,
    gitLog: gitLog.slice(0, 40),
    claudeMd,
    genomeSummary,
  })
}

function renderMirror(a) {
  // Health metrics row
  const healthBar = document.getElementById('mirrorHealthBar')
  healthBar.style.display = 'grid'

  document.getElementById('mirrorHealth').textContent = (a.projectHealth || 0) + '%'
  document.getElementById('mirrorHealth').style.color = healthColor(a.projectHealth)
  document.getElementById('mirrorMomentum').textContent = a.momentum || '—'
  document.getElementById('mirrorMomentum').style.color =
    a.momentum === 'increasing' ? '#059669' : a.momentum === 'decreasing' ? '#dc2626' : '#6366f1'
  document.getElementById('mirrorRisk').textContent = a.riskLevel || '—'
  document.getElementById('mirrorRisk').style.color =
    a.riskLevel === 'low' ? '#059669' : a.riskLevel === 'high' ? '#dc2626' : '#d97706'
  document.getElementById('mirrorSummary').textContent = a.summary || ''

  // Build cards
  const grid = document.getElementById('mirrorGrid')
  grid.innerHTML = ''

  // Weekly Briefing (full width)
  if (a.weeklyBriefing) {
    grid.appendChild(mirrorCard('📋', 'Intelligence Briefing', 'full-width', `
      <div class="mirror-briefing">${escHtml(a.weeklyBriefing)}</div>
    `))
  }

  // Key Decisions
  if (a.keyDecisions?.length) {
    grid.appendChild(mirrorCard('🧭', 'Key Decisions', '', a.keyDecisions.map(d => `
      <div class="mirror-item">
        <div class="mirror-item-dot ${d.impact || 'medium'}"></div>
        <div class="mirror-item-content">
          ${escHtml(d.description)}
          ${d.date ? `<div class="mirror-item-meta">${d.date}</div>` : ''}
        </div>
        <div class="mirror-item-badge ${d.impact || 'medium'}">${d.impact || 'medium'}</div>
      </div>`).join('')))
  }

  // Detected Patterns
  if (a.detectedPatterns?.length) {
    grid.appendChild(mirrorCard('🔁', 'Detected Patterns', '', a.detectedPatterns.map(p => `
      <div class="mirror-item">
        <div class="mirror-item-dot medium"></div>
        <div class="mirror-item-content">
          <strong style="color:var(--text)">${escHtml(p.pattern)}</strong>
          <div class="mirror-item-meta">×${p.frequency || 1} occurrences</div>
          <div style="margin-top:3px">${escHtml(p.insight || '')}</div>
          ${p.recommendation ? `<div style="color:var(--accent);margin-top:3px;font-size:10px">→ ${escHtml(p.recommendation)}</div>` : ''}
        </div>
      </div>`).join('')))
  }

  // Opportunities
  if (a.opportunities?.length) {
    grid.appendChild(mirrorCard('⚡', 'Opportunities', '', a.opportunities.map(o => `
      <div class="mirror-item">
        <div class="mirror-item-dot ${o.impact === 'high' ? 'high' : 'low'}"></div>
        <div class="mirror-item-content">${escHtml(o.opportunity)}</div>
        <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end">
          <div class="mirror-item-badge ${o.impact || 'medium'}">${o.impact}</div>
          <div class="mirror-item-badge low">${o.effort} effort</div>
        </div>
      </div>`).join('')))
  }

  // Contradictions
  if (a.contradictions?.length) {
    grid.appendChild(mirrorCard('⚠️', 'Contradictions', '', a.contradictions.map(c => `
      <div class="mirror-item">
        <div class="mirror-item-dot ${c.severity || 'medium'}"></div>
        <div class="mirror-item-content">
          <div>${escHtml(c.a)}</div>
          <div style="color:var(--accent);margin:3px 0;font-size:10px">↕ conflicts with</div>
          <div>${escHtml(c.b)}</div>
        </div>
        <div class="mirror-item-badge ${c.severity || 'medium'}">${c.severity || 'medium'}</div>
      </div>`).join('')))
  }

  // Suggested CLAUDE.md additions
  if (a.suggestedRules?.length) {
    grid.appendChild(mirrorCard('📝', 'Suggested CLAUDE.md Additions', '', `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${a.suggestedRules.map(r => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-muted)">
            <span style="color:var(--accent);flex-shrink:0">→</span>
            <span>${escHtml(r)}</span>
          </div>`).join('')}
      </div>
    `))
  }

  // Save decisions from analysis to store
  if (a.keyDecisions?.length) {
    a.keyDecisions.slice(0, 3).forEach(d => {
      window.helm.recordDecision({ description: d.description, context: 'mirror-analysis', source: 'mirror' })
    })
  }
}

function mirrorCard(icon, title, extraClass, bodyHtml) {
  const card = document.createElement('div')
  card.className = `mirror-card ${extraClass}`
  card.innerHTML = `
    <div class="mirror-card-header">
      <span class="mirror-card-icon">${icon}</span>
      ${escHtml(title)}
    </div>
    <div class="mirror-card-body">${bodyHtml}</div>`
  return card
}

function healthColor(score) {
  if (!score) return '#6366f1'
  if (score >= 80) return '#059669'
  if (score >= 60) return '#d97706'
  return '#dc2626'
}

function loadMirror() {
  mirrorInit()
  if (mirrorState.analysis) renderMirror(mirrorState.analysis)
}

document.addEventListener('DOMContentLoaded', mirrorInit)
