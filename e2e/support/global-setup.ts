import { request } from '@playwright/test'
import { createCredentials, STORAGE_STATE } from './credentials'
import { WEB_ORIGIN } from './env'

/**
 * 서버가 비어 있으므로 첫 계정을 만들고(이 서버의 유일한 계정), 로그인 상태를 파일로 저장한다.
 * 모든 요청은 웹 개발 서버(프록시)를 거쳐 브라우저와 같은 출처로 보낸다.
 */
export default async function globalSetup(): Promise<void> {
  const credentials = createCredentials()
  const api = await request.newContext({ baseURL: WEB_ORIGIN })
  try {
    const registered = await api.post('/api/auth/register', { data: credentials })
    if (registered.status() !== 201) {
      throw new Error(
        `E2E 계정을 만들지 못했습니다: ${registered.status()} ${await registered.text()}`,
      )
    }
    await api.storageState({ path: STORAGE_STATE })
  } finally {
    await api.dispose()
  }
}
