import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'

/** CSS 에 정의된 토큰 값을 읽어 그대로 보여 준다. (값을 이 파일에 따로 적지 않는다 → 어긋날 일이 없다) */
function TokenValue({ name }: { name: string }) {
  return (
    <code
      ref={(el) => {
        if (el)
          el.textContent = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      }}
      className="text-caption text-ink-muted"
    />
  )
}

interface Swatch {
  token: string
  use: string
}

const COLOR_GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: '바탕·글자·선',
    swatches: [
      { token: 'canvas', use: '화면 바탕' },
      { token: 'surface', use: '카드·입력 칸' },
      { token: 'ink', use: '기본 글자' },
      { token: 'ink-muted', use: '보조 글자 (canvas·surface 위에서만)' },
      { token: 'line', use: '카드·구분선' },
      { token: 'line-strong', use: '입력 칸·스위치 테두리' },
    ],
  },
  {
    title: '주요 동작',
    swatches: [
      { token: 'brand', use: 'Primary 버튼·링크' },
      { token: 'brand-strong', use: 'Primary Hover·눌림' },
      { token: 'brand-soft', use: '선택·강조 바탕' },
      { token: 'focus', use: '키보드 초점 선' },
    ],
  },
  {
    title: '상태 (아이콘·글자와 함께만 쓴다)',
    swatches: [
      { token: 'status-ok', use: 'Success 채움·아이콘' },
      { token: 'status-ok-soft', use: 'Success 옅은 바탕' },
      { token: 'status-ok-strong', use: 'Success 글자' },
      { token: 'status-warn', use: 'Warning 채움·아이콘' },
      { token: 'status-warn-soft', use: 'Warning 옅은 바탕' },
      { token: 'status-warn-strong', use: 'Warning 글자' },
      { token: 'status-danger', use: 'Danger 채움·아이콘' },
      { token: 'status-danger-soft', use: 'Danger 옅은 바탕' },
      { token: 'status-danger-strong', use: 'Danger 글자' },
      { token: 'status-muted', use: '확인 중·정보 채움' },
      { token: 'status-muted-soft', use: '확인 중·정보 바탕' },
    ],
  },
]

export function ColorSection() {
  return (
    <section aria-labelledby="design-colors" className="space-y-4">
      <SectionHeader
        id="design-colors"
        title="색"
        description="컴포넌트는 의미 토큰만 쓴다. 색을 바꾸려면 styles/tokens.css 한 곳만 고친다."
      />
      {COLOR_GROUPS.map((group) => (
        <Card key={group.title} title={group.title} headingLevel={3}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.swatches.map(({ token, use }) => (
              <li key={token} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-12 shrink-0 rounded-control border border-line"
                  style={{ backgroundColor: `var(--color-${token})` }}
                />
                <div className="min-w-0">
                  <p className="text-label">{token}</p>
                  <TokenValue name={`--color-${token}`} />
                  <p className="text-caption text-ink-muted">{use}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}

const TYPE_STYLES: { cls: string; token: string; name: string; sample: string }[] = [
  { cls: 'text-display', token: 'display', name: 'Display 40px', sample: '모니터링 중입니다' },
  { cls: 'text-h1', token: 'h1', name: 'H1 28px', sample: '알림 상세' },
  { cls: 'text-h2', token: 'h2', name: 'H2 22px', sample: '최근 24시간 움직임' },
  { cls: 'text-h3', token: 'h3', name: 'H3 18px', sample: '거실 센서' },
  {
    cls: 'text-body-lg',
    token: 'body-lg',
    name: 'Body Large 18px',
    sample: '밤사이 확인할 알림이 없습니다.',
  },
  {
    cls: 'text-body',
    token: 'body',
    name: 'Body Medium 16px',
    sample: '마지막 움직임은 오전 2시 14분에 감지되었습니다.',
  },
  {
    cls: 'text-body-sm',
    token: 'body-sm',
    name: 'Body Small 14px',
    sample: '센서가 5분 이상 신호를 보내지 않으면 알려 드립니다.',
  },
  { cls: 'text-label', token: 'label', name: 'Label 14px', sample: '알림 받을 시간' },
  { cls: 'text-caption', token: 'caption', name: 'Caption 13px', sample: '오전 2:14 · 현관 센서' },
  { cls: 'text-numeric', token: 'numeric', name: 'Numeric 32px', sample: '1,234' },
]

const SPACING: { token: string; px: number; cls: string }[] = [
  { token: '1', px: 4, cls: 'w-1' },
  { token: '2', px: 8, cls: 'w-2' },
  { token: '3', px: 12, cls: 'w-3' },
  { token: '4', px: 16, cls: 'w-4' },
  { token: '5', px: 20, cls: 'w-5' },
  { token: '6', px: 24, cls: 'w-6' },
  { token: '8', px: 32, cls: 'w-8' },
  { token: '10', px: 40, cls: 'w-10' },
  { token: '12', px: 48, cls: 'w-12' },
  { token: '16', px: 64, cls: 'w-16' },
]

export function TypographySection() {
  return (
    <section aria-labelledby="design-type" className="space-y-4">
      <SectionHeader
        id="design-type"
        title="글자"
        description="Pretendard(자체 호스팅)를 먼저 쓰고, 불러오지 못하면 시스템 한글 글꼴을 쓴다. 본문 기준 16px."
      />
      <Card>
        <ul className="divide-y divide-line">
          {TYPE_STYLES.map(({ cls, name, sample }) => (
            <li
              key={cls}
              className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[12rem_1fr] md:items-baseline md:gap-4"
            >
              <p className="text-caption text-ink-muted">
                {name} <code>{cls}</code>
              </p>
              <p className={cls}>{sample}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

export function SpacingSection() {
  return (
    <section aria-labelledby="design-spacing" className="space-y-4">
      <SectionHeader
        id="design-spacing"
        title="간격과 모서리"
        description="간격은 4px 단위. 아래 열 가지 값만 쓴다. (p-1 … p-16, gap-*, space-*)"
      />
      <Card>
        <ul className="space-y-2">
          {SPACING.map(({ token, px, cls }) => (
            <li key={token} className="flex items-center gap-4">
              <span className="w-24 text-caption text-ink-muted">
                <code>{token}</code> · {px}px
              </span>
              <span aria-hidden="true" className={`h-4 rounded-sm bg-brand ${cls}`} />
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-4">
          <div className="grid h-16 w-40 place-items-center rounded-control border border-line-strong text-caption">
            rounded-control 8px
          </div>
          <div className="grid h-16 w-40 place-items-center rounded-card border border-line-strong text-caption">
            rounded-card 12px
          </div>
          <div className="grid h-16 w-40 place-items-center rounded-card bg-surface text-caption shadow-overlay">
            shadow-overlay
          </div>
        </div>
      </Card>
    </section>
  )
}
