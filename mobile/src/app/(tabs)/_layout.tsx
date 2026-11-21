import { Tabs } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'
import { useData } from '../../lib/data'
import { color } from '../../theme'

function Icon({ name, tint }: { name: 'home' | 'bell' | 'gear'; tint: string }) {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tint}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {name === 'home' ? (
        <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      ) : null}
      {name === 'bell' ? (
        <>
          <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </>
      ) : null}
      {name === 'gear' ? (
        <>
          <Circle cx={12} cy={12} r={3} />
          <Path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </>
      ) : null}
    </Svg>
  )
}

export default function TabsLayout() {
  const { unread } = useData()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brandStrong,
        tabBarInactiveTintColor: color.inkMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line, minHeight: 64 },
        sceneStyle: { backgroundColor: color.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '지금 상태',
          tabBarIcon: ({ color: c }) => <Icon name="home" tint={String(c)} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: '알림',
          tabBarIcon: ({ color: c }) => <Icon name="bell" tint={String(c)} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarAccessibilityLabel: unread > 0 ? `알림, 읽지 않은 알림 ${unread}건` : '알림',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color: c }) => <Icon name="gear" tint={String(c)} />,
        }}
      />
    </Tabs>
  )
}
