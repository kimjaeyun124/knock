const STORAGE_KEY = 'tetris.alertSound'

let enabled = read()
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

/** 알림 소리는 기본이 꺼짐이다. 이 브라우저에만 저장되며, 저장할 수 없어도 화면은 동작한다. */
export function isAlertSoundEnabled(): boolean {
  return enabled
}

export function setAlertSoundEnabled(next: boolean): void {
  enabled = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 이번 접속 동안만 유지된다.
  }
  listeners.forEach((listener) => listener())
}

export function subscribeAlertSound(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 짧은 알림음. 브라우저가 소리를 막았거나 지원하지 않으면 조용히 넘어간다. */
export function playAlertBeep(): void {
  try {
    const Ctx = window.AudioContext
    if (typeof Ctx !== 'function') return
    const context = new Ctx()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.value = 0.15
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.35)
    oscillator.onended = () => void context.close()
  } catch {
    // 소리를 낼 수 없어도 배너는 그대로 표시된다.
  }
}
