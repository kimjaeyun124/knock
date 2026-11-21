const KST = 'Asia/Seoul'

/** "방금 전", "5분 전", "3시간 전", 그보다 오래되면 날짜와 시각 (한국 시간) */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  if (diffMs < 0) return formatDateTime(iso)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return formatDateTime(iso)
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** 서버 주소를 정리한다: 앞뒤 공백·끝의 / 를 없애고 http(s) 만 받는다. 잘못되면 null */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

/** 아이폰은 webm 을 재생하지 못한다. (웹캠이 mp4 를 지원하지 않는 브라우저에서 녹화한 영상) */
export function canPlayOnDevice(mimeType: string, os: string): boolean {
  return !(os === 'ios' && mimeType === 'video/webm')
}
