import { Link } from 'expo-router'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { Card, Mark, Pill, StatusIcon } from '../../components/ui'
import { useData } from '../../lib/data'
import { formatRelative } from '../../lib/format'
import { ZONE_LABELS } from '../../lib/labels'
import { useSession } from '../../lib/session'
import { deriveOverallStatus } from '../../lib/status'
import type { Sensor } from '../../lib/types'
import { color, tones } from '../../theme'

function sensorLine(sensor: Sensor): { tone: 'ok' | 'warn' | 'danger' | 'muted'; text: string } {
  if (sensor.state === 'OFFLINE') return { tone: 'danger', text: '연결 끊김' }
  if (sensor.state === 'PENDING') return { tone: 'muted', text: '첫 신호 대기' }
  if (sensor.batteryPercent !== null && sensor.batteryPercent <= 20) {
    return { tone: 'warn', text: `배터리 ${sensor.batteryPercent}%` }
  }
  return { tone: 'ok', text: '연결됨' }
}

export default function HomeScreen() {
  const { profile } = useSession()
  const { alerts, sensors, connection, lastUpdated, error, refreshing, refresh, unread } = useData()
  const overall = deriveOverallStatus({ alerts, sensors, connected: connection === 'connected' })
  const t = tones[overall.tone]
  const active = (sensors ?? []).filter((s) => s.isActive)
  const simulated = active.some((s) => s.origin === 'SIMULATED')

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={color.brand}
          />
        }
      >
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Mark size={30} />
            <Text style={s.brand}>노크</Text>
          </View>
          {unread > 0 ? <Pill tone="brand">읽지 않은 알림 {unread}건</Pill> : null}
        </View>

        <View>
          <Text style={s.muted}>{profile?.household.name ?? ''}</Text>
          <Text style={s.h1} accessibilityRole="header">
            지금 상태
          </Text>
        </View>

        {error ? (
          <Card style={{ backgroundColor: color.dangerSoft }}>
            <Text
              accessibilityRole="alert"
              style={{ color: color.dangerStrong, fontWeight: '700' }}
            >
              {error}
            </Text>
          </Card>
        ) : null}

        <View
          accessibilityRole="summary"
          accessibilityLabel={`현재 상태: ${overall.label}. ${overall.headline}`}
          style={[
            s.hero,
            { backgroundColor: t.bg },
            overall.tone === 'danger' ? { borderWidth: 2, borderColor: color.danger } : null,
          ]}
        >
          <Svg width={220} height={220} viewBox="0 0 200 200" style={s.ripple} accessible={false}>
            {[28, 56, 84].map((r) => (
              <Circle
                key={r}
                cx={100}
                cy={100}
                r={r}
                fill="none"
                stroke={t.fg}
                strokeWidth={6}
                opacity={0.14}
              />
            ))}
          </Svg>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={s.heroIcon}>
              <StatusIcon tone={overall.tone} size={28} />
            </View>
            <Text style={[s.heroLabel, { color: t.fg }]}>{overall.label}</Text>
          </View>
          <Text style={s.heroHeadline}>{overall.headline}</Text>
          <Text style={s.heroHint}>
            센서 신호를 기준으로 한 표시이며, 어르신의 상태를 보장하는 것은 아닙니다.
          </Text>
          {overall.alertId ? (
            <Link href={`/alert/${overall.alertId}`} style={s.heroLink}>
              알림 자세히 보기
            </Link>
          ) : null}
          <Text style={s.heroMeta}>
            마지막 업데이트: {lastUpdated ? formatRelative(lastUpdated.toISOString()) : '아직 없음'}
          </Text>
        </View>

        <View style={s.chips}>
          {connection === 'connected' ? (
            <Pill tone="ok">실시간 연결됨</Pill>
          ) : connection === 'connecting' ? (
            <Pill tone="muted">연결하는 중</Pill>
          ) : (
            <Pill tone="danger">실시간 연결 끊김 · 다시 시도 중</Pill>
          )}
          {simulated ? <Pill tone="warn">시뮬레이션 센서 사용 중</Pill> : null}
        </View>

        <Card style={{ paddingVertical: 6 }}>
          {active.length === 0 ? (
            <Text style={[s.muted, { paddingVertical: 12 }]}>사용 중인 센서가 없습니다.</Text>
          ) : (
            active.map((sensor, i) => {
              const line = sensorLine(sensor)
              return (
                <View key={sensor.id} style={[s.row, i < active.length - 1 ? s.rowBorder : null]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{ZONE_LABELS[sensor.zone]}</Text>
                    <Text style={s.muted}>
                      {sensor.name}
                      {sensor.lastSeenAt
                        ? ` · 마지막 신호 ${formatRelative(sensor.lastSeenAt)}`
                        : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <StatusIcon tone={line.tone} size={14} />
                    <Text style={{ color: tones[line.tone].fg, fontWeight: '700', fontSize: 13 }}>
                      {line.text}
                    </Text>
                  </View>
                </View>
              )
            })
          )}
        </Card>

        <Text style={s.footnote}>
          앱이 실행 중일 때 새 알림을 휴대폰 알림으로 띄웁니다. 앱을 완전히 닫으면 알림이 오지 않을
          수 있습니다. 위급하다고 느끼면 앱을 기다리지 말고 직접 확인하거나 119 등 긴급 연락처에
          연락해 주세요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 22, fontWeight: '800', color: color.ink, letterSpacing: -0.4 },
  h1: { fontSize: 26, fontWeight: '800', color: color.ink, letterSpacing: -0.4 },
  muted: { fontSize: 13, color: color.inkMuted },
  hero: { borderRadius: 24, padding: 22, overflow: 'hidden', gap: 6 },
  ripple: { position: 'absolute', top: -70, right: -70 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 },
  heroHeadline: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '700',
    color: color.ink,
    lineHeight: 24,
  },
  heroHint: { fontSize: 14, lineHeight: 21, color: color.ink },
  heroLink: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '800',
    color: color.brandStrong,
    textDecorationLine: 'underline',
    paddingVertical: 8,
  },
  heroMeta: { marginTop: 6, fontSize: 13, color: color.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.line },
  rowTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  footnote: { fontSize: 12, lineHeight: 18, color: color.inkMuted },
})
