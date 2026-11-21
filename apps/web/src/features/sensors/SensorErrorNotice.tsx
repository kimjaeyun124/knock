import type { SensorErrorInfo } from './sensorErrors'

/** 실패의 원인과 해결 방법을 함께 알린다. (스크린리더도 바로 읽도록 role="alert") */
export function SensorErrorNotice({
  error,
  headline,
}: {
  error: SensorErrorInfo
  /** 무슨 작업이 실패했는지, 화면의 값이 어떻게 됐는지 (예: "이전 값으로 되돌렸습니다") */
  headline: string
}) {
  return (
    <div role="alert" className="space-y-1 text-body">
      <p className="font-semibold text-status-danger-strong">{headline}</p>
      <p>
        <span className="font-semibold">원인:</span> {error.cause}
      </p>
      <p>
        <span className="font-semibold">해결 방법:</span> {error.solution}
      </p>
    </div>
  )
}
