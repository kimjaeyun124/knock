import { PATHS, SERVICE_NAME } from '@/app/paths'
import { Mark } from '@/components/layout/Logo'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { RegisterRequestSchema } from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TextField } from '@/components/ui/fields'
import { useSession } from '@/hooks/useAuth'
import { useRegister, useSetupStatus } from './hooks'

/** 서버의 첫 보호자 계정 만들기. 보호자가 이미 있으면 열리지 않는다. */
export function RegisterPage() {
  const session = useSession()
  const status = useSetupStatus()
  const register = useRegister()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (session.data) return <Navigate to={PATHS.onboarding} replace />

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = RegisterRequestSchema.safeParse({ email, password, displayName })
    const next: Record<string, string> = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        next[key] ??= issue.message
      }
    }
    if (password !== confirm) next.confirm = '비밀번호가 서로 다릅니다.'
    setErrors(next)
    if (!parsed.success || next.confirm) return
    register.mutate(parsed.data)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <p className="flex items-center gap-2 text-h3 font-extrabold tracking-tight">
          <Mark />
          {SERVICE_NAME}
        </p>
        <h1 className="mt-1 text-2xl font-bold">첫 계정 만들기</h1>
      </div>
      {status.isError ? (
        <ErrorState
          title="서버 상태를 확인하지 못했습니다"
          error={status.error}
          onRetry={() => void status.refetch()}
        />
      ) : status.data === undefined ? (
        <LoadingState label="확인하는 중" />
      ) : !status.data.needsSetup ? (
        <Card>
          <p className="font-semibold">이미 설정된 서버입니다.</p>
          <p className="mt-1 text-ink-muted">
            계정은 기존 보호자가 관리합니다. 이 화면에서는 더 만들 수 없습니다.
          </p>
          <Link
            to="/login"
            className="mt-3 inline-flex min-h-12 items-center text-brand-strong underline"
          >
            로그인하러 가기
          </Link>
        </Card>
      ) : (
        <Card>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <p className="text-sm text-ink-muted">
              서버의 첫 보호자 계정입니다. 이후 계정은 이 화면에서 만들 수 없습니다.
            </p>
            <TextField
              label="표시 이름"
              hint="화면과 알림 기록에 보이는 이름입니다."
              value={displayName}
              maxLength={30}
              error={errors.displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <TextField
              label="이메일"
              type="email"
              autoComplete="username"
              value={email}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="비밀번호"
              type="password"
              autoComplete="new-password"
              hint="12자 이상"
              value={password}
              error={errors.password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label="비밀번호 확인"
              type="password"
              autoComplete="new-password"
              value={confirm}
              error={errors.confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? '만드는 중…' : '계정 만들기'}
            </Button>
            {register.isError ? (
              <p role="alert" className="text-status-danger">
                {register.error.message}
              </p>
            ) : null}
          </form>
        </Card>
      )}
    </div>
  )
}
