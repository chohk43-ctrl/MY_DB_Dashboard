import { loadPerfData, loadQueryData, detectAnomalies, calcQueryBadges, filterByDateRange, calcZScoreStats, normalizeSql } from './db.js'
import { renderPerfChart, renderMiniRankChart } from './chart.js'
import { saveComment, loadComments, saveTuningHistory, loadTuningHistory, setTuned, getTuned } from './supabase.js'

let allPerfData = []
let allQueryWeeks = []
let currentQueryData = null
let selectedBizId = null
let miniChartData = null

// ===== 초기화 =====
async function init() {
  initTabs()
  await Promise.all([initPerfTab(), initQueryTab()])
}

// ===== 탭 전환 =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById(`tab-${tab}`).classList.add('active')
    })
  })
}

// ===== 성능 모니터링 탭 =====
async function initPerfTab() {
  try {
    allPerfData = await loadPerfData()
  } catch {
    allPerfData = getSamplePerfData()
  }

  // 날짜 범위 초기화
  const dates = allPerfData.map(r => r.date).sort()
  const fromEl = document.getElementById('date-from')
  const toEl = document.getElementById('date-to')
  if (dates.length) {
    fromEl.value = dates[0]
    toEl.value = dates[dates.length - 1]
  }

  renderPerfTab(allPerfData)

  document.getElementById('btn-apply-filter').addEventListener('click', () => {
    const from = fromEl.value
    const to = toEl.value
    const filtered = filterByDateRange(allPerfData, from, to)
    renderPerfTab(filtered)
  })

  document.getElementById('btn-reset-filter').addEventListener('click', () => {
    if (dates.length) { fromEl.value = dates[0]; toEl.value = dates[dates.length - 1] }
    renderPerfTab(allPerfData)
  })
}

function renderPerfTab(data) {
  const anomalyData = detectAnomalies(data)
  renderMetricCards(data)
  const ctx = document.getElementById('perf-chart').getContext('2d')
  const anomalyDates = anomalyData.filter(r => r.isAnomaly).map(r => r.date)
  renderPerfChart(ctx, data, anomalyDates)
  renderCorrelationPanel(data)
  renderAnomalyList(anomalyData.filter(r => r.isAnomaly))
}

function pearsonR(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? 0 : num / denom
}

function renderCorrelationPanel(data) {
  if (!data.length) return

  const cpuVals = data.map(r => r.cpu_time)
  const wasVals = data.map(r => r.was_count)
  const patVals = data.map(r => r.patient_count)

  // 평균 비율
  const avgCpuWas = cpuVals.reduce((s, v, i) => s + (wasVals[i] > 0 ? v / wasVals[i] : 0), 0) / data.length
  const avgCpuPat = cpuVals.reduce((s, v, i) => s + (patVals[i] > 0 ? v / patVals[i] : 0), 0) / data.length

  // Pearson 상관계수
  const rWas = pearsonR(wasVals, cpuVals)
  const rPat = pearsonR(patVals, cpuVals)

  const rClass = r => Math.abs(r) >= 0.7 ? 'r-high' : Math.abs(r) >= 0.4 ? 'r-mid' : 'r-low'
  const fmt2 = v => v.toFixed(2)
  const fmt1 = v => v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })

  document.getElementById('corr-cpu-was').textContent = fmt1(avgCpuWas)
  document.getElementById('corr-cpu-pat').textContent = fmt2(avgCpuPat)

  const rWasEl = document.getElementById('corr-r-was')
  rWasEl.textContent = fmt2(rWas)
  rWasEl.className = `corr-value ${rClass(rWas)}`

  const rPatEl = document.getElementById('corr-r-pat')
  rPatEl.textContent = fmt2(rPat)
  rPatEl.className = `corr-value ${rClass(rPat)}`

  // Z-score 계산식에 실제 μ, σ 값 표시
  const { stats } = calcZScoreStats(data)
  document.getElementById('f-cpu-mean').textContent = `μ${fmt1(stats.cpu_time.mean)}`
  document.getElementById('f-cpu-std').textContent  = `σ${fmt1(stats.cpu_time.std)}`
  document.getElementById('f-was-mean').textContent = `μ${fmt2(stats.cpu_per_was.mean)}`
  document.getElementById('f-was-std').textContent  = `σ${fmt2(stats.cpu_per_was.std)}`
  document.getElementById('f-pat-mean').textContent = `μ${fmt2(stats.cpu_per_patient.mean)}`
  document.getElementById('f-pat-std').textContent  = `σ${fmt2(stats.cpu_per_patient.std)}`
}

function renderMetricCards(data) {
  if (!data.length) return
  const last = data[data.length - 1]
  const fmt = (v) => v != null ? v.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—'
  document.getElementById('card-db-time').textContent = fmt(last.db_time)
  document.getElementById('card-cpu-time').textContent = fmt(last.cpu_time)
  document.getElementById('card-logical-read').textContent = fmt(last.logical_read)
  document.getElementById('card-execute-cnt').textContent = fmt(last.execute_cnt)
  document.getElementById('card-was-count').textContent = fmt(last.was_count)
  document.getElementById('card-patient-count').textContent = fmt(last.patient_count)
}

function renderAnomalyList(rows) {
  const tbody = document.getElementById('anomaly-tbody')
  const countEl = document.getElementById('anomaly-count')
  countEl.textContent = rows.length

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">이상 감지된 날짜가 없습니다</td></tr>'
    return
  }

  const comments = loadComments()

  tbody.innerHTML = rows.map(row => `
    <tr class="anomaly-row" data-date="${row.date}">
      <td>${row.date}</td>
      <td class="${zClass(row.zCpu)}">${row.zCpu.toFixed(2)}</td>
      <td class="${zClass(row.zWas)}">${row.zWas.toFixed(2)}</td>
      <td class="${zClass(row.zPat)}">${row.zPat.toFixed(2)}</td>
      <td>
        <input class="comment-input" type="text" placeholder="Comment 입력..."
          data-date="${row.date}" value="${escHtml(comments[row.date] || '')}" />
      </td>
      <td>
        <button class="btn-save-comment" data-date="${row.date}">저장</button>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('.btn-save-comment').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date
      const input = tbody.querySelector(`.comment-input[data-date="${date}"]`)
      saveComment(date, input.value)
      btn.textContent = '✓'
      setTimeout(() => { btn.textContent = '저장' }, 1200)
    })
  })
}

function zClass(z) {
  if (z > 3) return 'zscore-high'
  if (z > 2) return 'zscore-mid'
  return 'zscore-low'
}

// ===== TOP 쿼리 탭 =====
async function initQueryTab() {
  try {
    allQueryWeeks = await loadQueryData()
  } catch {
    allQueryWeeks = getSampleQueryData()
  }

  const weeksWithBadges = calcQueryBadges(allQueryWeeks)
  const weekSelect = document.getElementById('week-select')

  weeksWithBadges.forEach(w => {
    const opt = document.createElement('option')
    opt.value = w.week
    opt.textContent = w.week
    weekSelect.appendChild(opt)
  })

  if (weeksWithBadges.length) {
    weekSelect.value = weeksWithBadges[weeksWithBadges.length - 1].week
    renderQueryTable(weeksWithBadges, weekSelect.value)
  }

  weekSelect.addEventListener('change', () => {
    renderQueryTable(weeksWithBadges, weekSelect.value)
    closeDetail()
  })
}

function renderQueryTable(weeksWithBadges, weekKey) {
  const weekData = weeksWithBadges.find(w => w.week === weekKey)
  const tbody = document.getElementById('query-tbody')

  if (!weekData) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">데이터가 없습니다</td></tr>'
    return
  }

  currentQueryData = weekData
  const allWeeks = weeksWithBadges

  tbody.innerHTML = weekData.queries.map(q => {
    const isTuned = getTuned(q.biz_sql_id)
    const badgesHtml = (q.badges || []).map(b => badgeHtml(b)).join(' ')
    const rankClass = q.rank <= 3 ? 'top3' : ''
    return `
      <tr data-bizid="${escHtml(q.biz_sql_id)}" class="${isTuned ? 'tuned' : ''}">
        <td><span class="rank-num ${rankClass}">${q.rank}</span></td>
        <td>
          <div class="biz-id-cell">
            <span class="biz-id-text">${escHtml(q.biz_sql_id)}</span>
            <span class="oracle-id-sub">${escHtml(q.oracle_sql_id || '—')}</span>
          </div>
        </td>
        <td>${q.cpu_time.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</td>
        <td>${q.execute_cnt.toLocaleString('ko-KR')}</td>
        <td>${badgesHtml}</td>
      </tr>
    `
  }).join('')

  tbody.querySelectorAll('tr[data-bizid]').forEach(row => {
    row.addEventListener('click', () => {
      const bizId = row.dataset.bizid
      const query = weekData.queries.find(q => q.biz_sql_id === bizId)
      if (!query) return
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'))
      row.classList.add('selected')
      openDetail(query, allWeeks)
    })
  })
}

function badgeHtml(type) {
  const map = {
    new:      ['badge-new', 'NEW'],
    surge:    ['badge-surge', '급상승'],
    trend:    ['badge-trend', '상승추세'],
    reappear: ['badge-reappear', '재등장'],
    dynamic:  ['badge-dynamic', 'DYNAMIC'],
  }
  const [cls, label] = map[type] || ['', type]
  return `<span class="badge ${cls}">${label}</span>`
}

function openDetail(query, allWeeks) {
  selectedBizId = query.biz_sql_id
  document.getElementById('detail-empty').style.display = 'none'
  document.getElementById('detail-content').style.display = 'block'

  document.getElementById('detail-biz-id').textContent = query.biz_sql_id
  document.getElementById('detail-oracle-id').textContent = query.oracle_sql_id || '—'
  document.getElementById('detail-sql-text').textContent = query.sql_text || '—'

  renderOracleIdHistory(query)
  renderDynamicDiff(query)

  const isTuned = getTuned(query.biz_sql_id)
  const btnTuned = document.getElementById('btn-tuned')
  btnTuned.textContent = isTuned ? '✓ 튜닝 완료' : '튜닝 완료 처리'
  btnTuned.className = 'btn-tuned' + (isTuned ? ' is-tuned' : '')
  btnTuned.onclick = () => {
    setTuned(query.biz_sql_id, true)
    btnTuned.textContent = '✓ 튜닝 완료'
    btnTuned.className = 'btn-tuned is-tuned'
  }

  // 순위 추이 미니 차트
  const rankHistory = allWeeks
    .map(w => {
      const q = w.queries.find(q => q.biz_sql_id === query.biz_sql_id)
      return q ? { week: w.week, rank: q.rank } : null
    })
    .filter(Boolean)

  const miniCtx = document.getElementById('mini-rank-chart').getContext('2d')
  renderMiniRankChart(miniCtx, rankHistory)

  renderTuningHistory(query.biz_sql_id)

  document.getElementById('btn-add-tuning').onclick = () => {
    const date = document.getElementById('tuning-date').value
    const note = document.getElementById('tuning-note').value.trim()
    const done = document.getElementById('tuning-done').checked
    if (!date || !note) return
    saveTuningHistory(query.biz_sql_id, { date, note, done })
    document.getElementById('tuning-note').value = ''
    document.getElementById('tuning-done').checked = false
    renderTuningHistory(query.biz_sql_id)
  }
}

function renderOracleIdHistory(query) {
  const el = document.getElementById('oracle-id-history')
  if (!el) return
  const history = query.oracleIdHistory || []
  if (history.length <= 1) {
    el.innerHTML = '<div class="oracle-history-empty">Oracle SQL_ID 변경 이력 없음</div>'
    return
  }
  el.innerHTML = history.map(h => `
    <div class="oracle-history-item">
      <code class="oracle-id-code">${escHtml(h.oracle_sql_id)}</code>
      <span class="oracle-history-week">${escHtml(h.week)}</span>
    </div>
  `).join('')
}

function renderDynamicDiff(query) {
  const el = document.getElementById('dynamic-diff-panel')
  if (!el) return
  if (!query.isDynamic) {
    el.style.display = 'none'
    return
  }
  el.style.display = 'block'
  const history = query.oracleIdHistory || []
  const variants = history.map((h, i) => `
    <div class="dynamic-variant">
      <div class="dynamic-variant-header">
        <code>${escHtml(h.oracle_sql_id)}</code>
        <span class="oracle-history-week">${escHtml(h.week)}</span>
      </div>
      <pre class="sql-text sql-variant">${escHtml(h.sql_text || '—')}</pre>
    </div>
  `).join('')
  document.getElementById('dynamic-variants').innerHTML = variants
}

function renderTuningHistory(bizId) {
  const list = document.getElementById('tuning-history-list')
  const history = loadTuningHistory(bizId)
  if (!history.length) {
    list.innerHTML = '<div style="color:#3d5470;font-size:11px;font-family:var(--font-mono);padding:8px 0">튜닝 이력 없음</div>'
    return
  }
  list.innerHTML = history.map(h => `
    <div class="tuning-item">
      <span class="tuning-date">${h.date}</span>
      <span class="tuning-note">${escHtml(h.note)}</span>
      <span class="tuning-done-badge ${h.done ? 'done' : 'pending'}">${h.done ? '완료' : '진행'}</span>
    </div>
  `).join('')
}

function closeDetail() {
  selectedBizId = null
  document.getElementById('detail-empty').style.display = 'flex'
  document.getElementById('detail-content').style.display = 'none'
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ===== 샘플 데이터 (data/ 파일 없을 때 fallback) =====
function getSamplePerfData() {
  const base = []
  const start = new Date('2024-01-02')
  for (let i = 0; i < 90; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    const cpuBase = 8000 + Math.random() * 2000
    const cpu = i === 30 ? cpuBase * 2.8 : i === 60 ? cpuBase * 2.3 : cpuBase
    base.push({
      date: dateStr,
      db_time: cpu * 1.5,
      cpu_time: cpu,
      logical_read: 40 + Math.random() * 15,
      execute_cnt: 10 + Math.random() * 5,
      was_count: 280 + Math.floor(Math.random() * 100),
      patient_count: 1600 + Math.floor(Math.random() * 400),
    })
  }
  return base
}

function getSampleQueryData() {
  const weeks = []
  for (let w = 1; w <= 4; w++) {
    const queries = []
    for (let r = 1; r <= 10; r++) {
      queries.push({
        rank: r,
        oracle_sql_id: `sql${w}${r}xyz`,
        biz_sql_id: `BIZ_QUERY_${String(r).padStart(3, '0')}`,
        cpu_time: Math.round((5000 - r * 400 + Math.random() * 300) * 10) / 10,
        execute_cnt: Math.floor(50000 - r * 3000 + Math.random() * 5000),
        sql_text: `SELECT /*+ SQL_ID(BIZ_QUERY_${String(r).padStart(3, '0')}) */ * FROM table_${r} WHERE condition = 'value'`,
        tuned: false,
        tuning_history: [],
        badges: [],
      })
    }
    weeks.push({ week: `2024-W0${w}`, queries })
  }
  return weeks
}

init()
