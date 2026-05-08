import { ANOMALY_CONFIG, BADGE_CONFIG } from './config.js'

const BASE = import.meta.env.BASE_URL

export async function loadPerfData() {
  const res = await fetch(`${BASE}data/db_perf.json`)
  const json = await res.json()
  return json.data
}

export async function loadQueryData() {
  const res = await fetch(`${BASE}data/top_query.json`)
  const json = await res.json()
  return json.weeks
}

export function calcZScoreStats(data) {
  const metrics = ['cpu_time', 'cpu_per_was', 'cpu_per_patient']
  const stats = {}

  const enriched = data.map(row => ({
    ...row,
    cpu_per_was: row.was_count > 0 ? row.cpu_time / row.was_count : 0,
    cpu_per_patient: row.patient_count > 0 ? row.cpu_time / row.patient_count : 0,
  }))

  for (const metric of metrics) {
    const values = enriched.map(r => r[metric])
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
    const std = Math.sqrt(variance)
    stats[metric] = { mean, std }
  }

  return { enriched, stats }
}

export function detectAnomalies(data, cfg = ANOMALY_CONFIG) {
  const { enriched, stats } = calcZScoreStats(data)
  const threshold = cfg.zScoreThreshold

  return enriched.map(row => {
    const zCpu = stats.cpu_time.std > 0
      ? (row.cpu_time - stats.cpu_time.mean) / stats.cpu_time.std : 0
    const zWas = stats.cpu_per_was.std > 0
      ? (row.cpu_per_was - stats.cpu_per_was.mean) / stats.cpu_per_was.std : 0
    const zPat = stats.cpu_per_patient.std > 0
      ? (row.cpu_per_patient - stats.cpu_per_patient.mean) / stats.cpu_per_patient.std : 0

    const isAnomaly = zCpu > threshold || zWas > threshold || zPat > threshold

    return { ...row, zCpu, zWas, zPat, isAnomaly }
  })
}

export function calcQueryBadges(weeks) {
  if (!weeks || weeks.length === 0) return weeks

  const weekMap = {}
  weeks.forEach(w => { weekMap[w.week] = w })
  const weekKeys = weeks.map(w => w.week).sort()

  return weeks.map((weekData, wi) => {
    const prevWeekKey = weekKeys[wi - 1]
    const prevWeek = prevWeekKey ? weekMap[prevWeekKey] : null
    const prevBizIds = prevWeek
      ? new Set(prevWeek.queries.map(q => q.biz_sql_id))
      : new Set()
    const prevRankMap = prevWeek
      ? Object.fromEntries(prevWeek.queries.map(q => [q.biz_sql_id, q.rank]))
      : {}

    const queries = weekData.queries.map(q => {
      const badges = []

      if (!prevBizIds.has(q.biz_sql_id)) badges.push('new')

      if (prevRankMap[q.biz_sql_id] !== undefined) {
        const rankDiff = prevRankMap[q.biz_sql_id] - q.rank
        if (rankDiff >= BADGE_CONFIG.surgeThreshold) badges.push('surge')
      }

      // 상승추세: 최근 N주 연속 순위 상승
      if (wi >= BADGE_CONFIG.trendWeeks - 1) {
        let isTrend = true
        let prevR = q.rank
        for (let k = 1; k < BADGE_CONFIG.trendWeeks; k++) {
          const pastWeek = weekMap[weekKeys[wi - k]]
          const pastQuery = pastWeek?.queries.find(pq => pq.biz_sql_id === q.biz_sql_id)
          if (!pastQuery || pastQuery.rank <= prevR) { isTrend = false; break }
          prevR = pastQuery.rank
        }
        if (isTrend) badges.push('trend')
      }

      // 재등장: tuned=true 인데 이번 주에 등장
      if (q.tuned) badges.push('reappear')

      return { ...q, badges }
    })

    return { ...weekData, queries }
  })
}

export function parseBizSqlId(sqlText) {
  if (!sqlText) return null
  const match = sqlText.match(/\/\*\+.*?SQL_ID\(([^)]+)\).*?\*\//s)
  return match ? match[1].trim() : null
}

export function filterByDateRange(data, from, to) {
  return data.filter(row => {
    if (from && row.date < from) return false
    if (to && row.date > to) return false
    return true
  })
}
