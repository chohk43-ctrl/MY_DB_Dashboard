# Plan: AMC DB 대시보드 (dashboard)

**작성일:** 2026-05-08  
**Phase:** Plan  
**Feature:** dashboard

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | DBA가 일별 DB 성능 이상을 수작업으로 파악하고 있어 CPU 급증 감지가 늦고, TOP 쿼리의 순위 변화를 체계적으로 추적하지 못하고 있다 |
| **Solution** | Excel 데이터를 JSON으로 변환하여 Z-score 기반 이상감지 차트와 TOP 쿼리 순위 추이 배지를 제공하는 로컬 웹 대시보드를 구축한다 |
| **Functional UX Effect** | DBA가 브라우저에서 성능 이상 날짜를 즉시 식별하고 메모를 남기며, 위험 쿼리를 배지로 빠르게 파악해 튜닝 우선순위를 결정할 수 있다 |
| **Core Value** | 3년치 실데이터 기반 통계로 "진짜 이상"만 Alert하여 DBA의 판단 부담을 줄이고 튜닝 이력을 축적한다 |

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

## 1. 요구사항

### 1.1 기능 요구사항

#### F1. 성능 모니터링 탭

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| F1-01 | db_perf.json 로드 및 일별 지표 표시 | 필수 |
| F1-02 | 날짜 범위 필터 | 필수 |
| F1-03 | 지표 요약 카드 (DB Time, CPU Time, Logical Read, Execute Cnt, WAS Count, 환자수) | 필수 |
| F1-04 | 시계열 Line Chart (CPU Time 주축, WAS Count/환자수 보조축) | 필수 |
| F1-05 | Z-score 이상감지: CPU Time 절대값 | 필수 |
| F1-06 | Z-score 이상감지: CPU Time / WAS Count 비율 | 필수 |
| F1-07 | Z-score 이상감지: CPU Time / 환자수 비율 | 필수 |
| F1-08 | 이상 날짜 차트 포인트 빨간색 강조 | 필수 |
| F1-09 | 이상 감지 목록 테이블 표시 | 필수 |
| F1-10 | 이상 항목별 Comment 입력 및 localStorage 저장 | 필수 |
| F1-11 | Z-score 임계값(기본 2.0) 설정값으로 분리 | 선택 |

#### F2. TOP 쿼리 관리 탭

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| F2-01 | top_query.json 로드 및 주간 TOP 100 쿼리 목록 표시 | 필수 |
| F2-02 | 주차 선택 필터 | 필수 |
| F2-03 | 업무용 SQL_ID 파싱 (`/*+ SQL_ID(...) */` 패턴) | 필수 |
| F2-04 | 🆕 신규 배지: 직전 주 TOP 100 미포함 쿼리 | 필수 |
| F2-05 | 🔴 급상승 배지: 전주 대비 20단계 이상 순위 상승 | 필수 |
| F2-06 | 📈 상승추세 배지: 3주 연속 순위 상승 | 필수 |
| F2-07 | ⚠️ 재등장 배지: 튜닝완료 처리 후 TOP 100 재진입 | 필수 |
| F2-08 | 쿼리 행 클릭 시 상세 패널 슬라이드 표시 | 필수 |
| F2-09 | 상세 패널: SQL 전문, 업무용 SQL_ID, 순위 추이 미니 차트 | 필수 |
| F2-10 | 상세 패널: 튜닝 이력 (날짜/내용/완료여부) 입력 및 저장 | 필수 |
| F2-11 | 튜닝 완료 처리 버튼 | 필수 |

### 1.2 비기능 요구사항

| ID | 요구사항 |
|----|----------|
| NF-01 | 로컬 실행 (Vite dev server, localhost) |
| NF-02 | 로그인 없음, 팀원 2~5명 공유 사용 |
| NF-03 | .env 파일 절대 수정 및 Git 추가 금지 |
| NF-04 | Supabase 연동 전환을 위해 supabase.js를 stub으로 분리 |
| NF-05 | 3년치 진료일 데이터(비진료일 제외) 기반 통계 계산 |

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| 빌드 도구 | Vite |
| 언어 | Vanilla JavaScript (ES Modules) |
| 차트 | Chart.js |
| 데이터 | 로컬 JSON (db_perf.json, top_query.json) |
| 저장 | localStorage (Comment, 튜닝 이력) |
| 추후 전환 | Supabase (supabase.js stub 준비) |

---

## 3. 데이터 구조

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

## 4. 이상감지 로직

- **데이터 범위:** 전체 db_perf.json (3년치 진료일)
- **계산:** 평균(μ), 표준편차(σ) 산출
- **Z-score:** `(당일값 - μ) / σ`
- **Alert 조건:** Z-score > 2.0 (config로 분리)
- **대상 지표 3가지 독립 계산:**
  1. CPU Time 절대값
  2. CPU Time / WAS Count
  3. CPU Time / 환자수

---

## 5. 성공 기준

| ID | 기준 | 측정 방법 |
|----|------|-----------|
| SC-01 | 이상감지 Alert가 차트에 빨간 포인트로 정확히 표시됨 | 샘플 데이터로 Z>2.0 케이스 육안 확인 |
| SC-02 | 4가지 배지(신규/급상승/상승추세/재등장)가 정확히 표시됨 | 테스트 데이터로 각 조건 확인 |
| SC-03 | 업무용 SQL_ID가 `/*+ */` 패턴에서 정확히 파싱됨 | 다양한 SQL 텍스트로 파싱 확인 |
| SC-04 | Comment와 튜닝 이력이 새로고침 후에도 유지됨 | localStorage 저장 확인 |
| SC-05 | Vite dev server로 팀원 누구나 즉시 실행 가능 | npm run dev 실행 테스트 |

---

## 6. 개발 단계

| 단계 | 내용 | 산출물 |
|------|------|--------|
| 1 | Vite 프로젝트 초기 세팅, HTML/CSS 탭 구조 | index.html, main.css |
| 2 | db_perf.json 샘플 생성, db.js 데이터 로드, 차트 렌더링 | db.js, chart.js |
| 3 | Z-score 이상감지 로직, Alert 표시, Comment 기능 | db.js 확장 |
| 4 | top_query.json 샘플 생성, TOP 쿼리 목록 테이블 | app.js 확장 |
| 5 | 배지 로직 4종, 쿼리 상세 패널, 튜닝 이력 | app.js 확장 |
| 6 | supabase.js stub 준비, 최종 정리 | supabase.js |

---

## 7. 제약 사항

- Excel → JSON 변환은 수동 (별도 변환 스크립트 고려 가능)
- 비진료일 데이터는 제공 전 사용자가 제거하여 업로드
- 현재 단계에서 인증/권한 없음
- 데이터는 로컬 파일 기반 (팀 공유 시 파일 직접 공유 필요)
