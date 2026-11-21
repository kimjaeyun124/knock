import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AlertPayload } from '@tetris/shared'
import { applyRealtimeAlert } from '@/lib/alertCache'
import { queryKeys } from '@/lib/queryKeys'
import { socket } from '@/lib/socket'

/**
 * 실시간 이벤트를 받으면 관련 화면 데이터를 다시 가져온다.
 * 소켓 메시지는 "바뀌었다"는 신호로만 쓰고, 내용은 항상 서버 API에서 다시 읽는다.
 * 연결될 때마다(처음 포함) 전부 다시 가져와서, 끊겨 있던 동안과
 * 첫 조회 직후 연결되기 전 사이에 놓친 변화를 보충한다.
 * 연결이 끊기면 서버 상태·센서·알림을 바로 다시 확인한다. 확인에 실패하면 화면이
 * 오래된 값을 현재 상태처럼 보여 주지 않고 실패로 알린다.
 */
export function useRealtimeSync(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    // 대시보드·움직임 기록은 센서·움직임·알림·설정을 모아 보여 주므로, 어느 것이 바뀌어도 한 번 더 다시 읽는다.
    const refresh = (...queryKeys_: readonly (readonly unknown[])[]) => {
      for (const queryKey of queryKeys_) void queryClient.invalidateQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      // 움직임 기록(타임라인)도 신호·센서 상태·알림이 바뀌면 함께 다시 읽는다.
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeline.all })
    }
    // 알림은 도착한 내용을 목록에 ID 기준으로 먼저 반영하고(중복 없이), 서버 값으로 다시 맞춘다.
    const onAlertCreated = (payload?: { alert?: AlertPayload['alert'] }) => {
      if (payload?.alert) applyRealtimeAlert(queryClient, payload.alert, { created: true })
      refresh(queryKeys.alerts.all)
    }
    const onAlertUpdated = (payload?: { alert?: AlertPayload['alert'] }) => {
      if (payload?.alert) applyRealtimeAlert(queryClient, payload.alert, { created: false })
      refresh(queryKeys.alerts.all)
    }
    const onAlertChanged = () => refresh(queryKeys.alerts.all)
    const onEventCreated = () => refresh(queryKeys.events.all)
    const onSensorStatus = () => refresh(queryKeys.sensors.all)
    const onSettingsUpdated = () => refresh(queryKeys.settings.detection)
    // 모니터링 상태(사용 여부·연결된 센서 수)가 바뀌었다. 대시보드의 모니터링 카드와 센서·설정을 다시 읽는다.
    const onMonitoringStatus = () => refresh(queryKeys.sensors.all, queryKeys.settings.detection)
    const onDisconnect = () =>
      refresh(queryKeys.health, queryKeys.sensors.all, queryKeys.alerts.all)
    const onConnect = () =>
      refresh(
        queryKeys.health,
        queryKeys.alerts.all,
        queryKeys.events.all,
        queryKeys.sensors.all,
        queryKeys.settings.detection,
      )

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('alert.created', onAlertCreated)
    socket.on('alert.updated', onAlertUpdated)
    // 이 보호자가 다른 화면(기기)에서 읽음 처리했다. 목록과 읽지 않은 수를 다시 읽는다.
    socket.on('alert.read', onAlertChanged)
    socket.on('delivery.updated', onAlertChanged)
    socket.on('event.created', onEventCreated)
    socket.on('sensor.status', onSensorStatus)
    socket.on('settings.updated', onSettingsUpdated)
    socket.on('monitoring.status', onMonitoringStatus)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('alert.created', onAlertCreated)
      socket.off('alert.updated', onAlertUpdated)
      socket.off('alert.read', onAlertChanged)
      socket.off('delivery.updated', onAlertChanged)
      socket.off('event.created', onEventCreated)
      socket.off('sensor.status', onSensorStatus)
      socket.off('settings.updated', onSettingsUpdated)
      socket.off('monitoring.status', onMonitoringStatus)
    }
  }, [queryClient])
}
