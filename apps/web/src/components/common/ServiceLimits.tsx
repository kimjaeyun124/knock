import { SERVICE_LIMITS } from './limitsText'

/** 서비스가 하는 일과 하지 못하는 일. 초기 설정의 마지막 단계와 /notice 가 같은 내용을 쓴다. */
export function ServiceLimits() {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {SERVICE_LIMITS.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  )
}
