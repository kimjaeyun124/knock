import { useLocalSearchParams } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useCallback, useEffect, useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, Pill } from '../../components/ui'
import { useData } from '../../lib/data'
import { canPlayOnDevice, formatDateTime, formatTime } from '../../lib/format'
import { SEVERITY, STATUS_LABELS, ZONE_LABELS } from '../../lib/labels'
import { useSession } from '../../lib/session'
import type { AlertClip, AlertDetail } from '../../lib/types'
import { color } from '../../theme'

function ClipPlayer({ clip, index }: { clip: AlertClip; index: number }) {
  if (!canPlayOnDevice(clip.mimeType, Platform.OS)) {
    return (
      <View style={[s.video, { alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
        <Text
          style={{
            color: color.inkInverse,
            fontWeight: '700',
            textAlign: 'center',
            lineHeight: 21,
          }}
        >
          이 영상(webm)은 아이폰에서 재생할 수 없는 형식입니다. 웹의 알림 상세나 안드로이드 앱에서
          볼 수 있습니다.
        </Text>
      </View>
    )
  }
  return <PlayableClip clip={clip} index={index} />
}

function PlayableClip({ clip, index }: { clip: AlertClip; index: number }) {
  const { api } = useSession()
  const player = useVideoPlayer(api.clipSource(clip), (p) => {
    p.loop = false
  })
  return (
    <View style={{ gap: 6 }}>
      <VideoView
        player={player}
        style={s.video}
        nativeControls
        contentFit="cover"
        accessibilityLabel={`알림 영상 ${index + 1}`}
      />
      <Text style={s.hint}>
        {formatDateTime(clip.createdAt)}
        {clip.durationMs ? ` · 약 ${Math.round(clip.durationMs / 1000)}초` : ''}
      </Text>
    </View>
  )
}

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { api } = useSession()
  const { refresh } = useData()
  const [detail, setDetail] = useState<AlertDetail | null>(null)
  const [clips, setClips] = useState<AlertClip[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null)

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api.alert(id), api.clips(id).catch(() => ({ clips: [] }))])
      setDetail(d)
      setClips(c.clips)
      setError(null)
      if (d.alert.read === false) {
        await api.markRead(id).catch(() => undefined)
        void refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알림을 불러오지 못했습니다.')
    }
  }, [api, id, refresh])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    // 영상은 알림보다 몇 초 늦게 붙으므로 잠시 뒤 한 번 더 읽는다.
    const timer = setTimeout(() => void load(), 6000)
    return () => {
      clearTimeout(first)
      clearTimeout(timer)
    }
  }, [load])

  const act = async (kind: 'ack' | 'resolve') => {
    setBusy(kind)
    try {
      if (kind === 'ack') await api.acknowledge(id)
      else await api.resolve(id)
      await load()
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  if (!detail) {
    return (
      <View style={[s.container, { flex: 1 }]}>
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : (
          <Text style={s.hint}>불러오는 중…</Text>
        )}
      </View>
    )
  }
  const { alert, evidence } = detail
  const sev = SEVERITY[alert.severity]

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill tone={sev.tone}>{sev.label}</Pill>
        <Pill tone={alert.status === 'OPEN' ? 'muted' : 'ok'}>{STATUS_LABELS[alert.status]}</Pill>
        {alert.origin === 'SIMULATED' ? <Pill tone="warn">시뮬레이션</Pill> : null}
      </View>
      <Text style={s.title} accessibilityRole="header">
        {alert.title}
      </Text>
      <Text style={s.body}>{alert.message}</Text>
      <Text style={s.hint}>
        {formatDateTime(alert.triggeredAt)} · 신호 {alert.occurrences}건
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}

      {clips.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <Text style={s.cardTitle}>알림과 함께 온 영상</Text>
          {clips.map((clip, i) => (
            <ClipPlayer key={clip.id} clip={clip} index={i} />
          ))}
          <Text style={s.hint}>
            알림이 만들어진 순간부터 약 4초 녹화했습니다. 7일 뒤 자동으로 지워집니다.
          </Text>
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 6 }}>
        <Text style={[s.cardTitle, { paddingTop: 10 }]}>근거가 된 신호</Text>
        {evidence.length === 0 ? (
          <Text style={[s.hint, { paddingVertical: 10 }]}>연결된 움직임 신호가 없습니다.</Text>
        ) : (
          evidence.map((e, i) => (
            <View key={e.eventId} style={[s.row, i < evidence.length - 1 ? s.rowBorder : null]}>
              <Text style={{ fontWeight: '700', color: color.ink }}>
                {formatTime(e.occurredAt)}
              </Text>
              <Text style={{ color: color.ink }}>
                {ZONE_LABELS[e.zone]} · {e.sensorName}
                {e.isLate ? ' · 지연 수신' : ''}
              </Text>
            </View>
          ))
        )}
      </Card>

      {alert.status !== 'RESOLVED' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {alert.status === 'OPEN' ? (
            <View style={{ flex: 1.4 }}>
              <Button label="확인했습니다" onPress={() => void act('ack')} busy={busy === 'ack'} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button
              label="알림 종료"
              variant="secondary"
              onPress={() => void act('resolve')}
              busy={busy === 'resolve'}
            />
          </View>
        </View>
      ) : null}
      <Text style={s.hint}>읽음 표시는 처리와 별개입니다. 상황을 직접 확인한 뒤 눌러 주세요.</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: color.ink, lineHeight: 30, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 23, color: color.ink },
  hint: { fontSize: 13, lineHeight: 19, color: color.inkMuted },
  error: { color: color.dangerStrong, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: color.ink },
  video: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: color.video },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.line },
})
