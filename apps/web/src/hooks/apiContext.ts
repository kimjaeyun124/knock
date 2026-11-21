import { createContext } from 'react'
import type { ApiRuntime } from '@/services/api/runtime'

export const ApiContext = createContext<ApiRuntime | null>(null)
