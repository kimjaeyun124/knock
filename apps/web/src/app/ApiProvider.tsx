import type { ReactNode } from 'react'
import { ApiContext } from '@/hooks/apiContext'
import type { ApiRuntime } from '@/services/api/runtime'

export function ApiProvider({ runtime, children }: { runtime: ApiRuntime; children: ReactNode }) {
  return <ApiContext.Provider value={runtime}>{children}</ApiContext.Provider>
}
