import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Mark } from '../components/ui'
import { normalizeServerUrl } from '../lib/format'
import { useSession } from '../lib/session'
import { color, radius } from '../theme'

export default function LoginScreen() {
  const { serverUrl: savedUrl, signIn } = useSession()
  const [serverUrl, setServerUrl] = useState(savedUrl)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const url = normalizeServerUrl(serverUrl)
    if (!url) {
      setError('서버 주소를 http://주소:포트 형식으로 입력해 주세요.')
      return
    }
    if (email.trim() === '' || password === '') {
      setError('이메일과 비밀번호를 모두 입력해 주세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signIn(url, email.trim(), password)
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.canvas }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12 }}>
            <Mark size={56} />
            <Text style={s.title} accessibilityRole="header">
              노크
            </Text>
            <Text style={s.lead}>
              문을 두드리듯 가볍게,{'\n'}밤사이 움직임 알림을 이 휴대폰으로 받습니다.
            </Text>
          </View>

          <View style={s.form}>
            <Field
              label="서버 주소"
              value={serverUrl}
              onChangeText={setServerUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
            <Field
              label="이메일"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
            />
            <Field
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
            <Button
              label={busy ? '로그인 중…' : '로그인'}
              onPress={() => void submit()}
              busy={busy}
            />
          </View>

          <Text style={s.notice}>
            이 앱은 센서의 움직임 신호를 알려 주는 도구입니다. 넘어짐이나 외출 같은 상황을 판단하지
            않습니다. 알림이 없다고 괜찮다는 뜻은 아닙니다.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field(props: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { label, ...input } = props
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.inkMuted}
        style={s.input}
        {...input}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 24 },
  title: { fontSize: 34, fontWeight: '800', color: color.ink, letterSpacing: -0.5 },
  lead: { fontSize: 16, lineHeight: 24, color: color.inkMuted },
  form: { backgroundColor: color.surface, borderRadius: 24, padding: 20, gap: 14 },
  label: { fontSize: 14, fontWeight: '700', color: color.ink },
  input: {
    minHeight: 50,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 14,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.surface,
  },
  error: {
    color: color.dangerStrong,
    backgroundColor: color.dangerSoft,
    padding: 12,
    borderRadius: 14,
    fontWeight: '700',
  },
  notice: { fontSize: 13, lineHeight: 20, color: color.inkMuted },
})
