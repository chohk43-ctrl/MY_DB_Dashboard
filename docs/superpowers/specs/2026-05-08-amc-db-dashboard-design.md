# AMC DB 대시보드 설계 스펙

**작성일:** 2026-05-08  
**담당:** DBA  
**목적:** Oracle DB 성능 관리 및 TOP 쿼리 모니터링

---

## 1. 프로젝트 개요

- 사용 인원: DBA 팀 내 2~5명, 로컬 실행 (localhost)
- 로그인 없음, Comment는 단순 메모 수준 (작성자 구분 불필요)
- 데이터 저장: 1단계 로컬 JSON → 2단계 Supabase 전환
- 기술 스택: Vite + Vanilla JS + Chart.js

---

## 2. 아키텍처 및 파일 구조

```
dashboard-project/
├── index.html              # 메인 진입점 (탭 기반 SPA)
├── styles/
│   └── main.css            # 전체 스타일
├── scripts/
│   ├── app.js              # 앱 초기화, 탭 라우팅
│   ├── db.js               # JSON 데이터 로드 및 가공, 이상감지 계산
│   ├── chart.js            # Chart.js 차트 렌더링
│   └── supabase.js         # 현재 stub, 추후 Supabase 연동
├── data/
│   ├── db_perf.json        # 일별 성능 데이터 (Excel → JSON 변환)
│   └── top_query.json      # 주간 TOP 100 쿼리 데이터 (Excel → JSON 변환)
├── .env                    # Git 제외
└── vite.config.js
```

**데이터 흐름:**
```
Excel 파일 (수동 변환)
    ↓
data/db_perf.json / data/top_query.json
    ↓
db.js (로드 + 이상감지 계산)
    ↓
chart.js (시각화) + app.js (화면 렌더링)
```

**화면 구성:** 단일 HTML, JS 탭 전환
1. 성능 모니터링 탭
2. TOP 쿼리 관리 탭

---

## 3. 성능 모니터링 화면

### 화면 구성

```
[성능 모니터링 탭]
├── 날짜 범위 필터
├── 지표 요약 카드 (최근 1일 기준)
│   ├── DB Time / CPU Time / Logical Read / Execute Cnt
│   └── WAS Count / 환자수
├── 시계열 차트 (Chart.js Line Chart)
│   ├── CPU Time(s) — 주축
│   ├── WAS Count — 보조축
│   └── 환자수 — 보조축
└── 이상 감지 목록
    ├── 🔴 이상 항목 강조 표시
    └── Comment 입력란 (텍스트 메모, localStorage 저장)
```

### 이상 감지 로직 (Z-score 기반)

- 데이터 범위: 3년치 진료일 데이터 (비진료일 제외하여 제공)
- 기준값: 전체 데이터의 평균(μ), 표준편차(σ) 계산
- Z-score = `(당일값 - μ) / σ`
- **Alert 조건:** Z-score > 2.0 (상위 약 2.3%)
- 임계값(2.0)은 `config` 설정값으로 분리하여 조정 가능

**3가지 독립 지표 각각 계산:**
1. CPU Time 절대값
2. CPU Time / WAS Count 비율
3. CPU Time / 환자수 비율

**차트 표현:**
- Alert 날짜 포인트: 빨간색으로 강조
- 정상 날짜 포인트: 기본 색상

---

## 4. TOP 쿼리 관리 화면

### 화면 구성

```
[TOP 쿼리 관리 탭]
├── 주차 선택 필터
├── TOP 100 쿼리 목록 테이블
│   ├── 순위 / 업무용SQL_ID / Oracle SQL_ID(참조) / CPU Time / 실행횟수
│   ├── 🆕 신규 배지 — 이전주 TOP 100에 없던 쿼리
│   ├── 🔴 급상승 배지 — 전주 대비 20단계 이상 상승
│   ├── 📈 상승추세 배지 — 3주 연속 순위 상승
│   └── ⚠️ 재등장 배지 — 튜닝완료 처리 후 TOP 100 재진입
├── 쿼리 상세 패널 (행 클릭 시 슬라이드)
│   ├── SQL 텍스트 전문
│   ├── 업무용 SQL_ID 추출 표시 (/*+ */ 파싱)
│   ├── 순위 추이 미니 차트 (주별)
│   └── 튜닝 이력 (날짜 / 내용 / 완료여부)
└── 튜닝 완료 처리 버튼
```

### Alert 기준

| 배지 | 조건 |
|------|------|
| 🆕 신규 | 직전 주 TOP 100 미포함 |
| 🔴 급상승 | 전주 대비 순위 20단계 이상 상승 |
| 📈 상승추세 | 3주 연속 순위 상승 |
| ⚠️ 재등장 | 튜닝완료 후 TOP 100 재진입 |

### 업무용 SQL_ID 파싱

```js
// /*+ SQL_ID(업무용ID) */ 패턴에서 추출
const match = sql.match(/\/\*\+.*?SQL_ID\((.+?)\).*?\*\//);
const bizSqlId = match ? match[1] : null;
```

- Oracle SQL_ID는 테이블에 참조용으로만 표시
- 식별 기준은 반드시 업무용 SQL_ID 사용

---

## 5. 데이터 JSON 구조

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

---

## 6. 단계별 개발 계획

| 단계 | 내용 |
|------|------|
| 1단계 | Vite 프로젝트 초기 세팅, 탭 구조 HTML/CSS |
| 2단계 | db_perf.json 샘플 데이터 생성, 성능 모니터링 차트 구현 |
| 3단계 | Z-score 이상감지 로직 구현, Alert 표시 |
| 4단계 | TOP 쿼리 관리 화면, 배지 로직 구현 |
| 5단계 | 쿼리 상세 패널, 튜닝 이력 관리 |
| 6단계 | Supabase 연동 전환 |
