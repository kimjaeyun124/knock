import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const authDir = fileURLToPath(new URL('../.auth/', import.meta.url))
export const STORAGE_STATE = `${authDir}state.json`
const CREDENTIALS_FILE = `${authDir}credentials.json`

export interface Credentials {
  email: string
  password: string
  displayName: string
}

/** 실행마다 새로 만든 임의의 가상 계정. 비밀번호는 저장소에 적어 두지 않는다. */
export function createCredentials(): Credentials {
  const credentials = {
    email: `e2e-${randomUUID().slice(0, 8)}@example.com`,
    password: `e2e-${randomUUID()}`,
    displayName: 'E2E 보호자',
  }
  mkdirSync(dirname(CREDENTIALS_FILE), { recursive: true })
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials))
  return credentials
}

export function readCredentials(): Credentials {
  return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8')) as Credentials
}
