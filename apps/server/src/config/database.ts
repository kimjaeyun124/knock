/**
 * 기본 DB 위치. 서버·Prisma CLI 모두 apps/server 를 작업 디렉터리로 실행하므로
 * 상대 경로는 apps/server 기준이다. (npm run 스크립트가 그렇게 실행한다)
 */
export const DEFAULT_DATABASE_URL = 'file:./prisma/dev.db'
