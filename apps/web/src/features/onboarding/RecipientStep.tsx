import { useState } from 'react'
import { RecipientAliasSchema, RecipientMemoSchema } from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { TextAreaField, TextField } from '@/components/ui/fields'

export const MEMO_MAX = 200

/** STEP 2. 보호 대상의 표시 이름과 선택 메모. 개인정보는 최소로 받는다. */
export function RecipientStep({
  alias,
  memo,
  onChange,
  onBack,
  onNext,
  saving,
  error,
}: {
  alias: string
  memo: string
  onChange: (next: { alias: string; memo: string }) => void
  onBack: () => void
  onNext: (value: { alias: string; memo: string }) => void
  saving: boolean
  error: string | null
}) {
  const [errors, setErrors] = useState<{ alias?: string; memo?: string }>({})

  const submit = () => {
    const parsedAlias = RecipientAliasSchema.safeParse(alias)
    const parsedMemo = RecipientMemoSchema.safeParse(memo)
    const next: { alias?: string; memo?: string } = {}
    if (!parsedAlias.success)
      next.alias = parsedAlias.error.issues[0]?.message ?? '호칭을 확인해 주세요.'
    if (!parsedMemo.success)
      next.memo = parsedMemo.error.issues[0]?.message ?? '메모를 확인해 주세요.'
    setErrors(next)
    if (parsedAlias.success && parsedMemo.success) {
      onNext({ alias: parsedAlias.data, memo: parsedMemo.data })
    }
  }

  return (
    <Card title="누구를 살필까요?">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <TextField
          label="표시 이름 (필수)"
          hint="실명 대신 '어르신', '엄마'처럼 부르는 말을 입력해 주세요. 화면과 알림에 이 이름이 쓰입니다."
          value={alias}
          maxLength={RECIPIENT_ALIAS_MAX}
          error={errors.alias}
          autoComplete="off"
          onChange={(event) => onChange({ alias: event.target.value, memo })}
        />
        <TextAreaField
          label="메모 (선택)"
          hint={`보호자끼리 알아 둘 내용을 적을 수 있습니다. 비워 두어도 됩니다. (${memo.length}/${MEMO_MAX}자)`}
          value={memo}
          maxLength={MEMO_MAX}
          error={errors.memo}
          onChange={(event) => onChange({ alias, memo: event.target.value })}
        />
        <Callout tone="info" title="개인정보는 꼭 필요한 만큼만 받습니다">
          <ul className="list-disc space-y-1 pl-5 text-body-sm">
            <li>실명, 주민등록번호, 전화번호, 주소, 병명·복용 약 같은 정보는 적지 마세요.</li>
            <li>
              입력한 내용은 이 서비스의 서버에 저장되며, 같은 가구의 보호자 화면에 표시됩니다.
            </li>
            <li>
              메모는 비워서 저장하면 지워집니다. 호칭과 메모는 이 화면에서 언제든 고칠 수 있습니다.
            </li>
          </ul>
        </Callout>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onBack} disabled={saving}>
            이전
          </Button>
          <Button type="submit" loading={saving} loadingText="저장하는 중…">
            다음
          </Button>
        </div>
        {error ? (
          <p role="alert" className="font-semibold text-status-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  )
}

const RECIPIENT_ALIAS_MAX = 20
