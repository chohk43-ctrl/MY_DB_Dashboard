# Design: AMC DB 대시보드 (dashboard)

**작성일:** 2026-05-08  
**Phase:** Design  
**Feature:** dashboard  
**Architecture:** Option C — 실용적 균형

---

## Context Anchor

| 항목 | 내용 |
|------|------|
| **WHY** | CPU 급증 조기 감지 + TOP 쿼리 위험도 추적으로 DB 장애 예방 |
| **WHO** | DBA 팀 2~5명, 로컬 localhost 실행, 로그인 없음 |
| **RISK** | Excel → JSON 수동 변환 오류 가능성, Z-score 임계값 초기 튜닝 필요 |
| **SUCCESS** | 이상감지 Alert 정확도 확인 가능, 튜닝 이력 누적, 배지 로직 정확 동작 |
| **SCOPE** | 성능 모니터링 + TOP 쿼리 관리 (2 탭), Supabase 연동은 2단계 |

---

## 1. 아키텍처 개요

### 파일 구조 및 역할

```
dashboard-project/
├── index.html          # 진입점: 탭 UI, 마운트 포인트
├── styles/
│   └── main.css        # 전체 스타일 (카드, 테이블, 배지, 차트 컨테이너)
├── scripts/
│   ├── app.js          # 탭 라우팅, 화면 렌더링 조율, 이벤트 처리
│   ├── db.js           # JSON 로드, 데이터 가공, Z-score 이상감지 계산
│   ├── chart.js        # Chart.js 차트 생성 및 업데이트
│   └── supabase.js     # 현재 stub (localStorage 위임), 추후 Supabase 전환
├── data/
│   ├── db_perf.json    # 일별 성능 데이터
│   └── top_query.json  # 주간 TOP 100 쿼리
├── .env                # Git 제외
└── vite.config.js
```

### 모듈 의존 관계

```
index.html
    └── app.js
         ├── db.js          (데이터 로드 + 이상감지)
         ├── chart.js       (차트 렌더링)
         └── supabase.js    (저장소 추상화)
```

### 데이터 흐름

```
data/*.json
    → db.js: load() → process() → detectAnomalies()
    → chart.js: render(processedData)
    → app.js: renderPerfTab() / renderQueryTab()
    → supabase.js: save() / load() [현재: localStorage]
```

---

## 2. 모듈 상세 설계

### 2.1 db.js — 데이터 & 이상감지

```js
// 주요 함수
export async function loadPerfData()        // db_perf.json 로드
export async function loadQueryData()       // top_query.json 로드
export function calcZScoreStats(data)       // 전체 데이터 μ, σ 계산
export function detectAnomalies(data, cfg)  // Z-score 기반 이상감지
export function calcQueryBadges(weeks)      // 4종 배지 계산
export function parseBizSqlId(sqlText)      // /*+ SQL_ID(...) */ 파싱
```

**이상감지 설정 (config 분리):**
```js
// scripts/config.js
export const ANOMALY_CONFIG = {
  zScoreThreshold: 2.0,   // 조정 가능
  metrics: ['cpu_time', 'cpu_per_was', 'cpu_per_patient']
}
```

**Z-score 계산 대상 3가지:**
| 지표 | 계산식 |
|------|--------|
| CPU Time 절대값 | `row.cpu_time` |
| CPU / WAS 비율 | `row.cpu_time / row.was_count` |
| CPU / 환자수 비율 | `row.cpu_time / row.patient_count` |

### 2.2 chart.js — 시각화

```js
// 주요 함수
export function renderPerfChart(ctx, data, anomalyDates)  // 성능 시계열 차트
export function renderMiniRankChart(ctx, rankHistory)     // 쿼리 순위 추이 미니 차트
export function updateChartDateRange(chart, from, to)     // 날짜 범위 필터 적용
```

**성능 차트 구성:**
- x축: 날짜
- y축(좌): CPU Time(s)
- y축(우): WAS Count, 환자수
- 이상 날짜 포인트: `pointBackgroundColor: 'red'`, `pointRadius: 6`

### 2.3 app.js — 화면 조율

```js
// 주요 함수
export function initTabs()                 // 탭 전환 이벤트
export function renderPerfTab()            // 성능 모니터링 탭 렌더링
export function renderQueryTab()           // TOP 쿼리 탭 렌더링
export function renderAnomalyList(rows)    // 이상 감지 목록 테이블
export function renderQueryTable(queries)  // TOP 100 쿼리 테이블
export function openQueryDetail(query)     // 쿼리 상세 패널 슬라이드
```

### 2.4 supabase.js — 저장소 추상화 (현재 stub)

```js
// 현재: localStorage 위임
export function saveComment(date, text)         // 이상감지 Comment 저장
export function loadComments()                  // Comment 전체 로드
export function saveTuningHistory(bizId, entry) // 튜닝 이력 저장
export function loadTuningHistory(bizId)        // 튜닝 이력 로드
export function setTuned(bizId, tuned)          // 튜닝 완료 상태 저장

// 추후 Supabase 전환 시 내부 구현만 교체, 인터페이스 동일 유지
```

---

## 3. 화면 설계

### 3.1 성능 모니터링 탭

```
┌─────────────────────────────────────────────────────┐
│ [성능 모니터링] [TOP 쿼리 관리]                       │  ← 탭
├─────────────────────────────────────────────────────┤
│ 날짜 범위: [2024-01-01] ~ [2024-12-31]  [적용]       │  ← 필터
├──────┬──────┬──────┬──────┬──────┬──────┤
│DB Time│CPU Time│Logical│Execute│WAS Cnt│환자수│  ← 요약 카드
├─────────────────────────────────────────────────────┤
│                    [시계열 차트]                       │
│  CPU Time ───────●──────────── (빨간 ●: 이상)       │
│  WAS Count - - - - - - - - - -                      │
│  환자수 ......................................        │
├─────────────────────────────────────────────────────┤
│ 이상 감지 목록                                        │
│ 날짜       | CPU Z | WAS비율 Z | 환자비율 Z | Comment │
│ 2024-03-15 | 2.8   | 3.1       | 1.2        | [입력]  │
│ 2024-07-22 | 1.9   | 2.3       | 2.5        | [입력]  │
└─────────────────────────────────────────────────────┘
```

### 3.2 TOP 쿼리 관리 탭

```
┌─────────────────────────────────────────────────────┐
│ [성능 모니터링] [TOP 쿼리 관리]                       │
├─────────────────────────────────────────────────────┤
│ 주차: [2024-W01 ▼]                                   │  ← 필터
├──────┬──────────────┬───────────┬────────┬──────────┤
│ 순위 │ 업무용SQL_ID │ CPU Time  │ 실행수 │ 배지      │
├──────┼──────────────┼───────────┼────────┼──────────┤
│   1  │ PAT_VISIT_001│  3,200.5  │ 45,000 │ 🔴📈     │
│   2  │ OPD_LIST_002 │  2,800.1  │ 38,000 │ 🆕       │
│   3  │ ADM_STAT_003 │  2,100.4  │ 29,000 │ ⚠️       │
└──────┴──────────────┴───────────┴────────┴──────────┘
         ↓ 행 클릭 시
┌─────────────────────────────────────┐  (우측 슬라이드)
│ PAT_VISIT_001                        │
│ Oracle SQL_ID: abc123xyz             │
│ SQL: SELECT /*+ SQL_ID(PAT_VISIT_001)│
│      */ ...                          │
│                                      │
│ 순위 추이: [미니 차트]               │
│  W01:1, W02:3, W03:5 → 📈상승추세  │
│                                      │
│ 튜닝 이력                            │
│ 2024-02-01 | 인덱스 추가 | ✅완료   │
│ [날짜] [내용___________] [완료□]    │
│ [튜닝 완료 처리]                     │
└─────────────────────────────────────┘
```

---

## 4. 배지 로직 상세

| 배지 | 조건 | 계산 |
|------|------|------|
| 🆕 신규 | 직전 주 TOP 100 미포함 | `!prevWeekBizIds.has(bizId)` |
| 🔴 급상승 | 전주 대비 20단계↑ | `prevRank - currRank >= 20` |
| 📈 상승추세 | 3주 연속 순위 상승 | `rank[w-2] > rank[w-1] > rank[w]` |
| ⚠️ 재등장 | 튜닝완료 후 재진입 | `tuned === true && 이번주 TOP 100 포함` |

---

## 5. 데이터 구조

### db_perf.json
```json
{
  "data": [
    {
      "date": "2024-01-02",
      "db_time": 12540.3,
      "cpu_time": 8320.1,
      "logical_read": 45.2,
      "execute_cnt": 12.8,
      "was_count": 320,
      "patient_count": 1850
    }
  ]
}
```

### top_query.json
```json
{
  "weeks": [
    {
      "week": "2024-W01",
      "queries": [
        {
          "rank": 1,
          "oracle_sql_id": "abc123xyz",
          "biz_sql_id": "PAT_VISIT_001",
          "cpu_time": 3200.5,
          "execute_cnt": 45000,
          "sql_text": "SELECT /*+ SQL_ID(PAT_VISIT_001) */ ...",
          "tuned": false,
          "tuning_history": []
        }
      ]
    }
  ]
}
```

### localStorage 키 구조
```
amc_db_comments          → { "2024-03-15": "서버 배치 작업 겹침", ... }
amc_db_tuning_PAT_VISIT_001 → [{ date, note, done }, ...]
amc_db_tuned_PAT_VISIT_001  → true / false
```

---

## 6. vite.config.js

```js
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  server: { port: 3000 },
  build: { outDir: 'dist' }
})
```

---

## 7. 제약 및 전환 계획

| 항목 | 현재 (1단계) | 추후 (2단계) |
|------|-------------|-------------|
| 데이터 | 로컬 JSON 파일 | Supabase DB |
| 저장 | localStorage | Supabase (supabase.js 내부만 교체) |
| 공유 | 파일 직접 공유 | Supabase 실시간 공유 |
| 인증 | 없음 | Supabase Auth (선택) |

---

## 8. 테스트 계획

| ID | 항목 | 방법 |
|----|------|------|
| T-01 | Z-score 이상감지 정확도 | 샘플 데이터에 의도적 이상값 삽입 후 빨간 포인트 확인 |
| T-02 | 4종 배지 로직 | 테스트 JSON으로 각 조건 케이스 확인 |
| T-03 | 업무용 SQL_ID 파싱 | 다양한 힌트 패턴 입력 후 파싱 결과 확인 |
| T-04 | Comment/튜닝이력 영속성 | 저장 → 새로고침 → 재확인 |
| T-05 | 날짜 범위 필터 | 필터 변경 시 차트/테이블 업데이트 확인 |

---

## 11. 구현 가이드

### 11.1 구현 순서

1. Vite 프로젝트 초기화 + index.html 탭 구조
2. db.js: JSON 로드 + Z-score 계산
3. chart.js: 성능 시계열 차트 (이상 포인트 포함)
4. app.js: 성능 모니터링 탭 완성 (카드 + 차트 + 이상목록 + Comment)
5. db.js: 배지 로직 + SQL_ID 파싱
6. app.js: TOP 쿼리 탭 완성 (테이블 + 상세 패널 + 튜닝이력)
7. supabase.js stub 정리 + 최종 점검

### 11.2 의존성 설치

```bash
npm create vite@latest . -- --template vanilla
npm install
npm install chart.js
```

### 11.3 Session Guide

| Module | 내용 | 예상 파일 |
|--------|------|-----------|
| module-1 | Vite 초기화, index.html, main.css, 탭 구조 | index.html, main.css, app.js (skeleton) |
| module-2 | db.js (JSON 로드, Z-score), chart.js (성능 차트) | db.js, chart.js, config.js |
| module-3 | 성능 모니터링 탭 완성 (카드, 이상목록, Comment) | app.js, supabase.js |
| module-4 | TOP 쿼리 탭 (테이블, 배지, 상세 패널, 튜닝이력) | app.js 확장 |
