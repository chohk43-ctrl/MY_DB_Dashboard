# AMC DB 대시보드 - CLAUDE.md

## 프로젝트 개요

**프로젝트명:** AMC DB 대시보드  
**목적:** Oracle DB 성능 관리 및 모니터링  
**담당자:** DBA

---

## 기능 구성

### 1. DB 일별 성능 모니터링

#### 데이터 항목
| 항목 | 설명 |
|------|------|
| DB Time(s) | 일별 DB 응답 시간 |
| CPU Time(s) | 일별 CPU 사용 시간 |
| Logical Read(백만) | 논리적 읽기 건수 |
| Execute Cnt(백만) | 쿼리 실행 횟수 |
| WAS Count | WAS 사용량 |
| 환자수 | 일별 환자 수 |

#### 데이터 소스
- 특정 Excel 파일로 사용자가 직접 업로드

#### 핵심 요구사항
- WAS 사용량, 환자수 대비 CPU 사용량 비교 시각화
- 평상시 대비 CPU 사용량 급증 자동 감지 및 알림 표시
- 이상 감지 시 화면에 문제 상황 표기
- DBA가 이상 항목에 Comment 작성 가능

---

### 2. DB TOP 쿼리 관리

#### 데이터 소스
- 매주 TOP 100 쿼리를 Excel 파일로 업로드

#### DB 환경
- Oracle DB

#### SQL 식별 기준
- Oracle SQL_ID는 참조용으로만 사용
- **업무용 SQL_ID** 기준으로 식별: 쿼리 힌트 주석 `/*+ */` 내부에 정의된 ID 사용
  - 예: `/*+ SQL_ID(업무용ID) */`

#### 핵심 요구사항
- 신규 TOP 쿼리 등록 및 튜닝 이력 관리
- 지속적으로 TOP에 반복 등장하는 쿼리 모니터링 및 알림
- 업무용 SQL_ID 기준으로 쿼리 추적 및 Alert

---

## 작업 규칙

- `.env` 파일은 **절대 수정하거나 Git에 추가하지 말 것**
- `.gitignore`에 `.env`, `.env.local` 포함되어 있음
- 환경변수는 `.env.example`로 키 목록만 관리

---

## 기술 스택 (예정)

- Frontend: React + Next.js
- 차트 라이브러리: Recharts 또는 Chart.js
- Excel 파싱: xlsx (SheetJS)
- 데이터 저장: 로컬 또는 경량 DB (추후 결정)

---

## 주요 화면 구성

1. **대시보드 홈** - 일별 성능 지표 요약 및 이상 감지 현황
2. **성능 추이 그래프** - DB Time, CPU Time, WAS Count, 환자수 시계열 차트
3. **이상 감지 목록** - 평상시 대비 임계치 초과 항목 + DBA Comment 입력
4. **TOP 쿼리 관리** - 주간 TOP 100 쿼리 목록, 신규/반복 쿼리 구분
5. **쿼리 상세 / 튜닝 이력** - 업무용 SQL_ID 기준 추적 및 이력 관리

---

## 파일 구조

```
dashboard-project/
├── index.html
├── styles/
│   └── main.css
├── scripts/
│   ├── app.js
│   ├── supabase.js
│   ├── db.js
│   └── chart.js
├── data/
│   └── sample.json
├── .env (Git 제외)
└── vite.config.js
```
