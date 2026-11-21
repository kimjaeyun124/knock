import { Link } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Pill } from '../../components/ui'
import { useData } from '../../lib/data'
import { formatRelative } from '../../lib/format'
import { SEVERITY, STATUS_LABELS } from '../../lib/labels'
import type { Alert } from '../../lib/types'
import { color } from '../../theme'

function AlertRow({ alert }: { alert: Alert }) {
  const sev = SEVERITY[alert.severity]
  const urgentOpen = alert.severity === 'URGENT' && alert.status === 'OPEN'
  return (
    <Link href={`/alert/${alert.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${sev.label}, ${alert.title}, ${STATUS_LABELS[alert.status]}${alert.read === false ? ', 읽지 않음' : ''}`}
        style={({ pressed }) => [
          s.card,
          urgentOpen ? s.urgent : null,
          alert.status === 'RESOLVED' ? { opacity: 0.8 } : null,
          pressed ? { opacity: 0.85 } : null,
        ]}
      >
        <View style={s.cardTop}>
          {/* 진행 중이면 심각도, 확인했으면 초록 "확인함", 종료했으면 회색 "종료함" */}
          <Pill
            tone={
              alert.status === 'OPEN' ? sev.tone : alert.status === 'ACKNOWLEDGED' ? 'ok' : 'muted'
            }
          >
            {alert.status === 'OPEN' ? sev.label : STATUS_LABELS[alert.status]}
          </Pill>
          {alert.read === false ? <View style={s.dot} accessibilityLabel="읽지 않음" /> : null}
          <Text style={s.time}>{formatRelative(alert.lastEventAt)}</Text>
        </View>
        <Text style={s.title}>{alert.title}</Text>
        <Text style={s.message} numberOfLines={2}>
          {alert.message}
        </Text>
        {alert.origin === 'SIMULATED' ? (
          <Text style={s.sim}>시뮬레이션 · 실제 상황이 아닙니다</Text>
        ) : null}
      </Pressable>
    </Link>
  )
}

export default function AlertsScreen() {
  const { alerts, unread, refreshing, refresh, error } = useData()
  const [tab, setTab] = useState<'all' | 'open'>('all')
  const list = (alerts ?? []).filter((a) => (tab === 'all' ? true : a.status !== 'RESOLVED'))
  const openCount = (alerts ?? []).filter((a) => a.status !== 'RESOLVED').length

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.canvas }}>
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AlertRow alert={item} />}
        contentContainerStyle={s.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={color.brand}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View>
              <Text style={s.h1} accessibilityRole="header">
                알림
              </Text>
              <Text style={s.sub}>
                읽지 않은 알림 {unread}건 · 진행 중 {openCount}건
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
              {(['all', 'open'] as const).map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === key }}
                  onPress={() => setTab(key)}
                  style={[s.tab, tab === key ? s.tabOn : null]}
                >
                  <Text style={[s.tabText, tab === key ? { color: color.inkInverse } : null]}>
                    {key === 'all' ? '전체' : '진행 중'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          alerts === null ? undefined : (
            <Text style={s.empty}>
              {tab === 'all' ? '알림이 없습니다.' : '진행 중인 알림이 없습니다.'}
            </Text>
          )
        }
        ListFooterComponent={
          <Text style={s.foot}>
            읽음 표시는 처리와 별개입니다. 직접 확인한 뒤 알림 상세에서 “확인했습니다”를 눌러
            주세요.
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { padding: 20, paddingBottom: 32 },
  h1: { fontSize: 26, fontWeight: '800', color: color.ink, letterSpacing: -0.4 },
  sub: { marginTop: 4, fontSize: 14, color: color.inkMuted },
  tab: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: color.ink, borderColor: color.ink },
  tabText: { fontSize: 14, fontWeight: '700', color: color.ink },
  card: { backgroundColor: color.surface, borderRadius: 22, padding: 16, gap: 4 },
  urgent: { borderWidth: 2, borderColor: color.danger },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand },
  time: { marginLeft: 'auto', fontSize: 12, color: color.inkMuted },
  title: { marginTop: 8, fontSize: 17, fontWeight: '800', color: color.ink, lineHeight: 24 },
  message: { fontSize: 14, lineHeight: 21, color: color.ink },
  sim: { marginTop: 4, fontSize: 12, fontWeight: '700', color: color.warnStrong },
  error: { color: color.dangerStrong, fontWeight: '700' },
  empty: { paddingVertical: 32, textAlign: 'center', color: color.inkMuted, fontSize: 15 },
  foot: { marginTop: 16, fontSize: 13, lineHeight: 20, color: color.inkMuted },
})
