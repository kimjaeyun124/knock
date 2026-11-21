import { z } from 'zod'

/**
 * 이 패키지의 모든 스키마는 여기서 내보내는 `z` 로 만든다.
 *
 * 브라우저에서는 Zod 의 JIT(코드 생성)를 끈다. Zod 는 스키마를 만들 때 eval 을 쓸 수 있는지
 * 확인하려고 new Function 을 호출하는데, 엄격한 보안 정책(CSP)에서는 이것이 위반으로 보고되기 때문이다.
 * 정책을 'unsafe-eval' 로 풀지 않기 위한 설정이다. 서버(Node)에는 CSP 가 없으므로 그대로 둔다.
 *
 * 설정이 스키마보다 먼저 적용되어야 하는데, 번들러가 코드를 나누면 실행 순서에 기대는 방식은 깨진다.
 * 그래서 모든 스키마 파일이 이 모듈에서 `z` 를 가져오게 해 "의존 관계"로 순서를 보장한다.
 */
// 브라우저에는 window 가 있고 Node 에는 없다. (이 패키지는 DOM 타입 없이 빌드되므로 globalThis 로 확인한다)
if ('window' in globalThis) z.config({ jitless: true })

export { z }
