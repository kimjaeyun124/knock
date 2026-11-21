/// <reference types="vite/client" />

// 브라우저에 공개되는 환경변수는 VITE_ 접두사 변수뿐이다. 비밀값을 여기에 추가하지 않는다.
interface ImportMetaEnv {
  /** API 서버 절대 주소. 비어 있으면 같은 출처(/api)를 사용한다. */
  readonly VITE_API_BASE_URL?: string
  /** 개발 중 Mock 구현으로 바꿀 기능 목록(쉼표 구분). 운영 빌드에서는 비워 둬야 한다. */
  readonly VITE_MOCK_FEATURES?: string
  /** 실행 모드. api(기본, 실제 서버) 또는 demo(테스트 데이터, 개발 전용). 운영 빌드에서는 demo 를 쓸 수 없다. */
  readonly VITE_APP_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
