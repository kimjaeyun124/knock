# 노크 디자인 시스템

> 웹(`apps/web`)의 색·글자·간격 토큰과 공통 컴포넌트를 한곳에 정리한 문서. 화면을 만들거나 고치기 전에 먼저 읽는다.
> 실제 모습은 개발 서버의 **`/dev/design`**(로그인 필요)에서 모든 종류와 상태를 볼 수 있다.

## 1. 방향

| 키워드 | 이 프로젝트에서의 뜻 |
|---|---|
| Calm | 맑은 라벤더빛 바탕, 테두리 없는 흰 카드, 그림자는 떠 있는 것(대화상자·말풍선)에만. 그라데이션·유리(blur) 효과 없음. |
| Safe | 위험한 동작은 한 번 더 확인(`AlertDialog`), 처리 중에는 중복 입력 차단, 실패는 숨기지 않고 글자로 알림. |
| Clear | 화면마다 제목(h1) 하나, 가장 중요한 상태는 크게(`StatusIndicator size="lg"`, `text-display`). |
| Accessible | 키보드 완주, 3px 초점 선, WCAG AA 대비, 터치 44px 이상, 색만으로 전달하지 않음. |
| Minimal | 컴포넌트는 20여 개, 변형은 `variant`·`size` 두 축만. 자체 UI 프레임워크를 만들지 않는다. |
| Trustworthy | 의료기관처럼 보이지 않는 맑은 라벤더빛 + 인디고, 상태는 사실만("정상"·"확인 필요"), 단정하는 표현 금지(`COPY_GUIDE.md`). |

## 노크의 디자인 언어 (v2)

이름을 **노크**로 바꾸면서 디자인을 새로 잡았다. 토큰 이름과 컴포넌트 구조는 그대로 두고 값과 모양을 바꿨기 때문에 화면 코드는 거의 건드리지 않았다.

- **콘셉트:** "문을 두드리듯 가볍게 건네는 야간 안부." 맑고 조용하며, 의료 기기처럼 보이지 않는다. 테두리 대신 여백과 면으로 구분한다.
- **마크:** 아치형 문 + 문고리(노크 노랑 `accent`) + 두드리는 소리를 뜻하는 두 줄의 호. 문과 호는 `brand`(인디고), 문고리만 `accent`. `components/layout/Logo.tsx`
- **색:** 라벤더빛 바탕(`canvas` `#F5F4FA`) 위의 흰 카드(테두리 없음)와 인디고(`brand`). 상태색(초록·호박·빨강)은 브랜드색과 겹치지 않게 인디고 계열을 쓰지 않는다. **노크 노랑(`accent`)은 장식 전용**이라 글자나 상태 표시에는 쓰지 않는다. 어두운 테마는 짙은 남색 밤(`#0F0E1F`) + 연한 인디고.
- **모양:** 버튼은 알약(`rounded-full`), 입력 칸은 16px, 카드·대화상자는 24px. 카드와 안내 상자(`Callout`)는 테두리가 없고(위험 안내와 긴급 상태만 얇은/굵은 테두리), 안내 상자·대시보드 상태 카드는 아이콘을 흰 원 위에 둔다. 대시보드 상태 카드에는 두드리는 소리의 물결(장식)이 깔린다.
- **내비게이션:** 현재 위치는 사이드바에서 옅은 인디고 알약 + 오른쪽 점, 하단 메뉴에서 아이콘 뒤의 알약으로 표시하고 굵은 글씨와 `aria-current` 를 함께 쓴다. (색만으로 구분하지 않는다)
- **그대로 지킨 것:** 그라데이션·유리 효과 없음, 그림자는 떠 있는 것에만, 터치 44px 이상, 상태는 색+아이콘+글자, WCAG AA 대비(`tokens.test.ts`·`tokens-dark.test.ts`가 두 테마 모두 검사), 움직임 줄이기 설정 존중.
- **글꼴:** Pretendard 그대로.
- **한계:** 이 디자인은 자동 시험(대비·접근성·화면 폭)과 몇 장의 화면 확인으로만 점검했고, 실제 사용자 반응은 보지 못했다.

## 2. 파일 구조

```
apps/web/src/
  styles/
    tokens.css          ← 색·글자·간격·모서리·그림자의 유일한 출처
    index.css           ← 글꼴 불러오기, 기본 글자, 초점 선, 움직임 줄이기
    tokens.test.ts      ← 대비·값·규칙 검사
  components/ui/        ← 공통 컴포넌트 (아래 4절)
    tones.ts            ← 상태(ok/warn/danger…)별 색·아이콘의 단일 출처
    buttonStyles.ts     ← 버튼 모양. 링크를 버튼처럼 보이게 할 때도 쓴다
    controlStyles.ts    ← 입력·선택 칸이 함께 쓰는 모양
    Modal.tsx           ← Dialog·AlertDialog·Sheet 의 바탕 (내부용)
    ui.test.tsx         ← 동작·접근성 테스트
  features/design/      ← `/dev/design` 미리보기 화면
  lib/cn.ts             ← 조건부 className 이음
```

## 3. 디자인 토큰

### 3.1 구조: 팔레트 → 의미 토큰

`tokens.css` 는 2단으로 되어 있다.

1. **팔레트** `--palette-night-900`, `--palette-indigo-600` … 원색 값. 컴포넌트가 직접 쓰지 않는다.
2. **의미 토큰** `--color-brand`, `--color-ink` … "무엇에 쓰는 색인가"로 이름 붙인 값. Tailwind 유틸리티(`bg-brand`, `text-ink-muted`, `border-line`)로 바로 쓴다.

색을 바꾸려면 `tokens.css` 한 곳만 고친다. Tailwind 기본 팔레트(`bg-blue-500` 등)는 `--color-*: initial` 로 지워서, **의미 토큰 말고는 쓸 수 없다.** 또 `tokens.test.ts` 가 `components/ui` 안에서 16진수·`rgb()`·`bg-[...]` 같은 직접 색 값을 쓰면 실패시킨다.

### 3.2 색

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `canvas` | `#F5F4FA` | 화면 바탕 (맑은 라벤더빛) (Background) |
| `surface` | `#FFFFFF` | 카드·입력 칸 (Surface) |
| `ink` | `#1C1B2E` | 기본 글자 (Text Primary) |
| `ink-muted` | `#5A5772` | 보조 글자 (Text Secondary) — **`canvas`·`surface` 위에서만** |
| `ink-inverse` | `#FFFFFF` | 진한 바탕(버튼·말풍선) 위의 글자 |
| `line` | `#E7E5F1` | 카드 테두리·구분선 (Border, 장식용) |
| `line-strong` | `#7A7791` | 입력 칸·스위치·보조 버튼 테두리 (조작 요소 경계) |
| `brand` | `#4F46E5` | Primary 버튼·링크·선택 (인디고) |
| `brand-strong` | `#3730A3` | Primary Hover·눌림, 옅은 바탕 위의 인디고 글자 |
| `brand-soft` | `#EEF0FF` | 선택·강조 바탕 |
| `focus` | `#4F46E5` | 키보드 초점 선 |

상태색은 항목마다 세 값이 한 묶음이다.

| 상태 | 채움·아이콘 `status-X` | 옅은 바탕 `status-X-soft` | 바탕 위 글자 `status-X-strong` |
|---|---|---|---|
| `ok` (Success) | `#1B7F43` | `#E7F5EC` | `#14582E` |
| `warn` (Warning) | `#A8550A` | `#FFF3DC` | `#7A3B05` |
| `danger` (Danger) | `#C62828` | `#FDEBEA` | `#9B1C1C` |
| `muted` (확인 중·정보) | `#5A5772` | `#EEEDF5` | `#46435C` |

`checking`(확인 중)은 `muted` 색에 도는 아이콘을 쓴다. 상태 이름·색·아이콘 대응은 `components/ui/tones.ts` 가 단일 출처다.

> **왜 `-strong` 이 따로 있나.** 옅은 바탕 위에서는 상태색 자체가 AA(4.5:1)에 못 미칠 수 있다. 그래서 옅은 바탕 위의 글자에는 한 단계 진한 `-strong` 을 쓴다. 상태색 자체는 아이콘·테두리·채움에 그대로 쓴다.

#### 대비 (WCAG, `tokens.test.ts` 가 매번 검사)

| 조합 | 대비 | 기준 |
|---|---|---|
| `ink` / `canvas` · `surface` | 17.1 · 17.9 | 4.5 |
| `ink-muted` / `canvas` · `surface` | 4.55 · 4.76 | 4.5 |
| `brand` / `surface` (링크 글자) | 5.17 | 4.5 |
| `ink-inverse` / `brand` · `brand-strong` | 5.17 · 6.70 | 4.5 |
| `ink-inverse` / `status-ok` · `warn` · `danger` | 5.02 · 5.02 · 4.83 | 4.5 |
| `status-X-strong` / `status-X-soft` | 5.9 ~ 6.9 | 4.5 |
| `line-strong` / `surface` · `canvas` (경계) | 4.76 · 4.55 | 3 (비텍스트) |

**`ink-muted` 는 옅은 회색 바탕(`status-muted-soft`) 위에서 4.34:1 이라 쓰지 않는다.** 그런 곳에는 `ink` 나 `status-muted-strong` 을 쓴다. (알약 탭이 이 규칙 때문에 기본 글자색을 쓴다)

### 3.3 글자

글꼴은 **Pretendard Variable**(OFL 라이선스, `pretendard` 패키지, **자체 호스팅**)을 먼저 쓰고, 불러오지 못하면 `Apple SD Gothic Neo → Noto Sans KR → Malgun Gothic → system-ui` 순으로 대신한다. 글꼴 파일은 화면에 쓰는 글자 조각(subset)만 내려받고 `font-display: swap` 이라 글꼴을 기다리느라 글이 늦게 나타나지 않는다. 파일은 같은 출처(`font-src 'self'`)에서 오며 `data:` 로 끼워 넣지 않는다(CSP 때문, `vite.config.ts` 의 `assetsInlineLimit`).

기준 글자 크기는 **16px**(브라우저 기본값). `rem` 이라 사용자가 브라우저 글자 크기를 키우면 화면 전체가 함께 커진다. 한글은 **띄어쓰기 단위로 줄을 바꾼다**(`word-break: keep-all`, 아주 긴 토큰·주소만 `overflow-wrap: break-word` 로 끊음). "있습/니다"처럼 단어 중간에서 끊기지 않는다.

| 단계 | 유틸리티 | 크기 / 줄 높이 / 굵기 | 용도 |
|---|---|---|---|
| Display | `text-display` | 40px / 1.2 / 700 | 가장 중요한 상태 한 줄 |
| H1 | `text-h1` | 28px / 1.3 / 700 | 화면 제목 |
| H2 | `text-h2` | 22px / 1.35 / 700 | 구역 제목 |
| H3 | `text-h3` | 18px / 1.4 / 600 | 카드 제목 |
| Body Large | `text-body-lg` | 18px / 1.6 | 강조 본문 |
| Body Medium | `text-body` | 16px / 1.6 | **기본 본문** |
| Body Small | `text-body-sm` | 14px / 1.5 | 보조 설명 |
| Label | `text-label` | 14px / 1.4 / 600 | 입력 칸 이름·배지 |
| Caption | `text-caption` | 13px / 1.45 | 시각·출처 덧붙임 |
| Numeric | `text-numeric` | 32px / 1.1 / 700 + 고정폭 숫자 | 주요 숫자 (자릿수가 바뀌어도 폭이 흔들리지 않음) |

글자 크기는 제목 **단계**(h1~h4)와 별개다. 문서 구조는 `level`/`headingLevel` 로, 모양은 `size` 나 `text-*` 로 정한다. (예: 카드 제목은 구조상 h2 여도 모양은 H3)

### 3.4 간격

**4px 단위, 열 가지만 쓴다.** (`--spacing: 0.25rem`, 기준 글자 16px 이므로 정확히 4px)

| 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |
|---|---|---|---|---|---|---|---|---|---|
| `1` | `2` | `3` | `4` | `5` | `6` | `8` | `10` | `12` | `16` |

`p-4`, `gap-3`, `space-y-6`, `mt-8` 처럼 Tailwind 의 숫자로 쓴다. `p-[13px]` 같은 임의 값은 쓰지 않는다. 버튼·입력 칸 높이는 `min-h-11`(44) · `min-h-12`(48) · `min-h-14`(56)로 정해져 있다.

### 3.5 모서리·그림자·움직임

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `rounded-control` | 16px | 버튼·입력 칸·말풍선 |
| `rounded-card` | 24px | 카드·대화상자·토스트 |
| `rounded-full` | — | 배지·스위치·원형 아이콘 |
| `shadow-overlay` | 0 8px 24px / 16% | 떠 있는 것(대화상자·토스트·말풍선·슬라이더 손잡이)에만 |

움직임은 짧은 색·위치 전환(150ms)뿐이다. **`prefers-reduced-motion: reduce`** 이면 `index.css` 가 모든 애니메이션·전환을 사실상 끄고(0.01ms), 회전(`animate-spin`)·깜박임(`animate-pulse`)은 아예 멈춘다. 상태는 글자로도 전하므로 움직임을 꺼도 정보는 그대로다.

## 4. 컴포넌트

모두 `components/ui/` 에 있고 `@/components/ui/이름` 으로 가져온다. **크기·종류가 필요한 컴포넌트는 `variant` 와 `size` 로 고르고**, `className` 은 배치(여백·폭·정렬)에만 쓴다. (`tailwind-merge` 를 쓰지 않으므로 같은 속성을 `className` 으로 덮어쓰면 순서에 따라 안 먹을 수 있다.)

### 4.1 동작

| 컴포넌트 | 주요 props | 접근성 |
|---|---|---|
| **Button** | `variant`: primary·secondary·ghost·danger / `size`: sm(44)·md(48)·lg(56) / `fullWidth` / `loading`·`loadingText` / `leadingIcon`·`trailingIcon` | 기본 `type="button"`. `loading` 이면 눌리지 않고 `aria-busy`. 아이콘은 `aria-hidden`. |
| **IconButton** | `icon`, **`label`(필수)**, `variant`, `size` | `label` 이 `aria-label` 이라 이름 없는 아이콘 버튼을 만들 수 없다(타입이 막는다). |
| `buttonStyles()` | `variant`·`size`·`fullWidth`·`iconOnly` | 링크(`<Link className={buttonStyles()}>`)를 버튼 모양으로. 이동이면 링크, 동작이면 버튼. |
| **Switch** | `label`(필수), `description`, `checked`/`defaultChecked`, `onCheckedChange`, `disabled` | `role="switch"`, 이름표 줄 전체가 눌림, 상태를 **"켜짐/꺼짐" 글자 + 체크 모양**으로도 표시. 스위치 터치 영역 44px. |
| **Slider** | `label`, `min`·`max`·`step`, `value`·`onValueChange`, `formatValue`, `hint` | ←/→·Home/End·PageUp/Down. `aria-valuetext` 에 `formatValue` 결과("30분")를 넣어 읽어 준다. 트랙 테두리 3:1. |
| **Tabs** · `TabsList` · `TabsTrigger` · `TabsContent` | `variant`: underline·pill / `size`: md·lg | ←/→·Home/End, 선택은 색 + 밑줄/채움으로. 같은 화면 안에서 내용을 바꿀 때만(화면 이동은 링크). |
| **Tooltip** | `content`, `side` | 키보드 초점으로도 나타남. **터치 화면에는 없으므로 꼭 필요한 정보를 여기에만 두지 않는다.** |

### 4.2 입력

| 컴포넌트 | 주요 props | 접근성 |
|---|---|---|
| **Input** | `size`: sm·md·lg / `invalid` | `invalid` 면 `aria-invalid` + 두꺼운 위험색 테두리. |
| **Select** | `size`, `invalid` | 브라우저 기본 `<select>` 를 모양만 입력 칸에 맞춤. (모바일 선택 창·키보드·스크린리더 지원이 가장 확실) |
| **TextField** · **SelectField** | `label`, `hint`, `error` + 입력 props | 이름표·도움말·오류 문구를 `htmlFor`/`aria-describedby` 로 연결. 오류는 `role="alert"` + **색이 아니라 글자로 무엇이 잘못됐는지** 말함. |

### 4.3 겹쳐 뜨는 것

| 컴포넌트 | 주요 props | 접근성 |
|---|---|---|
| **Dialog** | `open`, `onOpenChange`, `title`, `description`, `footer`, `size`: sm·md·lg | 제목·설명이 이름·설명. 초점이 안에 갇히고 닫으면 누른 버튼으로 돌아옴. Esc·닫기 버튼·바깥 눌러 닫힘. |
| **AlertDialog** | `title`, `description`, `confirmLabel`, `cancelLabel`, `tone`: default·danger, `onConfirm`, `loading` | `role="alertdialog"`. **처음 초점은 안전한 "취소"**, 바깥을 눌러도 닫히지 않음, `loading` 중에는 Esc 로도 안 닫힘. 되돌리기 어려운 동작에만 쓴다. |
| **Sheet** | `side`: right·left·bottom + Dialog 와 같은 props | 가장자리에 붙는 패널. 좁은 화면에서는 `bottom` 이 손이 닿기 쉽다. |
| **ToastProvider** · `useToast()` | `toast({ tone, title, description, duration })` | 앱 맨 위에 한 번만 둠(`App.tsx`). 위험·주의는 즉시 읽고(assertive) 나머지는 차분히(polite). **위험은 직접 닫을 때까지 남음.** 마우스·초점이 있는 동안 사라지지 않음. F8 로 알림 영역에 이동. |

> **토스트로 알리면 안 되는 것:** 긴급 알림·전달 실패처럼 놓치면 안 되는 내용은 화면에 남는 배너·목록으로 알린다. 토스트는 "저장했습니다" 같은 짧은 결과용이다.

### 4.4 표시

| 컴포넌트 | 주요 props | 비고 |
|---|---|---|
| **Card** | `title`, `description`, `actions`, `headingLevel`, `variant`: default·subtle, `padding`: none·sm·md·lg, `as` | 제목은 `SectionHeader` 로 그린다. |
| **PageHeader** | `title`(h1), `description`, `meta`, `actions` | 화면마다 하나. |
| **SectionHeader** | `title`, `description`, `actions`, `level`: 2·3·4, `size`: md·sm | 문서 단계(`level`)와 모양(`size`)이 별개. |
| **Badge** | `variant`: neutral·brand·outline, `size`: sm·md | 상태가 아닌 분류·꼬리표. |
| **StatusBadge** | `tone`: ok·checking·warn·danger·muted, `size`, `icon` | 색 + 아이콘 + 글자. 상태는 이것으로. |
| **StatusIndicator** | `tone`, `label`, `description`, `size`: sm·md·lg, `live` | 원형 아이콘 + 굵은 글자. `live` 면 `role="status"`. 화면의 "지금 상태". |
| **Callout** | `tone`: info·ok·warn·danger, `title` | 꼭 읽어야 하는 안내 상자. |
| **EmptyState** | `title`, `description`, `icon`, `action`, `size` | 데이터가 없는 것도 사실대로. 오류와 구분. |
| **ErrorState** | `title`, `message`, `detail`, `onRetry`, `variant`: inline·panel | `role="alert"`. 원인을 글자로, 다시 시도 버튼. (도메인 오류 변환은 `common/StateViews` 의 `ErrorState`) |
| **Skeleton** · `SkeletonText` | `shape`: line·block·circle, `lines` | 스크린리더에서 숨김. **반드시 "…가져오는 중" 글자(`role="status"`)와 함께.** |

## 5. 상태를 전하는 방법 (색만으로 구분하지 않는다)

| 상태 | 색 | 아이콘 | 글자 예 |
|---|---|---|---|
| 정상 | 초록 | 체크 원 | "정상" · "모니터링 중" |
| 확인 중 | 회색 | 도는 원 | "확인 중" |
| 주의 | 주황 | 경고 삼각형 | "확인이 필요합니다" |
| 위험 | 빨강 | 느낌표 원 | "바로 확인해 주세요" |
| 알 수 없음·정보 | 회색 | 정보 원 | "알 수 없음" |

색을 못 보는 사용자도 **아이콘 모양**과 **글자**로 구분할 수 있다. 오류 문구는 "잘못되었습니다"가 아니라 무엇이 어떻게 잘못됐는지 적는다. 스위치는 켜짐/꺼짐 글자와 체크 모양, 탭은 밑줄/채움으로 선택을 알린다.

## 6. 접근성 점검표 (새 화면·컴포넌트를 만들 때)

- [ ] 키보드(Tab·Shift+Tab·Enter·Space·Esc·화살표)만으로 끝까지 할 수 있다.
- [ ] 초점이 어디 있는지 항상 보인다. (전역 3px 선, 지우지 않는다)
- [ ] 조작 요소 높이가 44px 이상이다. (E2E 가 모든 화면에서 검사)
- [ ] 글자는 4.5:1, 조작 요소 경계·아이콘은 3:1 이상이다. (새 색 조합은 `tokens.test.ts` 에 추가) 옅은 상태 바탕(`bg-status-X-soft`) 위의 글자는 `text-status-X-strong` — 섞어 쓰면 테스트가 실패한다.
- [ ] 아이콘만 있는 버튼에는 이름이 있다. (`IconButton` 사용)
- [ ] 입력 칸에는 이름표가 있고, 오류는 글자로 설명한다.
- [ ] 상태를 색만으로 전하지 않는다.
- [ ] 움직임이 없어도 정보가 전달된다.
- [ ] 화면에 `h1` 이 하나이고 제목 단계를 건너뛰지 않는다.

## 7. 설계 결정과 이유

| 결정 | 이유 |
|---|---|
| **기준 글자 17px → 16px** | 요구된 본문 기준(16px)과 4px 간격 격자를 맞추기 위해. 기존 `html { font-size: 106.25% }` 를 `100%` 로 바꿔서 기존 화면의 `text-sm` 등도 약 6% 작아졌다. 큰 글자가 필요한 곳은 `text-body-lg`·`text-display` 로 키운다. |
| **팔레트를 청록 → 파랑 계열로** | 요구된 색상표 반영. 의미 토큰 **이름은 그대로**(`brand`·`ink`·`canvas`…) 두고 값만 바꿔서 기존 화면의 클래스를 고치지 않았다. |
| **의미 토큰 외 색 금지** | Tailwind 기본 팔레트를 지우고, 컴포넌트에 직접 색 값을 쓰면 테스트가 실패한다. 색 변경이 한 곳에서 끝난다. |
| **Dialog·Sheet 는 Radix 대신 브라우저 `<dialog>`** | Radix Dialog 의 스크롤 잠금(`react-remove-scroll`)이 `<style>` 태그를 끼워 넣는 것으로 알려져 있어 우리 CSP(`style-src 'self'`)와 충돌할 위험이 있다(직접 확인하지는 않음). 브라우저 기본 모달은 초점 가두기·복귀·뒤 화면 비활성화·Esc 를 제공하고 CSP 와 무관하다. 실제 브라우저 E2E 로 초점·Esc·접근성을 검증했다. |
| **Select 는 Radix 대신 기본 `<select>`** | 모바일에서 큰 선택 창이 열리고 키보드·스크린리더 지원이 가장 확실하다. Radix Select 도 `<style>` 을 끼워 넣는 것으로 알려져 있어 같은 CSP 위험이 있다(역시 직접 확인하지는 않음). |
| **Tabs·Tooltip·Switch·Slider·Toast 는 Radix** | 화살표 이동·초점 관리·읽어 주기 같은 어려운 부분이 검증되어 있고, 인라인 `style` **속성**만 써서 CSP(`style-src-attr`)에 걸리지 않는다. E2E(운영 빌드 + CSP)에서 위반 0건 확인. |
| **한글 줄바꿈 `keep-all`** | 좁은 화면(모바일 안내 상자)에서 단어가 중간에서 끊겨 읽기 어려웠다(실제 화면에서 확인). 전체 화면에 적용한 뒤 가로 넘침·터치 영역 검사를 다시 통과했다. |
| **`variant`/`size` 는 단순 객체 표** | `class-variance-authority` 같은 도구를 더하지 않았다. 종류가 많지 않아 `Record<Variant, string>` 으로 충분하다. |
| **Pretendard 자체 호스팅** | 외부 CDN 은 CSP(`font-src 'self'`)와 개인정보(외부 요청) 면에서 피한다. 조각(subset)이라 필요한 글자만 내려받고, 실패하면 시스템 한글 글꼴로 대신한다. |

## 8. 새 컴포넌트·변형을 더할 때

1. 먼저 `/dev/design` 에서 쓸 수 있는 조각이 이미 있는지 본다.
2. 색은 의미 토큰만, 상태는 `tones.ts` 를 쓴다. (직접 색 값이 있으면 테스트가 실패한다)
3. 터치 영역 44px 이상, 이름표·`aria-*` 를 갖춘다. 이름이 꼭 필요한 곳은 props 를 필수로 만든다(`IconButton.label`).
4. `components/ui/ui.test.tsx` 에 동작·접근성 테스트를 더하고, `features/design/` 에 예시를 더한다.
5. 겹쳐 뜨는 것·초점 이동이 있으면 `e2e/tests/design.spec.ts`(실제 브라우저)에도 더한다.
6. 이 문서의 표를 고친다.

## 9. 검증과 한계

**검증 중 실제로 잡은 문제:** 기존 홈의 큰 상태 상자(`OverallStatus`)·로그인 오류·라우트 오류 화면이 `text-status-danger` 를 옅은 빨강 바탕에 써서 대비 4.41:1(AA 미달)이었다. axe E2E 가 잡았고 `-strong` 으로 고쳤으며, 같은 실수를 막는 테스트(`tokens.test.ts`)를 더했다.

**자동으로 확인하는 것**

- 단위·컴포넌트 테스트(`npm run test`): 토큰 값·대비·규칙, 각 컴포넌트의 동작·이름·키보드.
- E2E(`npm run e2e`, 실제 Chrome, 전체 70개): `/dev/design` 을 데스크톱·태블릿·모바일에서 axe(WCAG 2.0/2.1 A·AA) 0건, 가로 넘침 없음, 터치 44px, 대화상자·시트·확인 대화상자의 초점 가두기·복귀, 탭·스위치·슬라이더·말풍선 키보드 동작, 토스트, 움직임 줄이기, 운영 빌드 CSP 위반 0건과 글꼴이 같은 출처에서 오는지.

**확인하지 못한 것**

- 실제 스크린리더(VoiceOver·NVDA·TalkBack)로 읽어 본 것. 자동 점검은 이름·역할·대비만 본다.
- 어두운 테마. 밝은 테마만 만들었다. 의미 토큰 구조라 `tokens.css` 에 어두운 값을 더하면 확장할 수 있지만 검증하지 않았다.
- Pretendard 가 아예 막힌 환경에서의 모습(시스템 글꼴 대체). 글꼴 목록은 순서대로 정의되어 있지만 직접 막아 보지는 않았다.
- 화면 확대 200%·글자만 크게 같은 사용자 설정에서의 화면 전체. (`rem` 기반이라 커지지만 모든 화면을 확인하지는 않았다)
- 기존 화면(홈·알림·센서 등)은 색·글자 값이 새 토큰으로 바뀌고 공통 버튼 모양을 쓰도록 일부 고쳤지만, 화면별로 새 컴포넌트(`PageHeader`·`Switch` 등)로 전면 교체하지는 않았다. 필요할 때 하나씩 옮긴다.
- 번들 크기: 토스트·말풍선이 앱 최상단에서 쓰여 첫 JS 가 약 14kB(gzip) 늘었다. (399kB → 453kB, gzip 125kB → 139kB)
