# 운영 가이드

노크를 한 대의 서버(홈서버·소형 VM)에서 상시 운영하기 위한 안내입니다. 개발 방법은 [README](../README.md)를 보세요.

> **먼저 읽어 주세요.** 이 서비스는 센서의 움직임 신호를 보호자에게 알려 주는 **보조 도구**입니다. 넘어짐이나 외출 같은 상황을 판단하거나 막아 주지 않고, 센서가 놓치는 움직임도 있습니다. 푸시를 설정하지 않았다면 앱 화면을 닫아 둔 보호자는 알림을 받을 수 없습니다. 실제 돌봄 현장에서 쓰기 전에는 앱의 **서비스 안내와 한계(`/notice`)** 화면을 모든 보호자에게 보여 주고, 아래 "운영 전 확인" 목록을 **실제 기기로** 확인해 주세요.

## 1. 구성

```
브라우저 ──HTTPS──▶ 리버스 프록시 (Caddy / nginx)
                     ├─ /            → 웹 정적 파일 (apps/web/dist)
                     └─ /api, /socket.io → Node 서버 (127.0.0.1:4000) ──▶ SQLite 파일
센서 ───HTTPS(장치 토큰)──▶ 같은 프록시의 /api/ingest/v1/...
```

- **서버는 1대, 가구는 1개**를 기준으로 만들었습니다. 알림 처리 순서(`KeyedQueue`)가 프로세스 안에서만 보장되므로 서버를 여러 대로 늘리면 안 됩니다.
- 서버는 웹 파일을 직접 내보내지 않습니다. 프록시가 `apps/web/dist`를 서비스하고 `/api`·`/socket.io`만 서버로 넘깁니다. (웹과 API가 **같은 출처**여야 쿠키·실시간 연결 검사가 맞습니다.)
- 푸시(서비스 워커)와 브라우저 알림은 **HTTPS에서만** 동작합니다. 운영은 반드시 HTTPS로 하세요.

## 2. 요구 사항

| 항목 | 값 |
|---|---|
| Node.js | 24.15 이상 (`.nvmrc` 24). 26.8로 개발·검증했습니다 |
| npm | 10 이상 |
| 메모리 | 여유 512MB 이상 권장 (비밀번호 해시가 로그인마다 약 32MB를 잠깐 씁니다) |
| 디스크 | 움직임 기록은 보관 기간(기본 90일)이 지나면 자동으로 지워져 계속 늘어나지는 않습니다. 용량은 따로 측정하지 않았으니 운영하면서 DB 파일 크기를 확인하세요 |

## 3. 설치와 실행

```bash
git clone <저장소> /srv/tetris && cd /srv/tetris
npm ci                       # 의존성 설치 (Prisma 클라이언트도 생성)
npm run build                # 서버 번들 + 웹 빌드 + 번들 검사(비밀값·Mock 포함 여부)
NODE_ENV=production npm run db:deploy   # DB 파일 생성 + 마이그레이션
```

- **시드(`db:seed`)는 운영에서 실행되지 않습니다.** 첫 계정은 웹 화면의 "첫 계정 만들기"로 만듭니다. 서버에 보호자가 한 명도 없을 때만 열리고, 만들고 나면 닫힙니다. **서비스를 인터넷에 열기 전에 먼저 본인이 첫 계정을 만들어 두세요.**
- 비밀번호는 12자 이상이어야 합니다.

### 환경변수

`.env.example`을 복사해 `/etc/tetris/tetris.env` 같은 곳에 두고 **권한을 600**으로 합니다. (`chmod 600`)

| 변수 | 운영 값 | 설명 |
|---|---|---|
| `NODE_ENV` | `production` | 시뮬레이터·세션 쿠키 Secure 기본값이 운영에 맞게 바뀝니다 |
| `SERVER_HOST` | `127.0.0.1` | 프록시만 접근하게 합니다. 외부에 직접 열지 마세요 |
| `SERVER_PORT` | `4000` | |
| `CLIENT_ORIGIN` | `https://서비스주소` | **실제 웹 주소와 정확히 같아야 합니다.** 다르면 실시간 연결과 쓰기 요청이 거부됩니다 |
| `DATABASE_URL` | `file:/var/lib/tetris/tetris.db` | 절대 경로를 권장합니다 (상대 경로는 `apps/server` 기준) |
| `TRUST_PROXY` | `1` | 앞단 프록시가 1단이면 1. **실제 단계 수만** 쓰세요 (아래) |
| `COOKIE_SECURE` | (비움) | 운영에서는 자동으로 켜집니다. HTTPS 없이 시험할 때만 `false` |
| `SIMULATOR_ENABLED` | (비움) | 운영에서는 꺼집니다. **운영에서는 켜지 마세요** |
| `BACKUP_DIR` | (선택, 권장) | 자동 백업 폴더. 지정해야 서버가 백업합니다. 다른 디스크·기기 권장. 아래 6절 |
| `BACKUP_INTERVAL_HOURS` | `24` | 자동 백업 간격(1~168시간) |
| `BACKUP_KEEP` | `7` | 남겨 둘 백업 수(1~365) |
| `HEARTBEAT_PING_URL` | (권장, 선택) | 외부 감시 주소(https). 서버가 건강할 때만 이 주소로 GET 신호를 보냄. 아래 "서버 정지 감시" |
| `HEARTBEAT_PING_INTERVAL_SECONDS` | `60` | 신호 간격(10~3600초) |
| `API_RATE_LIMIT_PER_MINUTE` | `1200` | 접속자(IP) 한 곳이 1분에 보낼 수 있는 사용자용 API 요청 수. 초과하면 429. `0` 이면 제한 없음. 상태 점검·장치 수집 API 는 제외. 프록시 뒤에서는 `TRUST_PROXY` 가 맞아야 접속자별로 센다 |
| `LOG_LEVEL` | `info` | |
| `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | (선택) | 브라우저 푸시. 세 값 모두 또는 모두 비움 |
| `VITE_*` | 비움 | 웹 빌드 때만 쓰이며 브라우저에 공개됩니다. 비밀값을 넣지 마세요. `VITE_MOCK_FEATURES` 또는 `VITE_APP_MODE=demo`가 있으면 운영 빌드가 실패합니다 |

#### TRUST_PROXY가 왜 중요한가

로그인 시도 제한(IP + 이메일당 15분에 5회)은 접속자 IP로 셉니다. 프록시 뒤에서 `TRUST_PROXY`를 0으로 두면 모든 접속자가 프록시 주소 하나로 보여, 누군가 한 계정에 틀린 비밀번호를 반복하면 **정상 보호자의 로그인도 막힙니다.** 반대로 실제보다 큰 값을 주면 접속자가 `X-Forwarded-For`를 속여 시도 제한을 피할 수 있습니다. 프록시가 한 단계면 `1`입니다. (두 동작 모두 서버 테스트가 검증합니다: `security.test.ts`)

### 푸시(선택)

```bash
npm run vapid:generate      # 출력된 세 줄을 환경 파일에 넣고 VAPID_SUBJECT 를 운영자 연락처로 바꿉니다
```

`VAPID_PRIVATE_KEY`는 비밀값입니다. 저장소에 올리거나 메신저로 보내지 마세요. **키를 바꾸면 보호자가 등록한 기기가 모두 무효가 되어 다시 등록해야 합니다.** 푸시를 켜도 휴대폰이 꺼져 있거나 푸시 서비스에 닿지 못하면 전달되지 않을 수 있고, iPhone·iPad는 홈 화면에 추가한 웹앱에서만 받을 수 있습니다.

### 서버 정지 감시 (외부 감시 신호)

서버(또는 집 네트워크)가 멈추면 **서버가 보내는 푸시·화면 알림도 모두 멈춥니다.** 화면은 "연결 끊김"을 알리지만 화면을 보고 있지 않으면 알 수 없으므로, **서버 밖에서** 서버의 정지를 알려 줄 장치가 필요합니다.

1. 외부 감시 서비스(Healthchecks.io, 직접 운영하는 Uptime Kuma 의 "Push" 모니터 등)에서 **"주기적으로 신호가 와야 하는" 체크**를 만들고 간격(예: 5분)과 알림 수단(문자·이메일·메신저)을 정합니다.
2. 발급된 ping 주소를 `HEARTBEAT_PING_URL`(https)에 넣고 서버를 다시 시작합니다.
3. 서버는 **건강할 때만**(DB 를 읽을 수 있고, 센서 연결을 점검하는 주기 점검이 최근 90초 안에 돌았을 때) 간격마다 GET 한 번을 보냅니다. 건강하지 않으면 보내지 않아 외부 서비스가 경고합니다. 신호에는 가구·센서·알림 정보가 없고, 로그에는 주소의 토큰 대신 호스트만 남습니다.
4. **꼭 시험하세요:** 서버를 멈추고 외부 서비스가 실제로 알려 주는지 확인합니다. 이 저장소는 신호를 보내는 쪽만 만들었고(자동 시험 완료), **외부 서비스가 알림을 받는 경로는 운영자가 구성하고 확인해야 합니다.** 서버를 둔 집 인터넷이 끊기면 신호도 끊기므로 그 경우도 같이 감지됩니다.

## 4. 리버스 프록시 예 (Caddy)

> 아래는 **예시**입니다. 이 문서를 쓰는 환경에서 Caddy로 실행해 보지는 않았습니다. 다만 `Content-Security-Policy` 값은 `apps/web/csp.ts`와 같으며, 이 정책으로 운영 빌드가 정상 동작하는지(위반 0건, 실시간 연결·서비스 워커 포함)는 E2E(`e2e/tests/csp.spec.ts`)가 확인합니다.

```caddyfile
tetris.example.com {
  encode zstd gzip

  header {
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
  }

  handle /api/* {
    reverse_proxy 127.0.0.1:4000
  }
  handle /socket.io/* {
    reverse_proxy 127.0.0.1:4000     # WebSocket 도 함께 넘어갑니다
  }
  handle {
    root * /srv/tetris/apps/web/dist
    # 서비스 워커와 진입 문서는 항상 최신을 받게 한다. 해시가 붙은 assets 는 오래 캐시해도 된다.
    @fresh path /sw.js /index.html /
    header @fresh Cache-Control "no-cache"
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
    try_files {path} /index.html
    file_server
  }
}
```

- 서버가 `Origin`을 검사하므로 프록시가 `Host`·`Origin` 헤더를 바꾸지 않게 하세요. (Caddy 기본 동작)
- 서버의 `helmet`이 API 응답에 보안 헤더를 붙이므로 API에는 CSP를 따로 주지 않아도 됩니다.
- 센서(장치)는 같은 주소의 `/api/ingest/v1/...`로 보냅니다. 장치마다 토큰이 달라서 프록시에서 따로 인증하지 않아도 됩니다. 서버가 센서당 분당 120건으로 제한합니다.

## 5. 프로세스 관리 (systemd 예)

```ini
# /etc/systemd/system/tetris.service
[Unit]
Description=Tetris server
After=network.target

[Service]
User=tetris
WorkingDirectory=/srv/tetris/apps/server
EnvironmentFile=/etc/tetris/tetris.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=3
# 종료 신호(SIGTERM)를 받으면 연결을 정리하고 10초 안에 끝납니다.
TimeoutStopSec=15
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/tetris
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`ExecStart`에서 `.env` 파일을 직접 읽지 않고 `EnvironmentFile`로 주입합니다. (`npm start`는 개발용 `.env`를 읽는 방식이라 서비스로는 위처럼 `node dist/main.js`를 직접 실행하는 편이 낫습니다.) 서버가 비정상 종료하면 systemd가 다시 시작합니다. 다시 시작해도 알림 재시도·재알림 대기 상태는 DB에 있으므로 이어집니다.

## 6. 백업과 복구

데이터는 SQLite 파일 하나(`DATABASE_URL`)에 있습니다. 보호자 계정, 센서 정보(장치 토큰은 해시만), 움직임 기록, 알림, 푸시 구독 정보가 들어 있으므로 **백업도 개인정보로 다루세요.** (파일 권한 600, 암호화된 저장소 권장)

```bash
# 서버를 멈추지 않고 일관된 복사본 만들기 (sqlite3 CLI 필요)
sqlite3 /var/lib/tetris/tetris.db ".backup '/var/backups/tetris/tetris-$(date +%F).db'"
```

### 자동 백업 (서버 내장, 선택)

`BACKUP_DIR` 를 지정하면 서버가 직접 백업합니다. 지정하지 않으면 **서버는 백업하지 않습니다**(위 `sqlite3` 명령이나 다른 도구로 직접 해야 합니다).

- 방식: SQLite `VACUUM INTO` 로 서버가 쓰는 도중에도 일관된 사본을 만들고, **만든 직후 읽기 전용으로 다시 열어 무결성 검사(`integrity_check`)를 통과한 것만** `tetris-YYYYMMDD-HHMMSS.db`(UTC)로 남깁니다. 실패하면 임시 파일을 지우고, 이전 백업은 그대로 둡니다(오래된 것도 지우지 않습니다).
- 간격은 `BACKUP_INTERVAL_HOURS`(기본 24), 보관 수는 `BACKUP_KEEP`(기본 7)입니다. 1시간마다 "때가 되었는지"만 확인하며, **서버를 다시 시작해도 마지막 백업이 간격 안이면 새로 만들지 않아** 재시작이 잦아도 좋은 백업이 밀려나지 않습니다.
- 파일은 600, 폴더는 700 으로 만듭니다. 지우는 것은 이 서비스가 만든 이름 형식의 파일뿐이며, 같은 폴더의 다른 파일은 건드리지 않습니다.
- 상태는 설정 → 데이터 관리의 "자동 백업"(`GET /api/system/backup`)에 나옵니다. 꺼져 있음·아직 없음·가장 최근 실패·간격의 2배보다 오래됨을 정상처럼 보이지 않게 따로 알립니다. 폴더 경로와 오류 상세는 화면에 내보내지 않으며, 이유는 서버 기록에서 봅니다.
- **한계:** 같은 디스크에 두면 디스크 고장에는 소용없습니다. `BACKUP_DIR` 를 **다른 디스크·기기로 마운트**하거나 이 폴더를 다른 곳으로 동기화하세요. 서버가 만든 사본이 밖으로 나갔는지는 서버가 알 수 없고 확인하지 않습니다. 복구 연습(아래)은 직접 해야 합니다.

- 직접 백업을 한다면 매일 한 번, 최근 7일치만 두는 정도면 충분합니다. 움직임 기록은 어차피 보관 기간(기본 90일)이 지나면 자동으로 지워집니다.
- **백업이 쓸 수 있는지 먼저 점검하세요.** 읽기 전용이라 파일을 바꾸지 않고 서버를 멈출 필요도 없습니다.

  ```bash
  npm run backup:verify -w @tetris/server -- /var/backups/tetris/tetris-20261118-030000.db
  ```

  무결성 검사, 테이블별 행 수, 현재 코드와의 스키마(마이그레이션) 차이를 보여 줍니다. 파일이 없거나 SQLite 가 아니거나 손상되었으면 종료 코드 1 로 실패합니다. 백업이 현재 코드보다 **오래된** 스키마면 복구 뒤 `npm run db:deploy` 로 맞추면 되고, **더 새로운** 스키마면 경고합니다(코드를 맞춘 뒤 복구). 이것은 파일 상태 점검이며 실제 복구를 대신하지 않습니다.
- **복구 연습을 한 번은 해 보세요.** 서버를 멈추고 백업 파일을 `DATABASE_URL` 위치로 복사한 뒤 시작하면 됩니다. (`-wal`, `-shm` 파일이 남아 있으면 함께 지웁니다)
- 파일을 그냥 `cp`로 복사하면 쓰는 도중의 불완전한 파일이 될 수 있습니다. 위 `.backup`을 쓰세요.

## 7. 업그레이드

```bash
# 1) 백업 (위)  2) 코드 받기  3) 설치·빌드  4) 마이그레이션  5) 재시작
cd /srv/tetris && git pull
npm ci && npm run build
NODE_ENV=production npm run db:deploy
sudo systemctl restart tetris
```

마이그레이션은 앞으로만 진행합니다. 문제가 생기면 이전 코드로 되돌리고 **백업에서 DB를 복구**하세요. (스키마를 되돌리는 마이그레이션은 만들지 않았습니다.)

## 8. 점검

| 무엇을 | 어떻게 |
|---|---|
| 서버 상태 | `GET /api/health` — DB까지 확인하며, 문제가 있으면 503입니다. 프록시·모니터링 도구가 이 주소를 확인하게 하세요 |
| 센서 | 앱의 홈 상단 띠와 센서 화면. 신호가 설정한 시간(기본 5분) 없으면 "연결 끊김"과 알림이 생깁니다 |
| 알림이 전달되는지 | 설정 → 알림 채널의 **테스트 보내기**. 채널별 마지막 전달 성공 시각도 보입니다 |
| 전달 실패 | 홈 상단 띠의 "알림 전달 실패"와 알림 상세의 전달 결과 |
| 로그 | JSON 한 줄 로그(pino). 요청마다 `requestId`가 있고, 오류 응답의 `requestId`로 로그를 찾을 수 있습니다. 비밀번호·토큰·쿠키·푸시 키는 로그에서 가려집니다 |

로그는 `journalctl -u tetris`로 봅니다. 알림·센서 상태 경고가 보호자 화면에 나타나는지가 가장 중요한 점검입니다. 서버가 살아 있어도 센서나 알림 전달이 막혀 있을 수 있기 때문입니다.

## 9. 운영 전 확인 (체크리스트)

- [ ] HTTPS로만 접속되고 `CLIENT_ORIGIN`이 실제 주소와 같다
- [ ] `SIMULATOR_ENABLED`가 꺼져 있다 (`/api/dev/simulator/state`가 404)
- [ ] 첫 계정을 만들었고 비밀번호가 12자 이상의 긴 값이다. 시드를 실행하지 않았다
- [ ] 환경 파일 권한이 600이고, 서버 포트(4000)가 외부에 직접 열려 있지 않다
- [ ] `TRUST_PROXY`가 실제 프록시 단계 수와 같다
- [ ] 센서를 등록하고 **실제 센서**가 신호를 보내는 것을 확인했다 (상태가 "연결됨")
- [ ] **푸시를 쓴다면 실제 휴대폰에서** 테스트 알림이 도착하는 것을 확인했다. 화면을 닫은 상태·잠금 상태에서도 확인했다
- [ ] 푸시를 쓰지 않는다면, 화면을 닫아 두면 알림을 받을 수 없다는 사실을 모든 보호자가 알고 있다 (홈에 항상 표시됩니다)
- [ ] 보호자 모두가 `/notice`(서비스 안내와 한계)를 읽었다
- [ ] 백업이 돌고 복구를 한 번 해 보았다
- [ ] 센서 하나를 일부러 끄고, 설정한 시간 뒤 "연결 끊김"이 화면에 나타나는지 확인했다
- [ ] 야간 시간대·민감도를 실제 환경에 맞게 조정했다 (기준값은 초기값이며 현장에서 맞춰야 합니다)

## 10. 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 로그인이 계속 막힘(429) | 같은 IP·이메일로 15분에 5번 실패. 15분 기다립니다. 프록시 뒤인데 `TRUST_PROXY`를 0으로 둔 것은 아닌지 확인하세요 |
| 화면은 열리는데 "실시간 연결 실패" | `CLIENT_ORIGIN`이 실제 주소와 다름, 또는 프록시가 `/socket.io`를 WebSocket으로 넘기지 않음 |
| 저장·확인 버튼이 403 | `CLIENT_ORIGIN`과 다른 주소로 접속 중이거나 프록시가 `Origin`/`Host`를 바꿈 |
| 센서가 "첫 신호 대기 중"에서 안 바뀜 | 장치 토큰이 틀리거나 장치가 서버에 닿지 못함. 센서 상세에서 토큰을 다시 발급해 장치에 입력 |
| 푸시 등록 후 알림이 안 옴 | 설정 → 알림 채널에서 테스트 보내기로 이유를 확인. "만료"면 기기를 다시 등록, "요청을 받지 않았습니다"면 서버가 푸시 서비스에 닿는지(방화벽·DNS) 확인 |
| 푸시 키를 바꾼 뒤 모두 안 옴 | 정상입니다. 기존 구독이 무효가 되어 보호자가 다시 등록해야 합니다 |
| 서버가 시작하지 않음 | 환경변수 오류는 시작 때 한국어로 이유를 알려 줍니다. `VAPID_*`는 세 값 모두 또는 모두 비워야 합니다 |

## 11. 알려진 한계 (운영 관점)

- 서버 1대·SQLite 파일 1개·가구 1개 기준입니다. 보호자 계정 추가, 비밀번호 재설정, 다중 가구는 이 버전에 없습니다. 비밀번호는 설정 → 비밀번호 변경에서 바꿀 수 있지만(현재 비밀번호 확인, 다른 기기 로그아웃), **잊어버렸을 때의 재설정은 없어서** 첫 계정의 비밀번호를 잃으면 DB를 직접 다뤄야 합니다.
- 문자·카카오는 연동하지 않았습니다. 앱 화면 알림은 화면이 열려 있을 때만, 푸시는 설정하고 기기를 등록한 경우에만 전달됩니다.
- 푸시는 **실제 푸시 서비스(FCM·Mozilla·Apple)로 보내 기기에 도착하는 것까지는 개발 환경에서 확인하지 못했습니다.** 운영 전에 반드시 실제 기기로 확인하세요.
- 푸시 서비스 주소가 나중에 서버 내부 IP로 바뀌는 DNS 재바인딩은 막지 못합니다. (https 도메인만 받고 IP·localhost·사설 이름은 거부합니다)
- 규칙 기준값은 시뮬레이터로 맞춘 초기값입니다. 현장의 센서 위치·생활 패턴에 맞는 조정과 검증이 필요합니다.
- 접근성은 자동 점검(axe)과 키보드 점검으로 확인했습니다. 실제 스크린리더(VoiceOver 등)로 읽어 보는 점검은 사람이 따로 해야 합니다.
