// 브라우저 푸시를 받는 서비스 워커. 화면(탭)이 닫혀 있어도 서버가 보낸 알림을 보여 준다.
//
// 이 파일은 빌드되지 않고 그대로 배포된다. (테스트: src/lib/serviceWorker.test.ts 가 이 파일을 직접 실행해 확인)
// 푸시 내용(JSON)은 서버(WebPushAdapter)가 만든다: { type: 'alert' | 'test', title, body, alertId?, severity? }
// 개인정보나 내부 ID 는 담지 않으며, 알림을 누르면 앱의 해당 화면으로 이동한다.

/** 앱 안의 경로만 허용한다. (푸시 내용이 이상해도 다른 사이트로 보내지 않는다) */
function safePath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/'
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // 내용을 읽지 못해도 알림 자체는 보여 준다.
  }
  const isAlert = data.type === 'alert' && typeof data.alertId === 'string'
  const title =
    typeof data.title === 'string' && data.title !== '' ? data.title : '새 알림이 있습니다'
  const options = {
    body: typeof data.body === 'string' ? data.body : '앱에서 확인해 주세요.',
    // 같은 알림이 다시 오면(재알림) 새로 쌓지 않고 바꿔 보여 준다.
    tag: isAlert ? `alert-${data.alertId}` : 'tetris-test',
    // 긴급 알림은 사용자가 닫기 전까지 남겨 둔다.
    requireInteraction: data.severity === 'URGENT',
    data: {
      path: isAlert
        ? `/notifications/${encodeURIComponent(data.alertId)}`
        : '/settings/notifications',
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safePath(event.notification.data && event.notification.data.path)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows[0]
      if (existing) {
        // 이미 열려 있는 앱 화면이 있으면 그 화면을 해당 경로로 보낸다.
        return existing
          .focus()
          .then(() => ('navigate' in existing ? existing.navigate(path) : undefined))
      }
      return self.clients.openWindow(path)
    }),
  )
})
