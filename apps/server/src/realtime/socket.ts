import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@tetris/shared'
import { SESSION_COOKIE_NAME } from '@/config/auth'
import type { Env } from '@/config/env'
import type { AuthContext, SessionService } from '@/services/session.service'
import { parseCookies } from '@/utils/cookies'
import type { Logger } from '@/utils/logger'
import { isAllowedOrigin } from '@/utils/origin'
import { guardianRoom, householdRoom, sessionRoom } from './rooms'

interface SocketData {
  auth: AuthContext
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>

export { guardianRoom, householdRoom, sessionRoom }

/**
 * Socket.IO 서버.
 *
 * 연결하려면 로그인 세션 쿠키가 필요하다. 웹소켓은 브라우저의 CORS 대상이 아니므로
 * 다른 사이트가 보호자의 쿠키로 연결을 시도하지 못하게 Origin 도 직접 검사한다.
 * 연결되면 가구·보호자·세션별 방에 들어간다. 이벤트 발행은 RealtimeGateway 가 맡는다.
 */
export function createRealtimeServer(
  httpServer: HttpServer,
  deps: { env: Pick<Env, 'CLIENT_ORIGIN'>; logger: Logger; sessions: SessionService },
): RealtimeServer {
  const { env, logger, sessions } = deps

  const io: RealtimeServer = new Server(httpServer, {
    serveClient: false,
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin
      const allowed = !origin || isAllowedOrigin(origin, [env.CLIENT_ORIGIN], req.headers.host)
      callback(allowed ? null : 'origin not allowed', allowed)
    },
  })

  io.use((socket, next) => {
    // 웹은 쿠키, 휴대폰 앱은 연결할 때 auth.token 으로 세션 토큰을 보낸다.
    const handshakeAuth = socket.handshake.auth as { token?: unknown } | undefined
    const appToken =
      typeof handshakeAuth?.token === 'string' &&
      /^[A-Za-z0-9_-]{20,200}$/.test(handshakeAuth.token)
        ? handshakeAuth.token
        : undefined
    const token = parseCookies(socket.handshake.headers.cookie).get(SESSION_COOKIE_NAME) ?? appToken
    const pending = token ? sessions.validate(token) : Promise.resolve(null)
    pending
      .then((auth) => {
        if (!auth) {
          next(new Error('UNAUTHORIZED'))
          return
        }
        socket.data.auth = auth
        next()
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'realtime 인증 중 오류')
        next(new Error('INTERNAL_ERROR'))
      })
  })

  io.on('connection', (socket) => {
    const { auth } = socket.data
    void socket.join([
      householdRoom(auth.householdId),
      sessionRoom(auth.sessionId),
      guardianRoom(auth.guardianId),
    ])
    logger.debug({ socketId: socket.id, householdId: auth.householdId }, 'realtime 연결')
    socket.emit('server:ready', { serverTime: new Date().toISOString() })
    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'realtime 연결 종료')
    })
  })

  // 로그아웃하거나 세션이 만료되면 그 세션의 실시간 연결도 즉시 끊는다.
  sessions.onRevoke((sessionId) => {
    io.in(sessionRoom(sessionId)).disconnectSockets(true)
  })

  return io
}
