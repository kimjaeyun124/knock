import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ToastProvider } from '@/components/ui/Toast'
import { createQueryClient } from '@/lib/queryClient'
import type { ApiRuntime } from '@/services/api/runtime'
import { ApiProvider } from './ApiProvider'
import { DevicePrefsEffects } from './DevicePrefsEffects'
import { routes } from './routes'

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)

export function App({ runtime }: { runtime: ApiRuntime }) {
  return (
    <ApiProvider runtime={runtime}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <DevicePrefsEffects />
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}
