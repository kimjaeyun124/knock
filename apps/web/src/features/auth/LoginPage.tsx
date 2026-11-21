import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Mark } from '@/components/layout/Logo'
import { SERVICE_NAME } from '@/app/paths'
import { useSetupStatus } from '@/features/onboarding/hooks'
import { SESSION_EXPIRED_KEY, useLogin, useSession } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { Callout } from '@/components/ui/Callout'
import { DemoModeBanner } from '@/components/layout/DemoModeBanner'
import { SESSION_EXPIRED_MESSAGE } from '@/lib/apiErrors'
import { Button } from '@/components/ui/Button'
import { CONTROL_BASE } from '@/components/ui/controlStyles'

/** 로그인 후 돌아갈 경로. 앱 안의 경로만 허용한다. */
function getRedirectPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = state.from
    if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
      return from === '/login' ? '/' : from
    }
  }
  return '/'
}

const inputClass = `mt-1 min-h-12 ${CONTROL_BASE}`

export function LoginPage() {
  const location = useLocation()
  const session = useSession()
  const login = useLogin()
  const expired = useQueryClient().getQueryData(SESSION_EXPIRED_KEY) === true
  // 안내일 뿐이므로 확인에 실패하면 링크만 보이지 않고 로그인은 그대로 된다.
  const setup = useSetupStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // 이미 로그인되어 있으면 로그인 화면을 보여 주지 않는다.
  if (session.data) return <Navigate to={getRedirectPath(location.state)} replace />

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (email.trim() === '' || password === '') {
      setFormError('이메일과 비밀번호를 모두 입력해 주세요.')
      return
    }
    setFormError(null)
    login.mutate({ email, password })
  }

  const errorMessage = formError ?? login.error?.message ?? null

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <DemoModeBanner />
      <div className="space-y-3">
        <p className="flex items-center gap-2.5 text-h2 font-extrabold tracking-tight">
          <Mark className="size-10" />
          {SERVICE_NAME}
        </p>
        <h1 className="text-h1">로그인</h1>
        <p className="text-body text-ink-muted">문을 두드리듯 가볍게, 야간 안부를 확인하세요.</p>
      </div>

      {expired ? (
        <Callout tone="warn" title="로그인이 만료되었습니다">
          <p className="text-body-sm">
            {SESSION_EXPIRED_MESSAGE} 하던 화면은 로그인하면 이어서 열립니다.
          </p>
        </Callout>
      ) : null}

      <Card>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="font-semibold">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="font-semibold">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </div>

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-control bg-status-danger-soft p-3 text-status-danger-strong"
            >
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" fullWidth loading={login.isPending} loadingText="로그인 중…">
            로그인
          </Button>
        </form>
      </Card>

      {setup.data?.needsSetup ? (
        <div>
          <p>처음 사용하시나요?</p>
          <Link
            to="/register"
            className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
          >
            첫 계정 만들기
          </Link>
        </div>
      ) : null}

      <div>
        <p className="text-sm text-ink-muted">
          이 서비스는 센서의 움직임 신호를 알려 드리는 도구입니다. 낙상이나 배회를 확실히 감지하거나
          예방하지는 않습니다.
        </p>
        <Link
          to="/notice"
          className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
        >
          서비스 안내와 한계
        </Link>
      </div>
    </div>
  )
}
