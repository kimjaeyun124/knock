# 웹 ↔ 서버 연결 (API Client · 서버 상태 · 오류 안내)

웹 화면은 **실제 서버 API**를 씁니다. 화면에서 서버로 가는 길은 하나입니다: `useApi()` → `ApiClient`(`services/api/http.ts`) → `apiRequest()`(`services/apiClient.ts`).

## 구조

| 층 | 위치 | 하는 일 |
|---|---|---|
| 공통 API Client | `services/apiClient.ts` | 모든 요청의 유일한 통로. **2xx + 응답이 스키마(Zod)와 일치**할 때만 성공. 시간 초과·취소·오류를 `ApiError`로 통일 |
| 기능별 API | `services/api/http.ts` (+ 타입 `types.ts`) | 센서·움직임·알림·설정 등 엔드포인트와 응답 스키마 |
| 개발용 Adapter | `services/api/mock.ts`, `mockTimeline.ts` | 같은 `ApiClient` 인터페이스를 지키는 Mock. 개발 서버에서만 불러오고 운영 빌드에는 들어가지 않음 |
| 서버 상태 | TanStack Query | `lib/queryKeys.ts`가 키를 한 곳에서 관리. 실시간(Socket.IO) 이벤트가 어떤 키를 새로 고칠지도 여기서 정해짐 |
| UI 전용 상태 | 각 컴포넌트의 `useState`·URL 쿼리(`?view=`, `?step=`)·기기 설정(`localStorage`) | 서버 데이터와 섞지 않음. 필터·열린 패널·입력 중인 값은 서버 상태에 넣지 않는다 |

## 기능별 연결

| 기능 | 서버 API | 변경 뒤 갱신 / 일관성 |
|---|---|---|
| 대시보드 요약 | `GET /api/v1/dashboard/summary` 한 번(응답 `{ data }`를 공유 `DashboardSummaryResponseSchema`로 검증). 서버가 센서·움직임·알림·설정·주간 요약을 모아 줌 | 서버가 하나라도 읽지 못하면 전체 실패. 실시간 이벤트·설정 저장·센서 변경 시 새로 고침 |
| 센서 목록·등록·수정·삭제 | `GET/POST /api/sensors`, `PATCH/DELETE /api/sensors/:id` | 등록·삭제는 서버 응답 뒤에 목록 갱신. **수정은 낙관적 업데이트 + 실패 시 롤백** |
| 움직임 기록 | `GET /api/timeline` `…/summary` `…/:id`(필터·커서 페이지) | 센서·알림 변경 뒤 갱신 |
| 알림 목록·읽음 | `GET /api/alerts`, `POST /api/alerts/:id/read`, `/read-all` | **낙관적 업데이트 + 실패 시 롤백**, 끝나면 서버 값으로 다시 맞춤. 읽음은 DB(`AlertRead`)에 저장 |
| 모니터링·감지·알림 설정 | `PUT /api/settings/detection`, `/alerts` | **낙관적 업데이트를 쓰지 않음** — 서버가 저장을 확인한 뒤에만 "저장했습니다" |

> 대시보드는 v1 API([API.md](API.md))를 쓰는 유일한 화면입니다. 나머지는 기존 `/api/...` 경로를 그대로 씁니다. (센서·알림 등을 v1으로 옮기는 일은 화면이 달라질 이유가 없어 하지 않았습니다.) 웹 테스트의 가짜 서버(`stubApi`)는 요약을 따로 정하지 않으면 센서·움직임·알림·설정 응답을 서버와 같은 방식(공유 `buildDashboardSummary`, 하나라도 오류면 전체 오류)으로 모아 돌려줍니다.

## 연결 오류 안내 (한 곳에서 한국어로)

오류는 `ApiError`로 통일되고, 화면 문구는 `lib/apiErrors.ts`의 `describeApiError()`가 정합니다. 화면의 오류 상태(`ErrorState`)는 **무엇이 잘못됐는지 + 해 볼 일 + 문의용 요청 번호**를 보여 줍니다.

| 상황 | 판정 | 사용자에게 보이는 말 |
|---|---|---|
| 서버가 실행 중이 아님 | `kind: 'network'` (연결 실패) 또는 프록시의 502/503/504 | "서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인해 주세요." + "서버가 실행 중인지, 주소가 맞는지 확인…" |
| 응답 시간 초과 | `kind: 'timeout'` (15초, `REQUEST_TIMEOUT_MS`) | "서버가 정해진 시간 안에 응답하지 않았습니다. 잠시 뒤 다시 시도해 주세요." |
| 잘못된 응답 | `kind: 'invalid-response'` (200이어도 스키마·형식이 다름) | "서버 응답이 예상한 형식과 다릅니다. …" + "웹 화면과 서버가 서로 다른 버전일 수 있습니다…" |
| 인증 만료 | 로그인한 상태에서 401 (`isSessionExpired`) | **로그인 화면으로 이동**, "로그인이 만료되었습니다. 다시 로그인해 주세요. 하던 화면은 로그인하면 이어서 열립니다." |
| 네트워크 끊김 | `kind: 'offline'` (`navigator.onLine=false`) | "인터넷 연결이 끊겨 있습니다. 연결을 확인한 뒤 다시 시도해 주세요." + Wi-Fi·모바일 데이터 확인 안내 |

- 서버가 보낸 한국어 메시지(예: "이미 등록된 장치 번호입니다.")는 그대로 보여 줍니다. 내부 DB 오류·경로는 서버가 이미 가려서 보냅니다.
- **세션 만료는 한 곳에서 처리**합니다(`lib/queryClient.ts`의 `QueryCache`/`MutationCache` `onError`): 어떤 요청이든 401이면 로그인 정보를 지우고 **이전 사용자의 캐시도 비웁니다**. 로그인 시도 자체의 401(비밀번호 틀림)은 만료로 보지 않습니다.
- 상단 연결 상태(정상·연결 중·끊김·확인 불가)는 `timeout`·`offline`·`network`를 모두 "서버에 닿지 못함"으로 봅니다.
- 재시도: 연결 실패(network)·5xx만 최대 2번 자동 재시도. 시간 초과·오프라인·4xx·형식 오류는 바로 오류로 보이고 "다시 시도"로 직접 다시 합니다(오프라인은 연결이 돌아오면 자동으로 다시 읽음).

## 요청 취소

모든 `useQuery`의 `queryFn`이 TanStack Query가 주는 `signal`을 `apiRequest`까지 전달합니다. 화면을 떠나거나 조건이 바뀌어 요청이 필요 없어지면 **실제로 취소**됩니다(취소는 오류로 표시하지 않음). 시간 초과 신호와 호출자 신호는 하나로 합쳐지며, 어느 쪽이 끊었는지 구별해 시간 초과만 오류로 알립니다.

## 실행 모드: API / Demo

| `VITE_APP_MODE` | 동작 |
|---|---|
| 비움 / `api` (기본) | **모든 기능이 실제 서버.** (`VITE_MOCK_FEATURES`로 개발 중 일부 기능만 샘플로 바꿀 수는 있음) |
| `demo` | Mock이 있는 기능(대시보드·센서·움직임 기록·연동 현황)을 모두 **테스트 데이터(샘플)** 로. 로그인·서버 상태는 항상 실제 서버, 알림·설정은 Mock이 없어 실제 서버. `VITE_MOCK_FEATURES`를 함께 주면 그 기능만 |

- **Demo Mode 표시**: 모든 화면(로그인 포함) 위에 *"데모 모드입니다. 대시보드·센서·… 화면은 테스트 데이터(샘플)이며 실제 센서·서버 데이터가 아닙니다. 로그인·알림·설정은 실제 서버를 씁니다."* 를 띄우고, 샘플 화면에는 기존 "(샘플)" 표식과 상단 "샘플 데이터" 배지가 함께 보입니다.
- **개발 전용**: 운영 빌드에서는 `VITE_APP_MODE=demo`가 있으면 `npm run build`가 실패하고(`vite.config.ts`), 번들 검사(`scripts/check-client-bundle.mjs`)가 Mock 표식을 한 번 더 찾습니다. 앱이 시작될 때도 Mock을 불러올 수 없으면 데모 모드를 거부합니다.
- Mock은 삭제하지 않고 `services/api/mock*.ts`에 그대로 있습니다. 같은 `ApiClient` 인터페이스라 화면 코드는 모드를 알 필요가 없습니다.

## 데이터 일관성 원칙

- **서버 저장이 실패한 변경을 성공으로 보이지 않습니다.** 센서 수정과 알림 읽음의 낙관적 업데이트는 실패하면 이전 값으로 **롤백**하고 이유를 알립니다. 설정·등록·삭제는 서버 확인 뒤에만 성공 표시를 합니다.
- 서버 데이터를 못 읽으면 가짜·빈 목록 대신 오류를 보여 줍니다(빈 상태와 오류 상태를 구별).
- 새로고침해도 화면 데이터는 서버에서 다시 읽으므로 DB에 저장된 값이 그대로 보입니다(E2E `connection.spec.ts`, `sensors.spec.ts`, `notifications.spec.ts`, `settings.spec.ts`가 확인).

## 검증

- 단위: `services/apiClient.test.ts`(시간 초과·오프라인·취소·경로), `lib/apiErrors.test.ts`(5종 문구·세션 만료 판정), `lib/queryClient.test.tsx`(재시도 정책·401 전역 처리·만료 안내 화면), `services/api/features.test.ts`(모드·운영 빌드 거부), `components/layout/DemoModeBanner.test.tsx`
- E2E `connection.spec.ts`: 서버 연결 실패→안내→복구, 잘못된 응답, 오프라인, 세션 만료→로그인 화면, 새로고침 후 유지
- 응답 시간 초과(15초)는 가짜 타이머로 단위 테스트합니다(E2E에서는 기다리지 않음).
