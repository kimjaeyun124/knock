import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clearSimulated, resetState } from '../support/api'

/**
 * 웹캠 움직임 감지 (시연용). Chrome 의 가짜 카메라로 실제 브라우저 경로를 확인한다.
 * 진짜 카메라나 진짜 사람의 움직임으로 확인한 것이 아니다.
 *
 * Chrome 기본 가짜 화면은 작은 도형만 움직여 (판정을 엄격하게 올린 뒤에는) 움직임으로 잡히지 않는다.
 * 그래서 화면 전체가 검정↔흰색으로 크게 바뀌는 영상 파일(Y4M)을 만들어 가짜 카메라로 쓴다.
 * (검정 7프레임 → 흰색 7프레임 반복. 샘플링 간격과 주기가 어긋나 계속 크게 변한다)
 */
function writeFlashingVideo(): string {
  const width = 160
  const height = 120
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`)
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128)
  const frame = (luma: number) =>
    Buffer.concat([Buffer.from('FRAME\n'), Buffer.alloc(width * height, luma), chroma, chroma])
  const frames: Buffer[] = []
  for (let i = 0; i < 28; i += 1) frames.push(frame(i % 14 < 7 ? 16 : 235))
  const file = join(tmpdir(), 'knock-e2e-fake-camera.y4m')
  writeFileSync(file, Buffer.concat([header, ...frames]))
  return file
}

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${writeFlashingVideo()}`,
    ],
  },
})

test.beforeEach(async ({ request }) => {
  await resetState(request)
  await clearSimulated(request)
})

test('영상 첨부를 끄면: 가짜 카메라의 움직임이 서버의 시뮬레이션 신호와 알림이 되고, 영상은 서버로 가지 않는다', async ({
  page,
  request,
}) => {
  const posts: { url: string; size: number }[] = []
  const external: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) external.push(req.url())
    if (req.method() !== 'GET')
      posts.push({ url: url.pathname, size: req.postDataBuffer()?.length ?? 0 })
  })

  await page.goto('/dev/webcam')
  await expect(page.getByRole('heading', { name: '웹캠 움직임 감지' })).toBeVisible()
  // 기본은 "알림에 영상 첨부"가 켜져 있다. 이 시험은 끄고 영상이 나가지 않는지 본다.
  await expect(page.getByText('알림에 영상 첨부 켜짐')).toBeVisible()
  await page.getByRole('checkbox', { name: /그 순간의 영상/ }).uncheck()
  await expect(page.getByText('카메라 영상은 이 브라우저 안에서만 처리합니다')).toBeVisible()
  await expect(page.getByText('카메라 꺼짐')).toBeVisible()

  // 기본값 확인: 3구역 나누기 + 민감도 낮음. (여기서는 가짜 카메라의 작은 변화가 잡히도록 한 구역·높음으로 바꾼다)
  await expect(page.getByLabel('화면 나누기')).toHaveValue('split')
  await expect(page.getByLabel('움직임 민감도')).toHaveValue('LOW')
  await page.getByLabel('화면 나누기').selectOption('single')
  await page.getByLabel('이 카메라가 보는 구역').selectOption('ENTRANCE')
  await page.getByLabel('움직임 민감도').selectOption('HIGH')
  // 이 E2E 서버는 하루 종일이 야간이라 옵션과 관계없이 알림 규칙이 적용된다. (낮에도 켜져 있다면 그대로 둔다)
  await page.getByRole('button', { name: '카메라 시작' }).click()
  await expect(page.getByText('카메라 켜짐')).toBeVisible()
  await expect(page.getByRole('button', { name: '카메라 끄기' })).toBeVisible()

  // 미리보기에 실제로 화면이 들어오고 있다
  const preview = page.getByLabel('카메라 미리보기')
  await expect
    .poll(() => preview.evaluate((v) => (v as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0)

  // 움직임이 확정되어 서버에 신호가 간다
  await expect(page.getByText(/지금까지 움직임 [1-9]\d*번 감지/)).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(
      async () =>
        (
          (await (await request.get('/api/events?limit=50')).json()) as {
            events: { zone: string; origin: string }[]
          }
        ).events.filter((e) => e.zone === 'ENTRANCE' && e.origin === 'SIMULATED').length,
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(1)
  await expect
    .poll(
      async () =>
        (
          (await (await request.get('/api/alerts?limit=50')).json()) as {
            alerts: { type: string; origin: string }[]
          }
        ).alerts.some((a) => a.type === 'ENTRANCE_APPROACH' && a.origin === 'SIMULATED'),
      { timeout: 20_000 },
    )
    .toBe(true)

  // 끄면 카메라가 멈춘다
  await page.getByRole('button', { name: '카메라 끄기' }).click()
  await expect(page.getByText('카메라 꺼짐')).toBeVisible()
  await expect
    .poll(() => preview.evaluate((v) => (v as HTMLVideoElement).srcObject === null))
    .toBe(true)

  // 영상은 어디로도 가지 않는다: 밖으로 나간 요청이 없고, 보낸 요청은 모두 작은 JSON 이다.
  expect(external).toEqual([])
  expect(posts.length).toBeGreaterThan(0)
  for (const post of posts) expect(post.size, post.url).toBeLessThan(2048)
})

test('기본 설정(3구역·낮음)에서도 크게 계속 움직이면 침대→이동 경로→현관 신호와 알림이 만들어진다', async ({
  page,
  request,
}) => {
  await page.goto('/dev/webcam')
  await expect(page.getByLabel('화면 나누기')).toHaveValue('split')
  await expect(page.getByLabel('움직임 민감도')).toHaveValue('LOW')
  await page.getByRole('button', { name: '카메라 시작' }).click()
  await expect(page.getByText('카메라 켜짐')).toBeVisible()

  // 낮음은 약 1.5초 이상 크게 이어져야 확정하므로 조금 더 기다린다.
  await expect(page.getByText(/지금까지 움직임 [1-9]\d*번 감지/)).toBeVisible({ timeout: 25_000 })
  const zones = async () =>
    [
      ...new Set(
        (
          (await (await request.get('/api/events?limit=50')).json()) as {
            events: { zone: string; origin: string }[]
          }
        ).events
          .filter((e) => e.origin === 'SIMULATED')
          .map((e) => e.zone),
      ),
    ].sort()
  await expect.poll(zones, { timeout: 25_000 }).toEqual(['BED_SIDE', 'ENTRANCE', 'PATH'])
  await expect
    .poll(
      async () =>
        (
          (await (await request.get('/api/alerts?limit=50')).json()) as {
            alerts: { type: string; origin: string }[]
          }
        ).alerts
          .filter((a) => a.origin === 'SIMULATED')
          .map((a) => a.type)
          .sort(),
      { timeout: 25_000 },
    )
    .toEqual(expect.arrayContaining(['BED_TO_PATH', 'ENTRANCE_APPROACH']))
})

test('영상 첨부가 켜져 있으면(기본): 알림이 만들어진 순간의 영상이 그 알림에 붙고, 알림 상세에서 재생할 수 있다', async ({
  page,
  request,
}) => {
  const external: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) external.push(req.url())
  })
  await page.goto('/dev/webcam')
  await expect(page.getByText('알림이 생기면 그 순간의 짧은 영상만 서버로 보냅니다')).toBeVisible()
  await page.getByLabel('화면 나누기').selectOption('single')
  await page.getByLabel('이 카메라가 보는 구역').selectOption('ENTRANCE')
  await page.getByRole('button', { name: '카메라 시작' }).click()
  await expect(page.getByText('카메라 켜짐')).toBeVisible()

  // 녹화(약 4초)가 끝나면 알림에 붙었다고 알려 준다
  await expect(page.getByText(/현관 알림 1건에 영상\(약 4초\)을 붙였습니다/)).toBeVisible({
    timeout: 25_000,
  })
  const alert = (
    (await (await request.get('/api/alerts?limit=50')).json()) as {
      alerts: { id: string; type: string; origin: string }[]
    }
  ).alerts.find((a) => a.type === 'ENTRANCE_APPROACH' && a.origin === 'SIMULATED')
  expect(alert).toBeDefined()
  const clips = (
    (await (await request.get(`/api/alerts/${alert!.id}/clips`)).json()) as {
      clips: { url: string; mimeType: string; sizeBytes: number }[]
    }
  ).clips
  expect(clips.length).toBeGreaterThanOrEqual(1)
  expect(clips[0]!.sizeBytes).toBeGreaterThan(1000) // 실제로 녹화된 영상이다
  const video = await request.get(clips[0]!.url)
  expect(video.status()).toBe(200)
  expect(video.headers()['content-type']).toMatch(/^video\/(webm|mp4)/)
  expect(video.headers()['cache-control']).toBe('private, no-store')

  await page.getByRole('button', { name: '카메라 끄기' }).click()

  // 알림 상세에서 재생할 수 있다
  await page.goto(`/notifications/${alert!.id}`)
  await expect(page.getByText('알림과 함께 온 영상')).toBeVisible()
  const player = page.getByLabel('알림 영상 1')
  await expect(player).toHaveAttribute('src', clips[0]!.url)
  await expect
    .poll(() => player.evaluate((v) => (v as HTMLVideoElement).readyState), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1) // 메타데이터를 읽었다 = 브라우저가 실제로 영상을 열었다
  expect(external).toEqual([])
})

test('화면을 떠나면 카메라 트랙이 실제로 멈춘다', async ({ page }) => {
  // 카메라 트랙의 stop 호출 수를 센다. (앱 안의 화면 이동은 페이지를 새로 읽지 않으므로 값이 유지된다)
  await page.addInitScript(() => {
    const w = window as unknown as { __trackStops: number }
    w.__trackStops = 0
    // 원래 stop 을 보관했다가 this 를 넘겨 부르는 방식의 가로채기이므로 unbound-method 를 허용한다.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original: (this: MediaStreamTrack) => void = MediaStreamTrack.prototype.stop
    MediaStreamTrack.prototype.stop = function (this: MediaStreamTrack) {
      w.__trackStops += 1
      return original.call(this)
    }
  })
  await page.goto('/dev/webcam')
  await page.getByRole('button', { name: '카메라 시작' }).click()
  await expect(page.getByText('카메라 켜짐')).toBeVisible()
  const stops = () =>
    page.evaluate(() => (window as unknown as { __trackStops: number }).__trackStops)
  expect(await stops()).toBe(0)

  // 앱 안에서 다른 화면으로 이동한다
  await page.getByRole('link', { name: '설정', exact: true }).first().click()
  await expect(page).toHaveURL(/\/settings/)
  await expect.poll(stops).toBeGreaterThanOrEqual(1)
})
