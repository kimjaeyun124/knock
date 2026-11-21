import { useState, type FormEvent } from 'react'
import { MIN_PASSWORD_LENGTH } from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { TextField } from '@/components/ui/fields'
import { useApi } from '@/hooks/useApi'
import { describeApiError } from '@/lib/apiErrors'
import { useMutation } from '@tanstack/react-query'

/** 내 비밀번호 바꾸기. 현재 비밀번호를 다시 확인하고, 바꾸면 이 기기를 뺀 다른 기기는 로그아웃된다. */
export function PasswordPage() {
  const api = useApi()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setAgain('')
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    change.reset()
    if (current === '') return setFormError('현재 비밀번호를 입력해 주세요.')
    if (next.length < MIN_PASSWORD_LENGTH) {
      return setFormError(`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
    }
    if (next === current) return setFormError('새 비밀번호는 현재 비밀번호와 달라야 합니다.')
    if (next !== again) return setFormError('새 비밀번호 확인이 일치하지 않습니다.')
    setFormError(null)
    change.mutate()
  }

  const serverError = change.error ? describeApiError(change.error) : null

  return (
    <div className="space-y-4">
      <h1 className="text-h1">비밀번호 변경</h1>
      <Card title="내 계정 비밀번호">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <TextField
            label="현재 비밀번호"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
          <TextField
            label="새 비밀번호"
            hint={`${MIN_PASSWORD_LENGTH}자 이상. 다른 곳에서 쓰지 않는 문장형 비밀번호를 권합니다.`}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
          <TextField
            label="새 비밀번호 확인"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />

          {formError ? (
            <p
              role="alert"
              className="rounded-control bg-status-danger-soft p-3 text-status-danger-strong"
            >
              {formError}
            </p>
          ) : null}
          {serverError ? (
            <p
              role="alert"
              className="rounded-control bg-status-danger-soft p-3 text-status-danger-strong"
            >
              {serverError.message}
              {serverError.hint ? ` ${serverError.hint}` : ''}
            </p>
          ) : null}
          {change.data ? (
            <Callout tone="ok" title="비밀번호를 바꿨습니다">
              <p className="text-body-sm">
                {change.data.signedOutOtherSessions > 0
                  ? `이 기기는 그대로 로그인되어 있고, 다른 기기 ${change.data.signedOutOtherSessions}곳은 로그아웃되었습니다.`
                  : '이 기기는 그대로 로그인되어 있습니다. 로그인되어 있던 다른 기기는 없었습니다.'}
              </p>
            </Callout>
          ) : null}

          <Button type="submit" loading={change.isPending} loadingText="바꾸는 중…">
            비밀번호 바꾸기
          </Button>
        </form>
      </Card>
      <p className="text-body-sm text-ink-muted">
        비밀번호를 잊어버린 경우의 재설정은 아직 없습니다. 운영 안내(docs/OPERATIONS.md)를 참고해
        주세요.
      </p>
    </div>
  )
}
