import { ArrowRight, Bell, Plus, RefreshCw, Save, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { AlertDialog, Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { SelectField, TextField } from '@/components/ui/fields'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Sheet } from '@/components/ui/Sheet'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { Slider } from '@/components/ui/Slider'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusIndicator } from '@/components/ui/StatusIndicator'
import { Switch } from '@/components/ui/Switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { Tooltip } from '@/components/ui/Tooltip'
import type { StatusTone } from '@/components/ui/tones'

const TONES: { tone: StatusTone; label: string }[] = [
  { tone: 'ok', label: '정상' },
  { tone: 'checking', label: '확인 중' },
  { tone: 'warn', label: '확인이 필요합니다' },
  { tone: 'danger', label: '바로 확인해 주세요' },
  { tone: 'muted', label: '알 수 없음' },
]

export function ButtonSection() {
  const [loading, setLoading] = useState(false)
  return (
    <section aria-labelledby="design-buttons" className="space-y-4">
      <SectionHeader
        id="design-buttons"
        title="버튼"
        description="모든 크기가 높이 44px 이상이다. 링크를 버튼처럼 보이게 할 때는 buttonStyles() 를 쓴다."
      />
      <Card title="종류와 크기" headingLevel={3}>
        <div className="space-y-4">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-caption text-ink-muted">{size}</span>
              <Button size={size}>저장</Button>
              <Button size={size} variant="secondary">
                취소
              </Button>
              <Button size={size} variant="ghost">
                자세히
              </Button>
              <Button size={size} variant="danger">
                삭제
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="상태와 아이콘" headingLevel={3}>
        <div className="flex flex-wrap items-center gap-3">
          <Button leadingIcon={Save}>아이콘과 글자</Button>
          <Button variant="secondary" trailingIcon={ArrowRight}>
            다음
          </Button>
          <Button disabled>사용할 수 없음</Button>
          <Button
            loading={loading}
            loadingText="저장하는 중"
            onClick={() => {
              setLoading(true)
              window.setTimeout(() => {
                setLoading(false)
              }, 1500)
            }}
          >
            누르면 처리 중
          </Button>
          <Link to="/" className={buttonStyles({ variant: 'secondary' })}>
            버튼처럼 보이는 링크
          </Link>
        </div>
      </Card>
      <Card
        title="아이콘 버튼"
        headingLevel={3}
        description="글자가 없으므로 이름(label)이 필수다. 말풍선(Tooltip)은 눈으로 보는 보충이다."
      >
        <div className="flex flex-wrap items-center gap-3">
          {[
            { icon: Plus, label: '센서 추가', variant: 'primary' },
            { icon: Settings, label: '설정 열기', variant: 'secondary' },
            { icon: Bell, label: '알림 보기', variant: 'ghost' },
            { icon: Trash2, label: '삭제', variant: 'danger' },
          ].map(({ icon, label, variant }) => (
            <Tooltip key={label} content={label}>
              <IconButton icon={icon} label={label} variant={variant as 'primary'} />
            </Tooltip>
          ))}
          <IconButton icon={RefreshCw} label="새로 고침" size="sm" variant="secondary" />
          <IconButton icon={RefreshCw} label="새로 고침 (크게)" size="lg" variant="secondary" />
        </div>
      </Card>
    </section>
  )
}

export function StatusSection() {
  return (
    <section aria-labelledby="design-status" className="space-y-4">
      <SectionHeader
        id="design-status"
        title="상태 표시"
        description="상태는 색 + 아이콘 + 글자 세 가지로 함께 전한다. 색만으로 구분하지 않는다."
      />
      <Card title="배지" headingLevel={3}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {TONES.map(({ tone, label }) => (
              <StatusBadge key={tone} tone={tone}>
                {label}
              </StatusBadge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TONES.map(({ tone, label }) => (
              <StatusBadge key={tone} tone={tone} size="sm">
                {label}
              </StatusBadge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>거실</Badge>
            <Badge variant="brand">시뮬레이션</Badge>
            <Badge variant="outline" size="sm">
              센서 3대
            </Badge>
          </div>
        </div>
      </Card>
      <Card title="상태 표시기" headingLevel={3}>
        <div className="grid gap-4 md:grid-cols-2">
          {TONES.map(({ tone, label }) => (
            <StatusIndicator
              key={tone}
              tone={tone}
              label={label}
              description="마지막 확인 오전 2:14"
            />
          ))}
          <StatusIndicator
            tone="ok"
            size="lg"
            label="모니터링 중"
            description="모든 센서가 연결되어 있습니다."
          />
          <StatusIndicator tone="danger" size="sm" label="신호 없음" />
        </div>
      </Card>
      <Card title="안내 상자" headingLevel={3}>
        <div className="space-y-3">
          <Callout title="알아 두세요">
            <p>앱을 열어 두지 않으면 알림을 받지 못할 수 있습니다.</p>
          </Callout>
          <Callout tone="ok" title="저장했습니다" />
          <Callout tone="warn" title="센서 한 대가 5분 넘게 신호를 보내지 않았습니다">
            <p>전원과 와이파이를 확인해 주세요.</p>
          </Callout>
          <Callout tone="danger" title="알림을 전달하지 못했습니다">
            <p>앱 화면 알림이 닫혀 있어 전달이 실패했습니다.</p>
          </Callout>
        </div>
      </Card>
    </section>
  )
}

export function FormSection() {
  const [minutes, setMinutes] = useState(30)
  return (
    <section aria-labelledby="design-forms" className="space-y-4">
      <SectionHeader
        id="design-forms"
        title="입력"
        description="이름표·도움말·오류 문구가 입력 칸과 연결되어 있다. 오류는 글자로 설명한다."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="입력 칸과 선택 칸" headingLevel={3}>
          <div className="space-y-4">
            <TextField label="센서 이름" hint="예: 거실 센서" placeholder="이름을 입력하세요" />
            <TextField
              label="이메일"
              defaultValue="abc"
              error="이메일 형식이 아닙니다. @ 를 포함해 입력해 주세요."
            />
            <TextField label="사용 안 함" disabled defaultValue="수정할 수 없음" />
            <SelectField label="구역" defaultValue="living">
              <option value="living">거실</option>
              <option value="bedroom">침실</option>
              <option value="entrance">현관</option>
            </SelectField>
          </div>
        </Card>
        <Card title="스위치와 슬라이더" headingLevel={3}>
          <div className="space-y-6">
            <Switch label="알림 소리" description="알림이 도착하면 소리를 냅니다." />
            <Switch label="푸시 알림" defaultChecked />
            <Switch label="사용할 수 없는 설정" disabled />
            <Slider
              label="신호가 없을 때 알릴 시간"
              hint="이 시간 동안 신호가 없으면 알립니다."
              min={5}
              max={60}
              step={5}
              value={minutes}
              onValueChange={setMinutes}
              formatValue={(value) => `${value}분`}
            />
          </div>
        </Card>
      </div>
    </section>
  )
}

export function NavigationSection() {
  return (
    <section aria-labelledby="design-tabs" className="space-y-4">
      <SectionHeader
        id="design-tabs"
        title="탭"
        description="←/→ 로 옮기고 Home/End 로 처음·끝으로 간다."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="밑줄 탭" headingLevel={3}>
          <Tabs defaultValue="open">
            <TabsList aria-label="알림 상태">
              <TabsTrigger value="open">진행 중</TabsTrigger>
              <TabsTrigger value="done">종료됨</TabsTrigger>
            </TabsList>
            <TabsContent value="open">확인하지 않은 알림이 여기에 나옵니다.</TabsContent>
            <TabsContent value="done">종료한 알림이 여기에 나옵니다.</TabsContent>
          </Tabs>
        </Card>
        <Card title="알약 탭" headingLevel={3}>
          <Tabs defaultValue="day" variant="pill">
            <TabsList aria-label="기간">
              <TabsTrigger value="day">하루</TabsTrigger>
              <TabsTrigger value="week">일주일</TabsTrigger>
            </TabsList>
            <TabsContent value="day">최근 24시간입니다.</TabsContent>
            <TabsContent value="week">최근 7일입니다.</TabsContent>
          </Tabs>
        </Card>
      </div>
    </section>
  )
}

export function OverlaySection() {
  const [dialog, setDialog] = useState(false)
  const [alertDialog, setAlertDialog] = useState(false)
  const [side, setSide] = useState<'right' | 'bottom' | null>(null)
  const { toast } = useToast()
  return (
    <section aria-labelledby="design-overlays" className="space-y-4">
      <SectionHeader
        id="design-overlays"
        title="대화상자·시트·토스트"
        description="열면 초점이 안으로 들어가고, Esc 로 닫으면 누르기 전 버튼으로 돌아온다."
      />
      <Card title="열어 보기" headingLevel={3}>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setDialog(true)
            }}
          >
            대화상자
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setAlertDialog(true)
            }}
          >
            확인 대화상자
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSide('right')
            }}
          >
            오른쪽 시트
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSide('bottom')
            }}
          >
            아래 시트
          </Button>
        </div>
      </Card>
      <Card title="토스트" headingLevel={3} description="위험 토스트는 직접 닫을 때까지 남는다.">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              toast({ tone: 'ok', title: '저장했습니다' })
            }}
          >
            성공
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast({
                tone: 'warn',
                title: '센서 한 대의 배터리가 낮습니다',
                description: '곧 교체해 주세요.',
              })
            }}
          >
            주의
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast({
                tone: 'danger',
                title: '저장하지 못했습니다',
                description: '서버에 연결할 수 없습니다. 다시 시도해 주세요.',
              })
            }}
          >
            위험
          </Button>
        </div>
      </Card>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="센서 이름 바꾸기"
        description="알림과 기록에 보이는 이름입니다."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDialog(false)
              }}
            >
              취소
            </Button>
            <Button
              onClick={() => {
                setDialog(false)
                toast({ tone: 'ok', title: '이름을 바꿨습니다' })
              }}
            >
              저장
            </Button>
          </>
        }
      >
        <TextField label="센서 이름" defaultValue="거실 센서" />
      </Dialog>
      <AlertDialog
        open={alertDialog}
        onOpenChange={setAlertDialog}
        title="센서를 삭제할까요?"
        description="이 센서의 설정이 지워집니다. 지난 움직임 기록은 남지만 되돌릴 수 없습니다."
        confirmLabel="삭제"
        tone="danger"
        onConfirm={() => {
          setAlertDialog(false)
        }}
      />
      <Sheet
        open={side !== null}
        onOpenChange={(open) => {
          if (!open) setSide(null)
        }}
        side={side ?? 'right'}
        title="필터"
        description="보고 싶은 기록만 고릅니다."
        footer={
          <Button
            onClick={() => {
              setSide(null)
            }}
          >
            적용
          </Button>
        }
      >
        <SelectField label="구역" defaultValue="all">
          <option value="all">전체</option>
          <option value="living">거실</option>
          <option value="bedroom">침실</option>
        </SelectField>
      </Sheet>
    </section>
  )
}

export function StateSection() {
  return (
    <section aria-labelledby="design-states" className="space-y-4">
      <SectionHeader id="design-states" title="비어 있음·오류·로딩" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="비어 있음" headingLevel={3}>
          <EmptyState
            title="아직 알림이 없습니다"
            description="센서가 움직임을 감지하면 여기에 나타납니다."
            action={<Button variant="secondary">센서 등록하기</Button>}
          />
        </Card>
        <Card title="오류" headingLevel={3}>
          <ErrorState
            title="센서 목록을 불러오지 못했습니다"
            message="서버에 연결할 수 없습니다."
            detail="문의할 때 알려 주세요: req_demo_0001"
            onRetry={() => undefined}
            variant="panel"
          />
        </Card>
        <Card title="자리 표시" headingLevel={3} className="lg:col-span-2">
          <div className="flex items-start gap-4">
            <Skeleton shape="circle" />
            <div className="flex-1 space-y-3">
              <Skeleton className="w-1/3" />
              <SkeletonText lines={3} />
            </div>
          </div>
          <p role="status" className="mt-3 text-body-sm text-ink-muted">
            내용을 가져오는 중입니다.
          </p>
        </Card>
      </div>
    </section>
  )
}
