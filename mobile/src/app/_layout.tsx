import { Stack, useRouter, useSegments } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { DataProvider } from '../lib/data'
import { prepareNotifications } from '../lib/notify'
import { SessionProvider, useSession } from '../lib/session'
import { color } from '../theme'

/** 로그인 여부에 따라 로그인 화면과 앱 화면을 오간다. 휴대폰 알림을 누르면 그 알림 상세로 간다. */
function Gate() {
  const { status } = useSession()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    const onLogin = segments[0] === 'login'
    if (status === 'signedOut' && !onLogin) router.replace('/login')
    if (status === 'signedIn' && onLogin) router.replace('/')
  }, [status, segments, router])

  useEffect(() => {
    if (status !== 'signedIn') return
    void prepareNotifications()
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const alertId = response.notification.request.content.data?.alertId
      if (typeof alertId === 'string') router.push(`/alert/${alertId}`)
    })
    return () => sub.remove()
  }, [status, router])

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.canvas,
        }}
      >
        <ActivityIndicator color={color.brand} />
      </View>
    )
  }
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen
        name="alert/[id]"
        options={{
          headerShown: true,
          title: '알림 상세',
          headerBackTitle: '알림',
          headerTintColor: color.ink,
          headerStyle: { backgroundColor: color.canvas },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  )
  // 로그아웃 상태에서는 DataProvider 가 아무 연결도 하지 않는다. (토큰이 없으면 바로 멈춤)
  return <DataProvider>{stack}</DataProvider>
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  )
}
