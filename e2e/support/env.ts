/** E2E 가 쓰는 포트. 개발 서버(4000/5173)와 겹치지 않게 따로 쓴다. */
export const SERVER_PORT = 4100
export const WEB_PORT = 5273
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`

/** 운영 빌드를 CSP 헤더와 함께 서비스하는 미리보기 서버 */
export const PREVIEW_PORT = 5274
export const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`
