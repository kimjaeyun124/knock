# 실시간 이벤트 전달 (Socket.IO)

서버가 센서 신호를 받으면 연결된 보호자 화면이 **새로고침 없이** 바뀌도록 Socket.IO로 알립니다. 코드: 서버 `apps/server/src/realtime/`, 웹 `apps/web/src/lib/socket.ts`·`hooks/useRealtimeSync.ts`, 이벤트 이름·payload 타입 `packages/shared/src/realtime.ts`.

> **Socket.IO는 "화면을 빨리 갱신하라는 알림"일 뿐, 영구 저장이나 누락 복구를 보장하지 않습니다. DB가 원본입니다.**
> 연결이 끊긴 동안의 메시지는 쌓이지 않습니다. 화면은 연결될 때마다 REST로 목록을 다시 읽어 놓친 것을 채웁니다.

## 데이터 흐름

```
센서(또는 시뮬레이터)
  → POST /api/ingest/v1/events  (장치 토큰 인증)
  → 입력값 검증(형식·시각·eventId)        ─ 틀리면 400, 시각이 이상하면 REJECTED
  → 센서 등록 여부·사용 여부 확인         ─ 모르는 토큰 401, 꺼 둔 센서 403
  → DB 저장 (같은 eventId 는 한 번만)      ─ 중복이면 DUPLICATE, 저장·알림 없음
  → 분류·감지 규칙 → 알림 생성/합치기      (docs/DETECTION_RULES.md)
  → 가구별 Socket.IO 방에 발행            ─ 저장이 끝난 뒤에 알린다
  → 보호자 화면: 관련 데이터를 REST 로 다시 읽어 갱신
```

장치에 응답하기 전에 저장·규칙·발행 후처리가 끝나고, 후처리가 실패해도 **저장은 유지**되며 장치 요청은 성공으로 응답합니다(실패는 로그).

## 이벤트 이름과 payload

요청서의 예시 이름과 실제 이름의 대응입니다. 이 프로젝트는 처음부터 `대상.동작` 형식(점)을 써서 **이름은 바꾸지 않고** 대응표로 정리했습니다. 모든 이벤트의 이름과 payload 타입(Zod)은 `packages/shared/src/realtime.ts`의 `ServerToClientEvents`에서만 정의하며, 서버와 웹이 같은 타입을 씁니다.

| 요청서 예시 | 실제 이벤트 | payload | 받는 곳 | 화면에서 하는 일 |
|---|---|---|---|---|
| `motion:detected` | `event.created` | `{ event }` 움직임 신호 | 같은 가구 | 움직임 기록·대시보드 갱신 |
| `notification:created` | `alert.created` / `alert.updated` | `{ alert }` | 같은 가구 | 알림 목록에 ID 기준으로 먼저 반영(중복 없이) 후 서버 값으로 맞춤 |
| (알림 전달) | `alert.notify` | `{ alert, reason }` NEW·ESCALATED·REMINDER | **해당 보호자의 화면에만** | 배너·소리 (화면이 열려 있을 때만 동작하는 채널) |
| (읽음) | `alert.read` | `{ alertIds, all }` | 같은 보호자의 다른 기기 | 목록·읽지 않은 수 갱신 |
| `sensor:status` | `sensor.status` | `{ sensor, change }` | 같은 가구 | 센서 목록·상태 배지 갱신 |
| `monitoring:status` | **`monitoring.status`** (새로 추가) | `{ monitoring }` 사용 여부·요일·야간 시간·지금 판단 시간인가·사용/연결된 센서 수 | 같은 가구 | 대시보드의 모니터링 카드·센서·설정 갱신 |
| `system:connection` | `server:ready` + 화면의 연결 상태 | `{ serverTime }` | 연결한 화면 | 연결 상태·재연결 기록(아래) |
| (설정) | `settings.updated` | `{ settings }` | 같은 가구 | 설정 다시 읽기 |
| (전달 결과) | `delivery.updated` | `{ alertId, delivery }` | 같은 가구 | 알림 전달 상태 갱신 |

`monitoring.status`는 모니터링 설정을 저장했을 때, 센서를 만들거나 바꾸거나 지웠을 때, 센서의 연결·배터리 상태가 바뀌었을 때(신호 수신·주기 점검이 끊김을 찾았을 때) 발행됩니다. 시각 경과로 야간이 시작·종료되는 것은 이벤트가 아니라 화면이 시각으로 계산합니다.

## 보안

| 요구 | 구현 |
|---|---|
| 인증된 사용자만 연결 | 연결 시 세션 쿠키를 검증(`io.use`). 없거나 틀리면 `UNAUTHORIZED`로 거부. 출처(Origin)도 직접 검사 |
| 사용자별 접근 범위 | 연결되면 서버가 **세션에서 찾은** 가구·보호자·세션 방에만 넣는다(`household:`·`guardian:`·`session:`). 방 이름을 클라이언트가 정하지 않는다 |
| 임의 Room 참여 금지 | **클라이언트→서버 이벤트가 하나도 없다**(`ClientToServerEvents`는 비어 있음). `join` 같은 요청을 보내도 처리하는 핸들러가 없다 |
| 위조한 이벤트 발행 금지 | 서버만 발행한다. 클라이언트가 `alert.created` 등을 emit 해도 아무에게도 전달되지 않는다. 신호는 센서 토큰이 있는 수집 API로만 들어오고, 토큰이 틀리면 401 |
| 데이터 유효성 | 수집 API 입력은 Zod로 검증하고, 서버가 발행하는 payload는 공유 스키마 타입으로 만든다 |
| 로그아웃·만료 | 그 세션의 소켓을 즉시 끊는다(`session:` 방) |
| 시뮬레이터 | `SIMULATED`로 구별되고 앱 밖 채널로 나가지 않는다([SIMULATOR.md](SIMULATOR.md)) |

## 중복 처리

- 센서 신호는 장치가 만드는 고유 `eventId`를 갖는다. **같은 센서의 같은 eventId는 DB 유일 제약으로 한 번만 저장**되고(동시에 여러 번 와도), 저장되지 않은 신호는 소켓 발행도 알림도 없다. 응답은 `DUPLICATE`.
- 중복 전송은 알림의 발생 횟수(occurrences)에도 세지 않는다.
- 화면은 `alert.created`를 ID 기준으로 목록에 병합하므로, 같은 알림이 두 번 와도 한 장만 보인다([NOTIFICATIONS.md](NOTIFICATIONS.md)).

## 재연결과 복구 (화면)

- **자동 재연결**: `socket.io-client`가 점점 늘어나는 간격으로 다시 연결한다.
- **상태 기록**(`lib/socket.ts`의 `SocketInfo`): 현재 상태(연결 전·연결 중·연결됨·끊김·오류), **이번 끊김의 재연결 시도 횟수**, **다시 연결에 성공한 누적 횟수**, **마지막 연결 시각**, 마지막 끊김 시각, 마지막 연결 오류.
- **연결 실패 UI**: 연결이 끊기면 모든 화면 맨 위의 연결 안내가 "연결이 끊겨 최신 정보를 받지 못하고 있습니다"와 함께 *몇 번째 재연결 시도인지·마지막 오류*, 화면 내용이 *언제까지 확인한 정보인지*를 알린다. 끊긴 화면의 이전 정보를 현재 상태처럼 보여 주지 않는다. 설정 → 서비스 설정 → "시스템 연결 상태"에 같은 기록이 있다.
- **재연결 후 REST 동기화**: `connect`(처음 포함)마다 서버 상태·알림·움직임 기록·센서·설정과 대시보드·타임라인을 다시 읽는다. 끊기는 순간에도 서버 상태·센서·알림을 바로 다시 확인해, 확인에 실패하면 오래된 값 대신 실패를 알린다.

## 검증 (단계별 테스트)

| 완료 조건 | 테스트 |
|---|---|
| 1~4 시뮬레이션 이벤트 → 저장 → 전송 → 화면 | `realtime/realtime.flow.test.ts` — 수집 API로 신호를 보내면 DB에 저장되고, 같은 가구의 화면이 `event.created`·`alert.created`를 받으며(스키마 검증) 소켓으로 받은 값이 REST 값과 같다. 받는 순간 REST로 같은 기록이 읽힌다(저장 뒤 발행). `sensor.status`·`monitoring.status` 전달. E2E `flows.spec.ts` ①(대시보드 실시간 갱신), `simulator.spec.ts`(다른 탭 대시보드가 새로고침 없이 갱신) |
| 보안 | 같은 파일: 다른 가구는 받지 못함 · 위조 emit 무시 · 다른 가구 방 참여 시도 실패 · 비로그인/로그아웃 연결 거부 · 틀린 센서 토큰 401. `realtime/socket.test.ts`: 인증·출처 검사·방 구성 |
| 5 연결 종료 후 복구 | `realtime.flow.test.ts`(끊긴 동안의 이벤트는 소켓으로 오지 않지만 DB에 있고, 재연결 후 REST로 모두 읽힘, 이후 새 이벤트는 다시 실시간), `lib/socket.test.ts`(재연결 횟수·시각·오류), `useRealtimeSync.test.tsx`(연결 시 전부 다시 읽기), E2E `realtime.spec.ts`(화면 연결 끊김 → 서버에 신호 → 연결 복구 → **새로고침 없이** 끊긴 동안의 알림이 나타남) |
| 6 누락 데이터 재조회 | 위와 같음 (REST가 원본) |
| 7 중복 이벤트 방지 | `realtime.flow.test.ts`(같은 eventId 5번 동시 전송 → 저장·소켓·알림 한 번, 횟수에 불포함), `modules/alerts/rules-scenarios.test.ts` 시나리오 6 |

## 한계

- 서버가 여러 대이면 Socket.IO 방이 서버 사이에 공유되지 않습니다(어댑터 없음, 서버 1대 기준).
- 소켓 메시지를 서버가 버퍼링·재전송하지 않습니다. 복구는 화면의 REST 재조회에 의존합니다.
- `monitoring.status`는 사용 여부·연결 센서 수가 바뀔 때만 발행됩니다. 야간이 시작되는 시각 자체는 발행하지 않습니다.
- 푸시(브라우저를 닫은 상태)는 소켓이 아니라 별도 채널입니다([NOTIFICATIONS.md](NOTIFICATIONS.md)).
