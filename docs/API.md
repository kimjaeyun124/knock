# REST API v1

기본 경로: **`/api/v1`** · 코드: [`apps/server/src/modules/v1/`](../apps/server/src/modules/v1/) · 테스트: `modules/v1/v1.routes.test.ts` (실제 SQLite에서 69개 시나리오)

웹 화면이 쓰는 기존 경로(`/api/...`)는 그대로 두었습니다. v1은 **같은 서비스 계층 위에 얹은 버전 API**라서 두 경로가 같은 규칙·같은 데이터를 씁니다. (화면은 아직 `/api`를 씁니다. 외부 연동·앱은 `/api/v1`을 권장합니다.)

## 구조

```
요청 → Controller (modules/v1/*.controller.ts)   입력 검증(Zod)·응답 형식·페이지 정보
     → Service    (services/*.service.ts)        규칙·권한(가구 범위)·트랜잭션
     → Repository / Prisma                       DB 접근 (새 보호 대상은 repositories/care-recipient.repository.ts)
     → 오류는 어디서든 던지면 middleware/error-handler.ts 한 곳이 응답으로 바꿈
```

## 인증과 데이터 접근 범위

- 로그인은 기존 `POST /api/auth/login`(이메일·비밀번호)으로 하고, **세션 쿠키 하나**로 인증합니다. 로그인하지 않으면 `/health`를 뺀 모든 v1 요청이 **401**입니다.
- **사용자 ID·가구 ID를 요청으로 받는 곳이 없습니다.** 데이터 범위(가구)는 항상 세션에서 정해집니다. 본문에 `householdId` 같은 값을 보내도 무시됩니다(센서 등록 테스트가 확인).
- 다른 가구의 리소스는 **404**로 응답합니다. 존재 여부를 알려 주지 않기 위해서입니다. (403이 아님)
- 쓰기 요청(POST·PATCH·DELETE)은 허용된 출처(`CLIENT_ORIGIN`)에서 온 것만 받습니다(아니면 403, CSRF 방어).
- 모든 응답에 `Cache-Control: no-store`가 붙습니다.
- 인증이 없는 환경에서 외부에 노출하지 마세요. 이 서버는 [OPERATIONS.md](OPERATIONS.md)의 리버스 프록시·HTTPS 구성 뒤에서 운영하는 것을 전제로 합니다.

## 응답 형식

성공:

```json
{ "data": { ... } }
{ "data": [ ... ], "meta": { "limit": 50, "nextCursor": "…", "hasMore": true } }
```

실패(모든 API가 같은 형식. 내부 DB 오류·스택·경로는 담지 않음):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 내용이 올바르지 않습니다.",
    "requestId": "09825c80-9365-427b-a2d9-02d749688f10",
    "details": [{ "path": "to", "message": "종료 시각(to)은 시작 시각(from)보다 같거나 늦어야 합니다." }]
  }
}
```

| 상태 | code | 언제 |
|---|---|---|
| 200 / 201 | — | 성공 / 만들어짐 |
| 400 | `VALIDATION_ERROR` | 형식·범위가 틀림, 빈 필수값, 이상한 ID, 날짜 형식·범위(from>to), 지원하지 않는 값, 알 수 없는 항목. `details`에 항목별 이유 |
| 400 | `BAD_REQUEST` | 잘못된 JSON |
| 401 | `UNAUTHORIZED` | 로그인이 필요함 |
| 403 | `FORBIDDEN` | 허용되지 않은 출처 |
| 404 | `NOT_FOUND` | 없거나 **다른 가구의** 리소스 |
| 409 | `CONFLICT` | 충돌: 중복 장치 번호, 사용 중인 센서 삭제, 보호 대상이 이미 있음 |
| 413 | `BAD_REQUEST` | 요청 본문이 100KB를 넘음 |
| 429 | `RATE_LIMITED` | 시도 제한 (로그인 등) |
| 503 | `SERVICE_UNAVAILABLE` | DB에 연결할 수 없음 (`/health`) |
| 500 | `INTERNAL_ERROR` | 서버 오류. 항상 같은 일반 문구이며 `requestId`로 서버 로그와 대조 |

`requestId`는 문의할 때 알려 주세요.

## 목록 조회 규칙

- **페이지**: `limit`(기본·최대는 목록마다 다름)과 `cursor`. 응답 `meta.nextCursor`를 다음 요청의 `cursor`로 보냅니다(`hasMore`가 false면 마지막 쪽). 쪽을 넘겨도 빠짐·중복이 없습니다.
- **날짜 범위**: `from`·`to`(ISO 8601, 예 `2026-11-17T00:00:00+09:00`, 둘 다 포함). `from`이 `to`보다 늦으면 400.
- **정렬**: 이벤트는 `order=asc|desc`(발생 시각, 기본 `desc`), 센서는 `sort=createdAt|name|lastSeenAt` + `order`.
- 허용되지 않은 값(없는 구역, `limit=0`, 너무 큰 `limit` 등)은 400입니다.

## 엔드포인트

### `GET /health` (로그인 불필요)

```bash
curl -s http://localhost:4000/api/v1/health
```

```json
{ "data": { "status": "ok", "service": "tetris-server", "version": "0.1.0",
            "timestamp": "2026-11-17T07:38:56.000Z", "uptimeSeconds": 12, "checks": { "database": "up" } } }
```

DB에 닿지 못하면 정상 응답 대신 **503**(`SERVICE_UNAVAILABLE`, "데이터베이스에 연결할 수 없습니다.")을 돌려줍니다.

### `GET /dashboard/summary`

대시보드 한 화면에 필요한 데이터를 한 번에: `sensors`, `recentEvents`(최근 5건), `activeAlerts`(진행 중·확인함), `schedule`(모니터링 사용 여부·요일·야간 시간), `weekly`(최근 7일), `monitoringStartedAt`, `lastDataAt`. 하나라도 읽지 못하면 전체가 실패합니다(일부만 채운 응답이 "문제없음"처럼 보이지 않게). **웹 대시보드가 실제로 쓰는 v1 엔드포인트입니다.** ([FRONTEND_API.md](FRONTEND_API.md))

### Sensors

| 요청 | 설명 |
|---|---|
| `GET /sensors` | 목록. 쿼리 `zone` `origin` `enabled=true\|false` `sort` `order`. `meta.total`. (가구당 최대 20개라 페이지 없이 전체) |
| `POST /sensors` | 등록 → **201**. 장치 토큰 `deviceToken`은 이 응답에서 **한 번만** 보임 |
| `GET /sensors/:id` | 한 건 |
| `PATCH /sensors/:id` | 일부 수정: `name` `zone` `isActive` `sensitivity`(null=가구 기본) `deviceId`(null=지움) |
| `DELETE /sensors/:id` | 삭제. **먼저 `isActive=false`로 바꿔야 함**(아니면 409). 그 센서의 움직임 기록도 함께 삭제 |

```bash
curl -s -b cookies.txt -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -d '{"name":"복도","zone":"PATH","deviceId":"SN-0001"}' http://localhost:4000/api/v1/sensors
```

```json
{ "data": {
    "sensor": { "id": "cm…", "name": "복도", "kind": "MOTION", "zone": "PATH", "origin": "REAL",
                "isActive": true, "state": "PENDING", "lastSeenAt": null,
                "batteryPercent": null, "batteryLevel": "UNKNOWN", "firmwareVersion": null,
                "deviceId": "SN-0001", "sensitivity": null, "hardwareSensitivitySupported": false,
                "createdAt": "2026-11-17T07:38:56.523Z" },
    "deviceToken": "tsn_…" } }
```

- `zone`: `BED_SIDE`(침대 주변) · `PATH`(이동 경로) · `ENTRANCE`(현관). `deviceId`는 영문·숫자·`. _ : -` 100자 이내, 같은 가구 안에서 중복되면 409.
- `sensitivity`는 **서버가 신호를 해석하는 기준**이며, `hardwareSensitivitySupported`가 false면 센서 하드웨어의 감도는 바뀌지 않습니다.

### Events

| 요청 | 설명 |
|---|---|
| `GET /events` | 움직임 기록. 쿼리 `from` `to` `zone` `sensorId` `origin` `limit`(기본 50, 최대 200) `cursor` `order` |
| `GET /events/summary` | 날짜별 집계(한국 시간 날짜). 쿼리 `days`(1~31, 기본 7). `totals` 포함 |
| `GET /events/:id` | 한 건 |

```bash
curl -s -b cookies.txt "http://localhost:4000/api/v1/events?limit=1&order=desc&zone=ENTRANCE"
```

```json
{ "data": [ { "id": "cm…", "sensorId": "cm…", "sensorName": "현관문", "zone": "ENTRANCE",
              "origin": "REAL", "occurredAt": "2026-11-14T17:01:00.000Z",
              "receivedAt": "2026-11-14T17:01:00.000Z", "isLate": false } ],
  "meta": { "limit": 1, "nextCursor": null, "hasMore": false } }
```

이 목록에는 유형·심각도가 없습니다(원본 신호). 유형(`BED_EXIT_CANDIDATE` 등 — 받을 때 판단 엔진이 정해 저장, [DETECTION_RULES.md](DETECTION_RULES.md))과 주의 수준이 필요하면 기존 `/api/timeline`을 씁니다.

### Notifications

알림 센터의 알림입니다. **읽음은 "봤다"는 표시일 뿐 확인·종료(처리 상태)와 별개**입니다([NOTIFICATIONS.md](NOTIFICATIONS.md)).

| 요청 | 설명 |
|---|---|
| `GET /notifications` | 쿼리 `status`(쉼표로 여러 개) `type` `origin` `unread=true` `important=true` `limit`(기본 30) `cursor`. 항목에 보호자별 `read` 포함 |
| `PATCH /notifications/:id/read` | 읽음으로 표시(여러 번 해도 같음). 처리 상태는 바뀌지 않음. 바뀐 알림을 돌려줌 |
| `POST /notifications/read-all` | 모두 읽음 → `{ "data": { "updated": 3 } }` |

### Settings

| 요청 | 설명 |
|---|---|
| `GET /settings` | `{ timezone, detection, alerts }` |
| `PATCH /settings` | `{ "detection": {...일부}, "alerts": {...일부} }` 중 하나 이상. 지금 값에 덮어쓴 결과를 **전체 규칙으로 검증**한 뒤 **한 트랜잭션**으로 저장. 알 수 없는 항목이나 검증 실패면 아무것도 저장하지 않음(400) |

```bash
curl -s -X PATCH -b cookies.txt -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -d '{"detection":{"activeWeekdays":[0,2,4]},"alerts":{"lowBattery":false}}' \
  http://localhost:4000/api/v1/settings
```

```json
{ "data": {
    "timezone": "Asia/Seoul",
    "detection": { "monitoringEnabled": true, "activeWeekdays": [0, 2, 4],
                   "nightStart": "22:00", "nightEnd": "06:00", "sensitivity": "MEDIUM",
                   "sequenceWindowMinutes": 10, "cooldownMinutes": 10, "reminderMinutes": 5,
                   "offlineAfterSeconds": 300, "lowBatteryPercent": 20, "criticalBatteryPercent": 10,
                   "retentionDays": 90, "updatedAt": "2026-11-17T07:38:56.544Z" },
    "alerts": { "bedAreaActivity": true, "bedToPath": true, "entranceApproach": true,
                "repeatedMovement": true, "sensorIssues": true, "lowBattery": false,
                "updatedAt": "2026-11-17T07:38:56.545Z" } } }
```

- `detection.activeWeekdays`: 0=월 … 6=일. 야간 시간이 **시작되는 날** 기준입니다.
- `detection.monitoringEnabled=false`면 움직임은 기록되지만 움직임 알림은 만들어지지 않습니다. 저장하면 **다음 신호부터** 새 값으로 판단합니다(테스트가 확인).
- 시간대는 한국 표준시로 **고정**이라 바꿀 수 없습니다(`timezone` 읽기 전용).
- 잘못된 예: `{"detection":{"nightStart":"25:00"}}`(400), `{"detection":{"cooldownMinutes":9999}}`(400), `{"detection":{"nightColor":"x"}}`(알 수 없는 항목, 400), `{}`(400).

### Care Recipients

보호 대상. **별칭(`displayName`, 20자)만으로 등록**하고, 진단·의료 정보는 받지 않습니다(알 수 없는 항목은 400). 지금은 **가구마다 한 명**입니다.

| 요청 | 설명 |
|---|---|
| `GET /care-recipients` | 목록(0 또는 1건). `meta.total` |
| `POST /care-recipients` | `{ displayName, notes? }` → **201**. 이미 있으면 409 |
| `PATCH /care-recipients/:id` | `displayName`, `notes`(null 또는 빈 문자열이면 메모 지움). 바꿀 항목이 없으면 400 |

```json
{ "data": [ { "id": "cm…", "displayName": "어르신(테스트)", "notes": null,
              "createdAt": "2026-11-17T07:38:56.434Z", "updatedAt": "2026-11-17T07:38:56.434Z" } ],
  "meta": { "total": 1 } }
```

## 입력 검증 요약

| 항목 | 규칙 |
|---|---|
| 경로의 `:id` | 1~64자, 영문·숫자·`_`·`-`. 틀리면 400, 형식이 맞는데 없으면 404 |
| 센서 이름 | 1~50자(앞뒤 공백 제거) |
| 호칭(displayName) | 1~20자, 메모(notes) 200자 이내 |
| 시각 | `HH:mm`, 시작 ≠ 종료 |
| 숫자 | 항목별 범위(예: 중복 알림 간격 1~120분, 반복 감지 처리 시간 1~60분) |
| 날짜 | ISO 8601, `from ≤ to` |
| 본문 크기 | 100KB 이하 |
| 지원하지 않는 값 | 열거형(구역·민감도·정렬 등)에 없는 값은 400 |

## 기존 `/api` 경로와의 대응

| v1 | 기존(웹이 사용) |
|---|---|
| `GET /sensors` … | `GET /api/sensors` … (응답 형식만 `{data}`로 다름) |
| `GET /events` | `GET /api/events` (`order` 추가) |
| `GET /events/summary` | `GET /api/events/daily` (+`totals`) |
| `GET /notifications` … | `GET /api/alerts` … (`PATCH :id/read` ↔ `POST :id/read`) |
| `GET/PATCH /settings` | `GET/PUT /api/settings/detection`, `/alerts` (v1은 부분 수정·한 트랜잭션) |
| `/care-recipients` | `GET/PUT /api/household` (호칭·메모) |
| `GET /dashboard/summary` | 웹이 센서·이벤트·알림·설정을 모아 만들던 값을 서버가 한 번에 제공 (웹 대시보드는 이쪽을 씀) |

## 한계

- 알림의 확인·종료(`acknowledge`/`resolve`), 센서 토큰 재발급은 v1에 아직 없습니다(기존 `/api/alerts/:id/acknowledge`·`resolve`, `/api/sensors/:id/rotate-token` 사용).
- 센서 목록은 페이지를 나누지 않습니다(가구당 20개 제한).
- 응답에 낙관적 동시성 제어(ETag 등)는 없습니다. `PATCH /settings`는 저장 시점의 최신 값에 덮어쓰는 방식입니다.

## 비밀번호 변경 (`POST /api/auth/password`, 로그인 필요)

`{ currentPassword, newPassword }`(새 비밀번호 12자 이상, 현재와 달라야 함) → `{ ok: true, signedOutOtherSessions }`. 현재 비밀번호가 틀리면 **400**(401 이 아님 — 화면이 로그아웃되지 않게), 계속 틀리면 로그인과 같은 기준(15분에 5회)으로 429. 성공하면 **이 기기를 뺀 같은 보호자의 다른 세션을 모두 끊습니다.**

## 시스템 (`/api/system`, 로그인 필요, 응답은 저장하지 않음)

| 요청 | 설명 |
|---|---|
| `GET /api/system/features` | 서버가 켠 기능(`simulatorEnabled`) |
| `GET /api/system/integrations` | 알림 채널별 연동 상태(`REAL`·`MOCK`·`NOT_CONFIGURED`)와 마지막 성공 시각. 채널: `IN_APP` `WEB_PUSH` `WATCH` `SMS` `KAKAO` |
| `GET /api/system/channel-support` | 채널별 구현 여부(`implemented`)·설명, 스마트워치 플랫폼별 아직 필요한 작업. 구현되지 않은 채널을 "동작함"으로 표시하지 않는 근거 |
| `GET /api/alerts/:id/clips` | 알림에 붙은 영상 목록(시연용 웹캠). 다른 가구의 알림이면 404. `{ clips: [{ id, alertId, mimeType, sizeBytes, durationMs, createdAt, url }] }` |
| `GET /api/alerts/:id/clips/:clipId` | 영상 내용(`video/webm`·`video/mp4`). 로그인한 같은 가구만, `Cache-Control: private, no-store` |
| `POST /api/dev/simulator/alerts/:id/clips?durationMs=` | (시뮬레이터가 켜진 서버만) 본문 = 영상 그대로. 시뮬레이션 알림에만, 6MB·알림당 5개까지. 415 형식, 413 크기, 409 개수·실제 알림 |
| `GET /api/system/backup` | 자동 DB 백업 상태(`enabled`, `lastSuccessAt`, `lastRunFailed`, `backupCount` 등). `BACKUP_DIR` 를 지정하지 않으면 `enabled: false`. 폴더 경로·오류 상세는 담지 않음 |
| `GET /api/system/sensor-adapters` | 센서 어댑터 상태(`state`, `realHardwareConnected`, 오류 수 등). 실제 하드웨어는 `NOT_CONFIGURED` |

사용자용 API 전체에는 접속자(IP)별 요청 제한(`API_RATE_LIMIT_PER_MINUTE`, 기본 1200/분)이 있고 초과하면 `429 RATE_LIMITED` + `Retry-After` 입니다. `/api/health` 와 장치 수집 API(`/api/ingest`, 센서별 제한이 따로 있음)는 제외입니다.
