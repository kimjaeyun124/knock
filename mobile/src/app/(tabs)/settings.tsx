import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Card } from '../../components/ui'
import { useData } from '../../lib/data'
import {
  notificationPermission,
  prepareNotifications,
  showAlertNotification,
} from '../../lib/notify'
import { useSession } from '../../lib/session'
import { color } from '../../theme'

function Row({
  title,
  hint,
  value,
  onChange,
}: {
  title: string
  hint: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.hint}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.brand, false: color.lineStrong }}
        thumbColor={color.surface}
      />
    </View>
  )
}

export default function SettingsScreen() {
  const { profile, serverUrl, prefs, setPrefs, signOut } = useSession()
  const { connection } = useData()
  const [granted, setGranted] = useState<boolean | null>(null)
  const [testNote, setTestNote] = useState<string | null>(null)

  useEffect(() => {
    void notificationPermission().then(setGranted)
  }, [])

  const sendTest = async () => {
    const ok = await prepareNotifications()
    setGranted(ok)
    if (!ok) {
      setTestNote('휴대폰 알림이 허용되지 않았습니다. 기기 설정에서 노크 알림을 허용해 주세요.')
      return
    }
    await showAlertNotification(
      {
        id: 'test',
        type: 'TEST',
        severity: 'NOTICE',
        status: 'OPEN',
        origin: 'SIMULATED',
        title: '테스트 알림입니다',
        message: '이 휴대폰으로 노크 알림을 받을 수 있습니다. 실제 상황이 아닙니다.',
        sensorName: null,
        triggeredAt: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
        occurrences: 1,
        acknowledgedAt: null,
        resolvedAt: null,
      },
      { sound: prefs.sound, urgentOnly: false },
    )
    setTestNote('테스트 알림을 보냈습니다. 휴대폰 알림이 보이는지 확인해 주세요.')
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView contentContainerStyle={s.container}>
        <View>
          <Text style={s.h1} accessibilityRole="header">
            설정
          </Text>
          <Text style={s.sub}>
            {profile ? `${profile.guardian.email} · ${profile.guardian.displayName}` : ''}
          </Text>
        </View>

        <Card style={{ paddingVertical: 4 }}>
          <Row
            title="알림 소리와 진동"
            hint="새 알림이 오면 소리와 진동으로 알립니다"
            value={prefs.sound}
            onChange={(v) => void setPrefs({ sound: v })}
          />
          <View style={s.divider} />
          <Row
            title="긴급 알림만 받기"
            hint={'"즉시 확인 권장"만 휴대폰 알림으로 띄웁니다 (목록에는 모두 나옵니다)'}
            value={prefs.urgentOnly}
            onChange={(v) => void setPrefs({ urgentOnly: v })}
          />
          <View style={s.divider} />
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>휴대폰 알림 권한</Text>
              <Text
                style={[
                  s.hint,
                  { color: granted ? color.okStrong : color.dangerStrong, fontWeight: '700' },
                ]}
              >
                {granted === null ? '확인하는 중' : granted ? '허용됨' : '허용되지 않음'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openSettings()}
              style={s.linkButton}
            >
              <Text style={s.link}>기기 설정</Text>
            </Pressable>
          </View>
        </Card>

        <Button label="테스트 알림 보내기" variant="secondary" onPress={() => void sendTest()} />
        {testNote ? (
          <Text accessibilityRole="alert" style={s.note}>
            {testNote}
          </Text>
        ) : null}

        <Card style={{ gap: 12 }}>
          <View>
            <Text style={s.rowTitle}>서버</Text>
            <Text style={s.hint}>
              {serverUrl} ·{' '}
              {connection === 'connected'
                ? '실시간 연결됨'
                : connection === 'connecting'
                  ? '연결하는 중'
                  : '연결 끊김'}
            </Text>
          </View>
          <View>
            <Text style={s.rowTitle}>화면이 꺼져 있거나 앱이 닫혀 있을 때</Text>
            <Text style={[s.hint, { color: color.warnStrong }]}>
              이 버전은 앱이 실행 중일 때 실시간 연결로 알림을 받습니다. 앱을 완전히 닫으면 알림이
              오지 않을 수 있습니다. (푸시 서버 연동 전)
            </Text>
          </View>
        </Card>

        <Button label="로그아웃" variant="danger" onPress={() => void signOut()} />

        <Text style={s.foot}>
          위급하다고 느끼면 이 앱을 기다리지 말고 직접 확인하거나 119 등 긴급 연락처에 연락해
          주세요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { padding: 20, gap: 14, paddingBottom: 32 },
  h1: { fontSize: 26, fontWeight: '800', color: color.ink, letterSpacing: -0.4 },
  sub: { marginTop: 4, fontSize: 14, color: color.inkMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  hint: { marginTop: 2, fontSize: 13, lineHeight: 19, color: color.inkMuted },
  divider: { height: 1, backgroundColor: color.line },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: {
    fontSize: 14,
    fontWeight: '700',
    color: color.brandStrong,
    textDecorationLine: 'underline',
  },
  note: { fontSize: 14, color: color.ink, fontWeight: '600' },
  foot: { fontSize: 12, lineHeight: 18, color: color.inkMuted },
})
