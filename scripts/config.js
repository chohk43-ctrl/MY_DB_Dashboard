export const ANOMALY_CONFIG = {
  zScoreThreshold: 2.0,
  metrics: ['cpu_time', 'cpu_per_was', 'cpu_per_patient']
}

export const BADGE_CONFIG = {
  surgeThreshold: 20,   // 급상승: 전주 대비 N단계 이상
  trendWeeks: 3,        // 상승추세: N주 연속
}
