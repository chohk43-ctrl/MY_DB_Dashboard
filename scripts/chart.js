import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

let perfChartInstance = null
let miniChartInstance = null

// 0~100% 정규화: 변동폭을 시각적으로 동일하게 맞춰 상관관계를 명확히 표시
function normalize(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range === 0) return values.map(() => 50)
  return values.map(v => ((v - min) / range) * 100)
}

export function renderPerfChart(ctx, data, anomalyDates) {
  if (perfChartInstance) perfChartInstance.destroy()

  const labels = data.map(r => r.date)
  const cpuRaw  = data.map(r => r.cpu_time)
  const wasRaw  = data.map(r => r.was_count)
  const patRaw  = data.map(r => r.patient_count)

  // 우측 축: WAS·환자수를 각각 정규화해서 변동폭을 동일하게
  const wasNorm = normalize(wasRaw)
  const patNorm = normalize(patRaw)

  const anomalySet = new Set(anomalyDates)
  const pointColors      = labels.map(d => anomalySet.has(d) ? '#ff4d6d' : 'transparent')
  const pointRadius      = labels.map(d => anomalySet.has(d) ? 6 : 0)
  const pointHoverRadius = labels.map(d => anomalySet.has(d) ? 8 : 4)

  perfChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'CPU Time(s)',
          data: cpuRaw,
          borderColor: '#00b4d8',
          backgroundColor: 'rgba(0,180,216,0.06)',
          borderWidth: 2,
          pointBackgroundColor: pointColors,
          pointRadius,
          pointHoverRadius,
          tension: 0.3,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'WAS Count',
          data: wasNorm,
          borderColor: '#ffd166',
          borderWidth: 1.5,
          borderDash: [5, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false,
          yAxisID: 'yNorm',
        },
        {
          label: '환자수',
          data: patNorm,
          borderColor: '#a78bfa',
          borderWidth: 1.5,
          borderDash: [2, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: false,
          yAxisID: 'yNorm',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1624',
          borderColor: '#1e2d45',
          borderWidth: 1,
          titleColor: '#7890a8',
          bodyColor: '#e2e8f0',
          titleFont: { family: 'JetBrains Mono', size: 11 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 10,
          callbacks: {
            // 툴팁은 정규화 전 실제 값으로 표시
            label(ctx) {
              const idx = ctx.dataIndex
              if (ctx.dataset.label === 'WAS Count') {
                return ` WAS Count: ${wasRaw[idx].toLocaleString()}`
              }
              if (ctx.dataset.label === '환자수') {
                return ` 환자수: ${patRaw[idx].toLocaleString()}`
              }
              return ` CPU Time: ${cpuRaw[idx].toLocaleString('ko-KR', { maximumFractionDigits: 1 })}s`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#1e2d45' },
          ticks: {
            color: '#3d5470',
            font: { family: 'JetBrains Mono', size: 10 },
            maxTicksLimit: 12,
            maxRotation: 45,
          },
        },
        y: {
          position: 'left',
          grid: { color: '#1e2d45' },
          ticks: {
            color: '#7890a8',
            font: { family: 'JetBrains Mono', size: 10 },
          },
          title: {
            display: true,
            text: 'CPU Time (s)',
            color: '#3d5470',
            font: { family: 'JetBrains Mono', size: 10 },
          },
        },
        yNorm: {
          position: 'right',
          min: -10,
          max: 110,
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#3d5470',
            font: { family: 'JetBrains Mono', size: 9 },
            callback: v => `${Math.round(v)}%`,
            maxTicksLimit: 5,
          },
          title: {
            display: true,
            text: 'WAS / 환자수 (정규화 %)',
            color: '#3d5470',
            font: { family: 'JetBrains Mono', size: 9 },
          },
        },
      },
    },
  })

  return perfChartInstance
}

export function renderMiniRankChart(ctx, rankHistory) {
  if (miniChartInstance) miniChartInstance.destroy()

  const labels = rankHistory.map(r => r.week)
  const ranks = rankHistory.map(r => r.rank)

  miniChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: ranks,
        borderColor: '#00b4d8',
        backgroundColor: 'rgba(0,180,216,0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#00b4d8',
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#0f1624',
        borderColor: '#1e2d45',
        borderWidth: 1,
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        titleFont: { family: 'JetBrains Mono', size: 10 },
      }},
      scales: {
        x: {
          grid: { color: '#1e2d45' },
          ticks: { color: '#3d5470', font: { family: 'JetBrains Mono', size: 9 } },
        },
        y: {
          reverse: true,
          grid: { color: '#1e2d45' },
          ticks: {
            color: '#7890a8',
            font: { family: 'JetBrains Mono', size: 9 },
            stepSize: 1,
          },
          title: {
            display: true,
            text: '순위',
            color: '#3d5470',
            font: { family: 'JetBrains Mono', size: 9 },
          },
        },
      },
    },
  })
}
