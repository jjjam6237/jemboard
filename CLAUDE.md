# JemBoard (잼시보드) — 프로젝트 맥락

## 개요
퍼포먼스 마케팅 성과 대시보드. **정적 사이트**(Vanilla JS + Chart.js + SheetJS/ExcelJS, 빌드·서버 없음).
파일: `index.html` / `styles.css` / `core.js`(데이터·집계 로직) / `ui.js`(렌더링·상태).
데이터는 `data.json`/`kw_data.json`을 브라우저가 `raw.githubusercontent.com`에서 직접 fetch (인증 없음 → **repo가 반드시 public이어야 동작**).

## 기기 간 작업 이어가기
```bash
git clone https://github.com/jjjam6237/jemboard.git   # 처음 1회
cd jemboard
git pull                                                # 이후엔 pull만
claude                                                   # 이 CLAUDE.md 자동 로드
```
빌드/설치 과정 없음(정적 파일). 로컬 확인은 `python -m http.server` 등으로 index.html 서빙.
로컬 테스트 시 GitHub 데이터가 안 뜨면(404 등) 브라우저 콘솔에서 `Store.load(rows); UI.render();`로 더미 데이터 직접 주입 가능.

## 현재 진행상황
**마지막 업데이트:** 2026-07-04

**완료된 기능 (실무 기능 확장 3단계, 각각 커밋 완료·push됨):**
- **STEP 1** — 목표 KPI(ROAS/CPA 추가) + 신호등(🟢/🟡/🔴): KPI카드·일별 테이블에 목표 대비 달성률 표시
- **STEP 2** — 캠페인 탭 최상단 "오늘의 브리핑" 카드: 어제 vs 그제/7일평균 변화 + 이상탐지 요약 + 목표 페이싱 경고 + 최우선 액션 1줄, 클립보드 복사 버튼
- **STEP 3** — 헤더 "리포트" 버튼: 기간(주간/월간/사용자지정) 선택 → 클립보드 텍스트(요약/증감/매체별/인사이트/액션플랜) + xlsx 다운로드(요약/매체별/일별 3시트, ExcelJS 서식 적용) 원클릭 생성

**주요 결정사항:**
- repo를 한때 private으로 걸었다가 **다시 public으로 전환함** — 데이터 fetch가 인증 없이 이뤄지는 구조라 private이면 대시보드가 아무도 안 보임. 지금 `data.json`은 익명화된 샘플 데이터라 노출 위험 없음
- **보류 중인 결정**: 나중에 실제(민감한) 데이터를 넣는 시점부터 어떻게 보호할지 미정 — 후보는 (a) GitHub 자동배포 없이 로컬 "리포트 업로드"(xlsx→localStorage)만 사용, (b) 최소 서버리스 프록시로 PAT를 서버 측에만 보관 + 접근 제어. 실데이터 투입 전에 다시 논의 필요
- API 키(GitHub PAT)는 `Deployer`가 브라우저 localStorage에만 저장, 코드/git에는 절대 커밋 안 함

**다음 할 일:**
- 특별히 정해진 다음 작업 없음. 위 "보류 중인 결정"이 실데이터 투입 전 우선 논의 대상
