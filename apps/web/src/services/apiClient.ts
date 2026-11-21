import type { z } from 'zod'
import { ApiErrorBodySchema } from '@tetris/shared'
import { env } from '@/lib/env'

export type ApiErrorKind =
  /** 서버에 닿지 못함 (서버가 꺼져 있거나 주소가 틀림) */
  | 'network'
  /** 기기가 인터넷에 연결되어 있지 않음 */
  | 'offline'
  /** 정해진 시간 안에 서버가 응답하지 않음 */
  | 'timeout'
  /** 서버가 오류 상태 코드로 응답함 */
  | 'http'
  /** 성공 상태였지만 응답 내용이 약속된 형식이 아님 */
  | 'invalid-response'
  /** 서버가 아직 이 기능을 제공하지 않음 (개발 단계에서만 나타남) */
  | 'not-implemented'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly code: string | null
  readonly requestId: string | null
  /** 요청한 경로. 인증 만료(401)와 로그인 실패(401)를 구별하는 데 쓴다. */
  readonly path: string | null

  constructor(init: {
    kind: ApiErrorKind
    message: string
    status?: number
    code?: string
    requestId?: string
    path?: string
    cause?: unknown
  }) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status ?? null
    this.code = init.code ?? null
    this.requestId = init.requestId ?? null
    this.path = init.path ?? null
  }
}

/** 서버에 닿지 못하는 오류의 종류. 연결 상태 표시가 "서버에 닿지 못함"을 판단할 때 쓴다. */
export const UNREACHABLE_KINDS: readonly ApiErrorKind[] = ['network', 'offline', 'timeout']

/** 응답을 기다리는 최대 시간. 이보다 오래 걸리면 시간 초과로 알린다. */
export const REQUEST_TIMEOUT_MS = 15_000

const UNREACHABLE_MESSAGE = '서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인해 주세요.'
const OFFLINE_MESSAGE = '인터넷 연결이 끊겨 있습니다. 연결을 확인한 뒤 다시 시도해 주세요.'
const TIMEOUT_MESSAGE = '서버가 정해진 시간 안에 응답하지 않았습니다. 잠시 뒤 다시 시도해 주세요.'

async function readJson(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return undefined
  try {
    return (await res.json()) as unknown
  } catch {
    return undefined
  }
}

function describeHttpFailure(status: number): string {
  // 개발 프록시나 게이트웨이가 서버에 닿지 못했을 때 내려 주는 상태 코드
  if (status === 502 || status === 503 || status === 504) return UNREACHABLE_MESSAGE
  if (status >= 500) return `서버에서 문제가 발생했습니다. (상태 코드 ${status})`
  return `요청을 처리하지 못했습니다. (상태 코드 ${status})`
}

/**
 * 서버 API 호출의 유일한 통로.
 *
 * 성공은 "2xx 상태 + 응답이 스키마와 일치"일 때만 인정한다.
 * 그 외(연결 실패, 오류 상태, 형식 불일치)는 모두 ApiError를 던져
 * 화면이 오류를 성공처럼 보여 주지 않게 한다.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  // 호출자가 취소할 수 있는 신호와, 시간 초과 신호를 하나로 합친다.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const caller = init.signal
  const onCallerAbort = () => controller.abort()
  if (caller?.aborted) controller.abort()
  else caller?.addEventListener('abort', onCallerAbort, { once: true })

  try {
    return await request(path, schema, { ...init, signal: controller.signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      // 시간 초과로 우리가 끊은 요청은 오류로 알린다. 호출자가 취소한 요청은 그대로 전달한다.
      if (timedOut && !caller?.aborted) {
        throw new ApiError({ kind: 'timeout', message: TIMEOUT_MESSAGE, path, cause })
      }
      throw cause
    }
    throw cause
  } finally {
    clearTimeout(timer)
    caller?.removeEventListener('abort', onCallerAbort)
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${env.apiBaseUrl}${path}`, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new ApiError({
      kind: offline ? 'offline' : 'network',
      message: offline ? OFFLINE_MESSAGE : UNREACHABLE_MESSAGE,
      path,
      cause,
    })
  }

  const body = await readJson(res)
  // 본문을 받는 도중 끊긴 경우(시간 초과·취소)를 "형식이 다른 응답"으로 오해하지 않게 한다.
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (!res.ok) {
    const parsed = ApiErrorBodySchema.safeParse(body)
    if (parsed.success) {
      throw new ApiError({
        kind: 'http',
        status: res.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        path,
        ...(parsed.data.error.requestId ? { requestId: parsed.data.error.requestId } : {}),
      })
    }
    throw new ApiError({
      kind: 'http',
      status: res.status,
      message: describeHttpFailure(res.status),
      path,
    })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError({
      kind: 'invalid-response',
      status: res.status,
      message: '서버 응답이 예상한 형식과 다릅니다. 서버와 웹 버전이 맞는지 확인해 주세요.',
      path,
      cause: parsed.error,
    })
  }
  return parsed.data
}
