import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { color, radius, tones, type Tone } from '../theme'

/** 노크 마크: 아치형 문 + 노크 노랑 문고리 + 두드리는 소리의 호 (장식) */
export function Mark({ size = 30, tint = color.brand }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessible={false}>
      <Path d="M5 28V14a8 8 0 0 1 16 0v14z" fill={tint} />
      <Circle cx={16.8} cy={21.5} r={1.9} fill={color.accent} />
      <Path
        d="M24.5 11.5a5.5 5.5 0 0 1 0 7M28 8.5a9.5 9.5 0 0 1 0 13"
        fill="none"
        stroke={tint}
        strokeLinecap="round"
        strokeWidth={2.2}
      />
    </Svg>
  )
}

/** 상태 아이콘. 색만으로 구분하지 않도록 모양이 다르다. */
export function StatusIcon({ tone, size = 18 }: { tone: Tone; size?: number }) {
  const stroke = tones[tone].icon
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {tone === 'ok' ? (
        <>
          <Circle cx={12} cy={12} r={10} />
          <Path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </>
      ) : tone === 'danger' ? (
        <>
          <Circle cx={12} cy={12} r={10} />
          <Path d="M12 8v4" />
          <Path d="M12 16h.01" />
        </>
      ) : tone === 'warn' ? (
        <>
          <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <Path d="M12 9v4" />
          <Path d="M12 17h.01" />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={10} />
          <Path d="M12 16v-4" />
          <Path d="M12 8h.01" />
        </>
      )}
    </Svg>
  )
}

/** 상태 배지: 색 + 아이콘 + 글자 */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = tones[tone]
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <StatusIcon tone={tone} size={14} />
      <Text style={[styles.pillText, { color: t.fg }]}>{children}</Text>
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  busy?: boolean
  disabled?: boolean
}) {
  const v =
    variant === 'primary'
      ? { bg: color.brand, fg: color.inkInverse, border: color.brand }
      : variant === 'danger'
        ? { bg: color.surface, fg: color.dangerStrong, border: color.danger }
        : { bg: color.surface, fg: color.ink, border: color.lineStrong }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={v.fg} /> : null}
      <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
    </Pressable>
  )
}

export const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 18 },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '800' },
})
