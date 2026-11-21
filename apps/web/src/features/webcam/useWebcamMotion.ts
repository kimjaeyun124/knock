import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_TRIGGER,
  MotionTrigger,
  regionRatios,
  toGray,
  type MotionRule,
} from './motionDetector'

/** 비교에 쓰는 작은 화면 크기. 작을수록 가볍고 잡음에 덜 민감하다. 영상은 이 크기로 줄여 브라우저 안에서만 쓴다. */
const SAMPLE_WIDTH = 64
const SAMPLE_HEIGHT = 48
const SAMPLE_INTERVAL_MS = 150

export type CameraState = 'idle' | 'starting' | 'running' | 'denied' | 'unavailable' | 'error'

export interface WebcamMotion {
  state: CameraState
  /** 사람에게 보여 줄 안내. 오류일 때만 있다. */
  message: string | null
  /** 구역(칸)별 가장 최근 화면 변화 비율(0~1). 화면에 보이는 왼쪽부터 순서대로이다. */
  ratios: number[]
  start: () => Promise<void>
  stop: () => void
  /**
   * 지금부터 ms 동안 카메라 영상을 녹화해 돌려준다. (소리 없음) 이미 녹화 중이면 그 녹화를 같이 쓴다.
   * 카메라가 꺼져 있거나 브라우저가 녹화를 지원하지 않으면 null.
   */
  recordClip: (ms: number) => Promise<Blob | null>
}

/**
 * 브라우저가 지원하는 녹화 형식 중 서버가 받는 것(mp4·webm).
 * mp4(H.264)를 먼저 고른다. 아이폰(노크 앱·Safari)은 webm 을 재생하지 못하기 때문이다.
 */
export function pickRecordingType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(
    (type) => MediaRecorder.isTypeSupported(type),
  )
}

function describeError(error: unknown): { state: CameraState; message: string } {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      state: 'denied',
      message:
        '카메라 사용이 허용되지 않았습니다. 주소창의 카메라 아이콘에서 허용한 뒤 다시 시작해 주세요.',
    }
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { state: 'unavailable', message: '사용할 수 있는 카메라를 찾지 못했습니다.' }
  }
  if (name === 'NotReadableError') {
    return {
      state: 'error',
      message: '카메라를 열 수 없습니다. 다른 프로그램이 카메라를 쓰고 있는지 확인해 주세요.',
    }
  }
  return { state: 'error', message: '카메라를 시작하지 못했습니다.' }
}

const zeros = (n: number): number[] => Array.from({ length: n }, () => 0)

/**
 * 웹캠으로 움직임을 찾는다. 영상은 이 브라우저 안에서 64x48 흑백으로 줄여 앞뒤 화면만 비교하고,
 * 저장하거나 서버로 보내지 않는다. 화면을 가로로 `regions` 칸으로 나눠 칸마다 따로 판단하고,
 * 움직임이 확정된 칸의 번호(화면에 보이는 왼쪽이 0)만 onMotion 으로 알린다. (마이크는 쓰지 않는다)
 *
 * 미리보기는 거울처럼 좌우를 뒤집어 보여 주므로, 화면에 보이는 왼쪽 칸은 카메라 원본의 오른쪽 칸이다.
 */
export function useWebcamMotion(options: {
  /** 칸마다의 판정 기준. 길이가 칸 수다. (1 이면 화면 전체를 한 구역으로 본다) */
  rules: readonly MotionRule[]
  onMotion: (region: number) => void
  /** 미리보기에 쓰는 <video>. 화면이 만들어 넘긴다. */
  videoRef: React.RefObject<HTMLVideoElement | null>
}): WebcamMotion {
  const { videoRef } = options
  const regions = Math.max(1, options.rules.length)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const triggersRef = useRef<MotionTrigger[]>([])
  const onMotionRef = useRef(options.onMotion)
  const rulesRef = useRef(options.rules)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingRef = useRef<Promise<Blob | null> | null>(null)
  const [state, setState] = useState<CameraState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [ratios, setRatios] = useState<number[]>(() => zeros(regions))

  useEffect(() => {
    onMotionRef.current = options.onMotion
  }, [options.onMotion])

  // 민감도를 바꾸면 켜져 있는 칸의 기준도 바로 바뀐다.
  useEffect(() => {
    rulesRef.current = options.rules
    triggersRef.current.forEach((trigger, index) => {
      const rule = options.rules[index]
      if (rule) trigger.setSensitivity(rule.threshold, rule.minFrames)
    })
  }, [options.rules])

  const release = useCallback(() => {
    // 녹화 중이면 멈춘다. (그때까지 녹화된 부분만 남는다)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [videoRef])

  const stop = useCallback(() => {
    release()
    triggersRef.current = []
    setRatios(zeros(regions))
    setMessage(null)
    setState('idle')
  }, [release, regions])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable')
      setMessage(
        '이 브라우저나 주소에서는 카메라를 쓸 수 없습니다. localhost 또는 https 주소에서 열어 주세요.',
      )
      return
    }
    setState('starting')
    setMessage(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        release()
        setState('idle')
        return
      }
      video.srcObject = stream
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE_WIDTH
      canvas.height = SAMPLE_HEIGHT
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('canvas')

      const count = regions
      triggersRef.current = Array.from({ length: count }, (_, index) => {
        const rule = rulesRef.current[index] ?? rulesRef.current[0]
        return new MotionTrigger({
          threshold: rule?.threshold ?? 1,
          minFrames: rule?.minFrames ?? 1,
          ...DEFAULT_TRIGGER,
        })
      })
      setRatios(zeros(count))
      let previous: Uint8Array | null = null
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        release()
        setRatios(zeros(count))
        setState('error')
        setMessage('카메라 연결이 끊겼습니다. 다시 시작해 주세요.')
      })
      timerRef.current = window.setInterval(() => {
        if (video.readyState < 2) return // 아직 화면이 준비되지 않았다
        context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
        const current = toGray(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data)
        if (previous) {
          // 카메라 원본의 칸 순서를 화면에 보이는(거울) 순서로 뒤집는다.
          const shown = regionRatios(
            previous,
            current,
            SAMPLE_WIDTH,
            SAMPLE_HEIGHT,
            count,
          ).reverse()
          setRatios(shown)
          const now = performance.now()
          shown.forEach((value, region) => {
            if (triggersRef.current[region]?.push(value, now)) onMotionRef.current(region)
          })
        }
        previous = current
      }, SAMPLE_INTERVAL_MS)
      setState('running')
    } catch (error) {
      release()
      const described = describeError(error)
      setState(described.state)
      setMessage(described.message)
    }
  }, [release, regions, videoRef])

  const recordClip = useCallback((ms: number): Promise<Blob | null> => {
    if (recordingRef.current) return recordingRef.current
    const stream = streamRef.current
    const type = pickRecordingType()
    if (!stream || typeof MediaRecorder === 'undefined') return Promise.resolve(null)
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        ...(type ? { mimeType: type } : {}),
        videoBitsPerSecond: 600_000,
      })
    } catch {
      return Promise.resolve(null)
    }
    const chunks: Blob[] = []
    const recording = new Promise<Blob | null>((resolve) => {
      const finish = () => {
        recordingRef.current = null
        recorderRef.current = null
        const mime = (recorder.mimeType || type || 'video/webm').split(';')[0] ?? 'video/webm'
        resolve(chunks.length > 0 ? new Blob(chunks, { type: mime }) : null)
      }
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })
      recorder.addEventListener('stop', finish)
      recorder.addEventListener('error', finish)
    })
    recorderRef.current = recorder
    recordingRef.current = recording
    recorder.start()
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, ms)
    return recording
  }, [])

  // 화면을 떠나면 카메라를 반드시 끈다.
  useEffect(() => release, [release])

  return { state, message, ratios, start, stop, recordClip }
}
