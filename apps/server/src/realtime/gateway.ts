import type { ServerToClientEvents } from '@tetris/shared'
import type { RealtimeServer } from './socket'
import { guardianRoom, householdRoom } from './rooms'

type EventName = keyof ServerToClientEvents
type EventArgs<E extends EventName> = Parameters<ServerToClientEvents[E]>

/**
 * 서비스 계층이 Socket.IO 를 직접 알지 않고 실시간 메시지를 보내는 통로.
 * HTTP 서버가 만들어진 뒤에 attach 로 연결한다. 연결 전에는 보낼 곳이 없는 것으로 취급한다.
 */
export class RealtimeGateway {
  private io: RealtimeServer | null = null

  attach(io: RealtimeServer): void {
    this.io = io
  }

  /** 같은 가구의 열려 있는 모든 화면에 데이터 갱신을 알린다. */
  emitToHousehold<E extends EventName>(householdId: string, event: E, ...args: EventArgs<E>): void {
    this.io?.to(householdRoom(householdId)).emit(event, ...args)
  }

  /** 한 보호자의 열려 있는 화면 수 */
  async countGuardianConnections(guardianId: string): Promise<number> {
    if (!this.io) return 0
    return (await this.io.in(guardianRoom(guardianId)).fetchSockets()).length
  }

  /** 한 보호자의 열려 있는 화면들에 보낸다. 받은 화면 수를 돌려준다. (0이면 아무도 받지 못함) */
  async emitToGuardian<E extends EventName>(
    guardianId: string,
    event: E,
    ...args: EventArgs<E>
  ): Promise<number> {
    if (!this.io) return 0
    const receivers = await this.countGuardianConnections(guardianId)
    if (receivers > 0) this.io.to(guardianRoom(guardianId)).emit(event, ...args)
    return receivers
  }
}
