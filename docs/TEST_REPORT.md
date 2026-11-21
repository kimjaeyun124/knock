# 테스트 보고서

실행일: 2026-11-18 · macOS 27 · Node v26.8 · 실제 Google Chrome(Playwright `channel: 'chrome'`)

> 아래 숫자는 **이 날 실제로 실행한 결과**입니다. 실행하지 못한 것은 "실행하지 않음"으로 적었고, 통과한 것으로 세지 않았습니다.

## 1. 명령별 결과

| 명령 | 결과 |
|---|---|
| `npm run lint` | 통과 (오류 0) |
| `npm run format:check` | 통과 |
| `npm run typecheck` | 통과 (오류 0) |
| `npm run test` | **통과 — 합계 1,655개** (서버 768 · 웹 802 · 공유 51 · 시뮬레이터 34, 실패 0) |
| `npm run build` | 통과 (+ 빌드 후 검사 `check-client-bundle`: 웹 번들에 서버 전용 비밀값·Mock 어댑터 없음) |
| `npm run e2e` (Playwright, 실제 Chrome, 데스크톱·태블릿·모바일·운영 CSP 프로젝트) | **통과 — 알림 영상·구역별 판정 추가 후 전체 실행: 173개 통과(웹캠 4개 포함: 영상 첨부를 끄면 영상이 나가지 않음, 켜면 녹화본이 알림에 붙고 알림 상세에서 재생됨), 10개 건너뜀(프로젝트별로 의도한 건너뜀: 데스크톱 전용 시험 등), 실패 0** (13.4분). 앞선 디자인 변경 때 디자인 시험 3개가 옛 색상 값을 기대해 실패했던 것은 기대값을 고친 뒤 통과했습니다(4절 참고) |
| `npm audit --omit=dev` | 취약점 0건 |

### `npm run test` 상세 (워크스페이스별)

| 워크스페이스 | 파일 | 테스트 | 도구 |
|---|---|---|---|
| `apps/server` | 55 | 768 | Vitest + Supertest(실제 앱·실제 SQLite 임시 DB·실제 Socket.IO) |
| `apps/web` | 58 | 802 | Vitest + React Testing Library |
| `packages/shared` | 7 | 51 | Vitest (공유 계약·문구) |
| `packages/simulator` | 3 | 34 | Vitest (수집 클라이언트·CLI) |

(위 수치는 마지막 수정 이후 `npm test` 전체를 다시 실행한 결과입니다.)

## 2. 요청한 항목별 확인 위치

### 단위 테스트

| 항목 | 위치 |
|---|---|
| 이벤트 유형 분류 | `domain/rules/classify.test.ts`, `movement-rules.test.ts` |
| 감지 시간 판단 | `domain/time.test.ts`, `domain/rules/*.test.ts` |
| 자정 경계 시간 처리 | `domain/time.test.ts`(밤 10시~아침 6시처럼 자정을 넘는 구간), 웹 `lib/night.test.ts` |
| 센서별 감지 규칙 | `domain/rules/sensor-rules.test.ts`, `modules/alerts/rules-scenarios.test.ts` |
| 중복 이벤트 제거 | `modules/ingest/ingest.routes.test.ts`, `integrations/sensors/sensors.test.ts`(EventDeduper) |
| 알림 cooldown | `modules/alerts/alert-scenarios.test.ts`, `domain/rules/movement-rules.test.ts` |
| 배터리 부족 판단 | `domain/sensor-status.test.ts`, `modules/sensors/sensor-health.test.ts` |
| 센서 연결 상태 판단 | `domain/sensor-status.test.ts`, `sensor-health.test.ts` |
| 시간대 처리 | `domain/time.test.ts`(한국 시각 기준), 웹 `lib/localTime.test.ts` |
| 입력값 검증 | `packages/shared`(zod·계약), `config/env.test.ts`, 라우트별 잘못된 요청 시험 |

### API 테스트 (Supertest, 실제 서버·DB)

센서 CRUD(`sensors.routes.test.ts`) · 이벤트 저장·조회(`ingest.routes.test.ts`, `events.routes.test.ts`, `timeline.routes.test.ts`) · 알림 조회·읽음 처리(`alerts.routes.test.ts`, `alerts.read.test.ts`) · 설정 조회·수정과 판단 규칙에 반영(`settings.routes.test.ts`, `settings-effect.test.ts`) · 잘못된 요청 · **인증 및 권한 검사**(비로그인 401, 다른 가구의 데이터 404, 다른 출처 403, 세션 만료·로그아웃, 소켓 인증: `auth.routes.test.ts`, `security.test.ts`, `socket.test.ts`, 각 `*.routes.test.ts`) · REST v1(`v1.routes.test.ts`).

### 프론트엔드 테스트 (React Testing Library)

대시보드 렌더링(`dashboard.test.tsx`) · 센서 목록·등록(`sensors.test.tsx`, `sensorHealth.test.tsx`) · 이벤트 필터(`events.test.tsx`, `filters.test.ts`) · 알림 읽음 처리(`notifications.test.tsx`) · 설정 저장(`detection.test.tsx`, `notifications.test.tsx`) · 로딩·오류·빈 상태(`QueryState.test.tsx`, 각 화면 시험) · 연결 끊김 상태(`connection.test.ts`, `useServerStatus.test.tsx`, `layout.test.tsx`).

### E2E (Playwright, 실제 서버 + 실제 Chrome)

| 시나리오 | 파일 |
|---|---|
| **A** 로그인 → 대시보드 → 센서 조회 → 움직임 기록 확인 | `dashboard.spec.ts`, `sensors.spec.ts`, `events.spec.ts`(로그인은 `global-setup` 이 실제 로그인 API 로 수행) |
| **B** 시뮬레이터 이벤트 → 서버 저장 → 대시보드 실시간 변경 → 알림 센터 반영 | `flows.spec.ts` ①②, `simulator.spec.ts`, `notifications.spec.ts`, `realtime.spec.ts` |
| **C** 센서 연결 끊김 → 상태 변경 → 경고 → 복구 | `flows.spec.ts` ③, `sensor-health.spec.ts` |
| **D** 모니터링 시간·민감도 변경 → 설정 저장 → 판단 규칙 반영 | `settings.spec.ts`, `flows.spec.ts` ⑤(민감도), 서버 `settings-effect.test.ts` |
| 데모 시나리오(반복 신호 → 기록은 모두·알림 1건, 초기화 후 반복) | `demo.spec.ts` |
| 5개 화면 폭(375·390·768·1024·1440) 전체 화면 | `viewports.spec.ts` |
| 접근성(axe)·키보드·디자인·레이아웃·반응형·운영 빌드 CSP·온보딩·연결 | `a11y` `keyboard` `design` `layout` `responsive` `csp` `onboarding` `connection` |

## 3. 테스트 원칙 확인

- **독립 실행**: 서버 시험은 파일마다 임시 SQLite 파일을 만들어 **실제 마이그레이션 SQL**을 적용하고 끝나면 지웁니다. 시계는 주입해서 시간에 의존하는 시험이 날짜에 흔들리지 않게 했습니다(이 보고서 작성 전에 날짜 의존 시험 1건을 찾아 고침).
- **테스트용 DB 분리**: 단위·통합은 임시 DB, E2E 는 `apps/server/prisma/e2e.db`(매 실행 새로 만듦). 개발 DB(`dev.db`)를 쓰지 않습니다.
- **데이터 정리**: E2E 각 시험이 시작 전 시뮬레이션 데이터·설정을 되돌립니다(`resetState`).
- **외부 서비스 Mock 은 필요한 곳에만**: 푸시 전송기(`PushSender`)만 가짜로 바꿨습니다. 핵심 이벤트 처리 흐름(수집 → 검증 → DB → 규칙 → 알림 → 실시간)은 **실제 서버·DB 통합 시험**입니다.
- **실패를 무시하지 않음**: 아래 "발견된 실패"를 모두 원인을 찾아 고쳤고, 시험을 느슨하게 바꿔 통과시킨 것은 없습니다(바꾼 시험은 의도된 동작 변경을 반영한 것이며 이유를 적음).

## 4. 이번 실행에서 발견된 실패와 처리

| # | 실패 | 원인 | 처리 |
|---|---|---|---|
| 1 | 서버 6개: 알림의 전달 기록 수·채널 목록이 기대와 다름 | 이번에 추가한 스마트워치(`WATCH`) 채널이 채널 수를 4→5로 늘림 / 푸시 기기 없음이 재시도 대기가 아니라 즉시 실패가 됨 | **의도된 동작 변경이라 시험을 갱신**(`notConfigured` 3→4, 채널 목록에 WATCH, 구독 없음은 `FAILED`·시도 1회) |
| 2 | 웹 1개: 연동 현황 Mock 화면의 "연동되지 않음" 개수 | Mock 목록에 `WATCH` 추가 | 시험을 3개로 갱신(스마트워치는 연동하지 않은 채널) |
| 3 | E2E `viewports.spec` : 터치 영역 21px 링크 | 새로 만든 "시뮬레이션 데이터" 띠의 "데이터 관리" 링크가 작았음 | **제품 코드 수정**(`min-h-11`) — 새 시험이 잡은 실제 결함 |
| 4 | E2E 대량 실패(429) | 새 사용자용 API 요청 제한(기본 분당 1200)이 한 IP 에서 분당 수백 건을 보내는 E2E 에 걸림 | E2E 서버만 한도를 높임(`API_RATE_LIMIT_PER_MINUTE=60000`). 요청 제한 동작은 서버 시험(`security.test.ts`)이 확인. 기본값은 정상 사용에 여유가 있게 600→1200 으로 올림 |
| 5 | E2E `sensors.spec` 2개(데스크톱·모바일) — "저장" 버튼이 2개로 잡힘 | **직전 작업(센서 상태 모니터링)에서 센서 상세에 "기준 저장" 버튼을 추가**했는데 이 E2E 는 그때 다시 돌리지 않았음 | 시험의 버튼 이름을 `exact: true` 로 고침(제품은 정상) |
| 6 | E2E 모바일 대시보드·기록 4개 | 5번 실패가 시험 도중 멈추면서 **실제 센서 하나가 등록된 채로 남아** 이어지는 시험의 "빈 상태"·"정상" 기대가 깨짐 | 5번을 고친 뒤 해당 시험을 모든 프로젝트에서 다시 실행해 통과 확인 |
| 7 | 서버 1개: `v1.routes.test.ts` "/sensors 목록: 필터·정렬…" 가 한 번 실패 | 기계에 부하를 주고(서버 시험을 여러 개 동시에 실행) 반복해 **재현**했고, 원인은 **시험의 기본 제한시간 5초 초과**(시험마다 실제 scrypt 비밀번호 해시·임시 DB 를 만들기 때문)였습니다. 논리 오류가 아닙니다. | 서버 `testTimeout` 을 20초로 올림. 그 뒤 같은 부하에서 28회 중 1회 더 실패했으나 원인 메시지를 확인하지 못했습니다(제한시간 초과일 가능성이 높음). **극단적인 부하에서는 여전히 불안정할 수 있습니다.** |
| 8 | 전체 E2E 2번에서 서로 다른 시험 1개씩 실패: ① `flows.spec` ① (시작 전제 "사용 중인 센서 없음"), ② `connection.spec` "로그인 만료" | 단독 재실행에서는 재현되지 않음(flows 5/5, 데스크톱 시험 83개 연속 통과, connection 6회 반복 30/30). 이 시점 컴퓨터 부하(load average 4~6)가 높았고 전체 실행이 평소(10.7분)보다 길었습니다(12~14분). **원인은 확정하지 못했습니다** — 시험이 서버 상태를 공유하는 구조와 부하로 인한 시간 의존이 의심되지만 증명하지 못했습니다. 코드는 고치지 않았고, 세 번째 전체 실행은 실패 0 이었습니다. | 미확정(재현되면 원인부터 확인) |

## 5. 실행하지 못했거나 통과로 볼 수 없는 것

- **실제 하드웨어 센서**: 없음 — 모든 신호는 시뮬레이터입니다.
- **진짜 웹캠·진짜 사람의 움직임**: 웹캠 움직임 감지는 Chrome 의 가짜 카메라(계속 변하는 테스트 화면)로만 시험했습니다. 실제 카메라에서의 감도와 오탐(조명·흔들림)은 직접 확인해야 합니다.
- **자동 백업의 실제 운영 환경 동작**: 임시 폴더에서 백업을 만들고 그 파일을 다시 열어 데이터를 읽는 것까지만 시험했습니다. 다른 디스크·기기로 옮겨지는지, 실제 서버에 복구해 보는 연습은 하지 못했습니다. E2E 서버는 `BACKUP_DIR` 없이 돌아 화면의 "꺼짐" 상태만 E2E 로 확인했고, 켜진 상태의 화면은 단위 시험입니다.
- **실제 푸시 서비스(FCM·Mozilla·Apple)로의 전달과 기기 수신**: 확인하지 못했습니다. 전송기를 가짜로 바꾼 시험과 실제 `web-push` 라이브러리의 요청 형식 시험까지만 했습니다.
- **스마트워치(Apple Watch·Wear OS)**: 기능이 없고 기기로도 시험하지 못했습니다.
- **실제 스크린리더(VoiceOver 등)**: 자동 점검(axe)과 키보드 점검까지만 했습니다.
- **다른 브라우저(Firefox·Safari)·실제 모바일 기기**: Chrome 데스크톱과 Chrome의 기기 에뮬레이션(태블릿·모바일)만 했습니다.
- **부하·침투 시험**: 하지 않았습니다.
- 한 가지 시험(`sensors.spec` 등)이 실패한 뒤 나머지가 연쇄로 실패한 경우가 있었으므로, **E2E 는 한 번에 하나씩(workers: 1) 실행하고 실패하면 원인부터 고쳐야 합니다.**

## 6. 다시 실행하는 방법

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
npm run e2e        # 실제 Chrome 필요. 서버(4100)·웹(5273)·미리보기(5274) 포트를 씁니다
```
