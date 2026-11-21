# 장치 수집 계약 v1

센서(또는 시뮬레이터)가 서버에 움직임 신호와 상태를 보내는 방법입니다. 실제 하드웨어와 시뮬레이터는 **같은 API**를 씁니다.
스키마의 원본은 [`packages/shared/src/ingest.ts`](../packages/shared/src/ingest.ts)이며, 서버와 시뮬레이터가 그 파일을 함께 사용합니다.

## 한눈에 보기

| 항목 | 값 |
|---|---|
| 기본 주소 | `http://<서버>:4000` (개발) |
| 인증 | `Authorization: Bearer <장치 토큰>` |
| 형식 | `Content-Type: application/json`, 응답도 JSON |
| 이벤트 전송 | `POST /api/ingest/v1/events` |
| 상태 신호 | `POST /api/ingest/v1/heartbeat` (60초마다 권장) |

## 센서 등록과 장치 토큰

1. 보호자가 앱에서 센서를 등록합니다. (이름 + 구역: 침대 주변 / 이동 경로 / 현관) `POST /api/sensors`
2. 응답의 `deviceToken`(`tsn_...`)을 **그 자리에서 한 번만** 볼 수 있습니다. 서버에는 해시만 저장되므로 다시 볼 수 없습니다.
3. 장치에 토큰을 넣습니다. 분실하면 앱에서 **토큰 재발급**을 합니다. 이전 토큰은 즉시 무효가 됩니다.

- **구역은 장치가 보내지 않습니다.** 서버가 센서 등록 정보로 정하므로, 설치 위치를 바꿀 때는 앱에서 구역만 바꾸면 됩니다. 이미 저장된 기록의 구역은 바뀌지 않습니다.
- 센서를 앱에서 "사용 안 함"으로 끄면 장치의 요청은 `403`으로 거부되고 아무것도 저장되지 않습니다.
- 토큰은 비밀번호와 같습니다. 코드 저장소, 로그, 화면 공유에 노출하지 마세요.

## 이벤트 전송

```http
POST /api/ingest/v1/events
Authorization: Bearer tsn_...
Content-Type: application/json

{
  "events": [
    { "eventId": "6f1c2a3e-9d4b-4c8e-a1f0-3b7d5e9c2a10", "type": "MOTION", "occurredAt": "2026-11-14T02:14:03+09:00" }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `eventId` | 장치가 만드는 고유 ID. 8~64자, 영문·숫자·`-`·`_`. UUID를 권장합니다. **센서 안에서** 유일하면 됩니다. |
| `type` | 현재는 `MOTION`(움직임 감지)만 있습니다. |
| `occurredAt` | 발생 시각(ISO 8601, 시간대 오프셋 허용). **생략 가능**: 시계가 없는 장치는 생략하면 서버가 받은 시각을 씁니다. |
| `events` | 한 번에 1~100건. 오프라인이었다가 한꺼번에 보낼 때 씁니다. |

### 응답

```json
{
  "serverTime": "2026-11-13T17:14:03.512Z",
  "results": [
    { "eventId": "6f1c2a3e-9d4b-4c8e-a1f0-3b7d5e9c2a10", "status": "ACCEPTED" }
  ]
}
```

`results`는 요청한 순서와 같고, 건별 결과는 다음 중 하나입니다.

| status | 뜻 | 장치가 할 일 |
|---|---|---|
| `ACCEPTED` | 저장됨 | 보관 중인 이벤트를 지웁니다. |
| `DUPLICATE` | 이미 받은 이벤트 | 지웁니다. 다시 보내도 한 번만 저장됩니다. |
| `REJECTED` + `reason` | 영구 거부. 다시 보내도 같은 결과 | 지웁니다(재시도 금지). |

`reason`: `FUTURE_TIMESTAMP`(서버 시각보다 1분 넘게 미래), `TOO_OLD`(24시간보다 오래됨), `TYPE_MISMATCH`(센서가 지원하지 않는 종류).

`serverTime`으로 장치 시계를 맞출 수 있습니다. 시계가 틀린 장치는 `occurredAt`을 생략하는 편이 안전합니다.

### 중복 전송과 재시도

- 네트워크 오류, 타임아웃, `5xx`, `429`면 **같은 `eventId` 그대로** 다시 보내세요. 이미 저장된 이벤트는 `DUPLICATE`가 되므로 중복 저장되지 않습니다. (동시에 같은 요청이 여러 번 도착해도 한 번만 저장됩니다.)
- `429`는 `Retry-After`(초) 헤더만큼 기다렸다가 보냅니다.
- `4xx`(`429` 제외)는 요청 자체의 문제이므로 같은 내용을 다시 보내도 소용없습니다.

### 늦게 도착한 이벤트

발생 시각이 받은 시각보다 **2분 이상** 앞서면 `isLate`(지연 수신)로 표시해 저장합니다. 버리지 않습니다. 화면과 알림에는 "n분 전 발생, 지연 수신"으로 보입니다.

## 상태 신호 (heartbeat)

```http
POST /api/ingest/v1/heartbeat
Authorization: Bearer tsn_...
Content-Type: application/json

{ "batteryPercent": 78, "firmware": "0.1.0" }
```

- 두 항목 모두 선택입니다. 본문 없이(`{}`) 보내도 됩니다. `batteryPercent`는 0~100 정수, `firmware`는 32자 이하.
- 응답: `{ "serverTime": "..." }`
- **이벤트 요청도 "살아 있다"는 신호로 인정**합니다. 움직임이 자주 있는 센서는 heartbeat를 덜 보내도 되지만, 움직임이 없는 밤에도 연결 상태를 알 수 있도록 **60초마다 heartbeat를 보내는 것을 권장**합니다.
- 보호자가 정한 시간(기본 5분) 동안 아무 신호도 없으면 앱에서 센서가 "연결 끊김"으로 표시됩니다. 첫 신호를 받기 전에는 "첫 신호 대기 중"이며, 정상으로 표시하지 않습니다.
- 배터리가 보호자가 정한 기준(기본 20% 부족, 10% 위급) 아래로 내려가면 앱에 경고가 표시됩니다.

## 오류 응답

모든 오류는 같은 형식입니다.

```json
{ "error": { "code": "UNAUTHORIZED", "message": "장치 토큰이 없거나 올바르지 않습니다.", "requestId": "..." } }
```

| 상태 | code | 원인 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 요청 형식 오류 (이벤트 0건/101건 이상, 잘못된 ID·시각, 배터리 범위 등). 아무것도 저장되지 않습니다. |
| 401 | `UNAUTHORIZED` | 토큰이 없거나 틀림. 재발급되어 옛 토큰이 된 경우 포함. `WWW-Authenticate: Bearer` 헤더가 붙습니다. |
| 403 | `FORBIDDEN` | 센서가 "사용 안 함"으로 꺼져 있음 |
| 429 | `RATE_LIMITED` | 요청이 너무 많음. `Retry-After` 헤더 참고 |
| 5xx | | 서버 문제. 같은 요청을 다시 보내세요. |

## 제한

| 항목 | 값 |
|---|---|
| 한 요청의 이벤트 수 | 1~100건 |
| 센서당 요청 수 | 분당 120회 (heartbeat 포함) |
| 이벤트 발생 시각 허용 범위 | 서버 시각 기준 −24시간 ~ +1분 |
| 지연 수신 표시 기준 | 발생 후 2분 이상 |
| 요청 본문 크기 | 100KB |

잘못된 토큰은 IP로 차단하지 않고 거부만 합니다. 토큰이 256비트 무작위 값이라 추측이 불가능하고, 같은 공유기 뒤의 정상 센서가 함께 막히는 일을 피하기 위해서입니다. 실패는 서버 로그에 IP와 함께 남습니다.

## 시험해 보기 (시뮬레이터 CLI)

앱에서 센서를 등록해 받은 토큰을 환경변수로 지정합니다. (`--token` 옵션은 셸 기록에 남으므로 권장하지 않습니다.)

```bash
export TETRIS_DEVICE_TOKEN=tsn_...        # 앱에서 한 번 보여 준 토큰
npm run sim -- heartbeat --battery 80
npm run sim -- event
npm run sim -- event --id my-test-event-0001    # 같은 ID로 두 번 보내 DUPLICATE 확인
npm run sim -- event --count 5 --at 2026-11-14T02:14:03+09:00
```

curl로 직접 보낼 수도 있습니다.

```bash
curl -s -X POST http://127.0.0.1:4000/api/ingest/v1/events \
  -H "Authorization: Bearer $TETRIS_DEVICE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"events":[{"eventId":"curl-test-0001","type":"MOTION"}]}'
```

## 확장 (이후 단계)

- 센서 종류가 늘어나면(`DOOR`, `BED_PRESSURE`, `WEARABLE`) `type`과 `SensorKind`에 추가합니다. 종류가 다른 이벤트는 `TYPE_MISMATCH`로 거부됩니다.
- HTTP 외의 수집 경로(MQTT 등)는 `SensorAdapter` 구현으로 붙이고, 어댑터가 만든 표준 이벤트는 `SensorEventGateway` 를 거쳐 같은 `IngestService` 로 들어옵니다. ([HARDWARE_INTEGRATION.md](HARDWARE_INTEGRATION.md) — 실제 하드웨어 어댑터는 아직 없음)
- 규칙 엔진과 실시간 발행(Phase 3)은 서버 안의 `IngestService.onEventsAccepted` 훅에 연결됩니다. 장치 계약은 바뀌지 않습니다.
