// 현재: localStorage stub — 추후 Supabase 전환 시 내부 구현만 교체

const KEY_COMMENTS = 'amc_db_comments'
const KEY_TUNING = (bizId) => `amc_db_tuning_${bizId}`
const KEY_TUNED  = (bizId) => `amc_db_tuned_${bizId}`

export function saveComment(date, text) {
  const comments = loadComments()
  comments[date] = text
  localStorage.setItem(KEY_COMMENTS, JSON.stringify(comments))
}

export function loadComments() {
  try {
    return JSON.parse(localStorage.getItem(KEY_COMMENTS)) || {}
  } catch { return {} }
}

export function saveTuningHistory(bizId, entry) {
  const history = loadTuningHistory(bizId)
  history.push(entry)
  localStorage.setItem(KEY_TUNING(bizId), JSON.stringify(history))
}

export function loadTuningHistory(bizId) {
  try {
    return JSON.parse(localStorage.getItem(KEY_TUNING(bizId))) || []
  } catch { return [] }
}

export function setTuned(bizId, tuned) {
  localStorage.setItem(KEY_TUNED(bizId), JSON.stringify(tuned))
}

export function getTuned(bizId) {
  try {
    return JSON.parse(localStorage.getItem(KEY_TUNED(bizId))) || false
  } catch { return false }
}
