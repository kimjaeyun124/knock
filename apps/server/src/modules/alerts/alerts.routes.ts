import { Router } from 'express'
import {
  AlertResolveRequestSchema,
  AlertsQuerySchema,
  type AlertClipsResponse,
} from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

export function createAlertsRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', async (req, res) => {
    const filter = AlertsQuerySchema.parse(req.query)
    const { householdId, guardianId } = getAuth(res)
    res.json(await services.alerts.list(householdId, guardianId, filter))
  })

  // 내가 읽지 않은 알림 수. ':id' 보다 먼저 둔다.
  router.get('/unread-count', async (_req, res) => {
    const { householdId, guardianId } = getAuth(res)
    res.json(await services.alerts.unreadCount(householdId, guardianId))
  })

  router.post('/read-all', async (_req, res) => {
    const { householdId, guardianId } = getAuth(res)
    res.json(await services.alerts.markAllRead(householdId, guardianId))
  })

  router.get('/:id', async (req, res) => {
    const { householdId, guardianId } = getAuth(res)
    res.json(await services.alerts.get(householdId, guardianId, req.params.id))
  })

  /** 알림에 붙은 영상 목록 (시연용 웹캠). 다른 가구의 알림이면 404 */
  router.get('/:id/clips', async (req, res) => {
    const { householdId } = getAuth(res)
    const body: AlertClipsResponse = {
      clips: await services.clips.list(householdId, req.params.id),
    }
    res.json(body)
  })

  /** 영상 내용. 같은 출처·로그인한 보호자만 볼 수 있고, 브라우저·프록시에 저장하지 않게 한다. */
  router.get('/:id/clips/:clipId', async (req, res) => {
    const { householdId } = getAuth(res)
    const clip = await services.clips.get(householdId, req.params.id, req.params.clipId)
    const total = clip.data.length
    res.setHeader('Content-Type', clip.mimeType)
    res.setHeader('Cache-Control', 'private, no-store')
    // 아이폰의 영상 플레이어(AVPlayer)는 mp4 를 조각(Range)으로 받아야 재생한다.
    res.setHeader('Accept-Ranges', 'bytes')
    const range = parseByteRange(req.header('range'), total)
    if (range === 'invalid') {
      res.status(416).setHeader('Content-Range', `bytes */${total}`)
      res.end()
      return
    }
    if (range) {
      res.status(206)
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
      res.setHeader('Content-Length', String(range.end - range.start + 1))
      res.end(clip.data.subarray(range.start, range.end + 1))
      return
    }
    res.setHeader('Content-Length', String(total))
    res.end(clip.data)
  })

  router.post('/:id/read', async (req, res) => {
    const { householdId, guardianId } = getAuth(res)
    res.json({ alert: await services.alerts.markRead(householdId, guardianId, req.params.id) })
  })

  router.post('/:id/acknowledge', async (req, res) => {
    const { householdId, guardianId } = getAuth(res)
    res.json({ alert: await services.alerts.acknowledge(householdId, req.params.id, guardianId) })
  })

  router.post('/:id/resolve', async (req, res) => {
    const input = AlertResolveRequestSchema.parse(req.body)
    const { householdId, guardianId } = getAuth(res)
    res.json({
      alert: await services.alerts.resolve(householdId, req.params.id, guardianId, input),
    })
  })

  return router
}

/**
 * `Range: bytes=시작-끝` 한 구간만 해석한다. 없거나 여러 구간이면 null(전체), 범위를 벗어나면 'invalid'.
 * 지원: `bytes=0-1`, `bytes=100-`, `bytes=-500`(끝에서 500바이트)
 */
export function parseByteRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart = '', rawEnd = ''] = match
  if (rawStart === '' && rawEnd === '') return 'invalid'
  let start: number
  let end: number
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (suffix === 0) return 'invalid'
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1)
  }
  if (start >= total || start > end) return 'invalid'
  return { start, end }
}
