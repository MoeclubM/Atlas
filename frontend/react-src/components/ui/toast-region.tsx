import * as Toast from '@radix-ui/react-toast'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/state/app-store'

function ToastIcon({ type }: { type: 'success' | 'info' | 'warning' | 'error' }) {
  if (type === 'success') return <CircleCheck className="h-4 w-4" />
  if (type === 'warning') return <TriangleAlert className="h-4 w-4" />
  if (type === 'error') return <CircleAlert className="h-4 w-4" />
  return <Info className="h-4 w-4" />
}

export function ToastRegion() {
  const toasts = useAppStore((state) => state.toasts)
  const dismissToast = useAppStore((state) => state.dismissToast)

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          open
          duration={2600}
          onOpenChange={(open) => {
            if (!open) dismissToast(toast.id)
          }}
          className={cn(
            'flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-soft',
            toast.type === 'success' &&
              'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-100',
            toast.type === 'warning' &&
              'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/90 dark:text-amber-100',
            toast.type === 'error' &&
              'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/90 dark:text-rose-100',
            toast.type === 'info' &&
              'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/90 dark:text-sky-100',
          )}
          data-testid="ui-snackbar"
        >
          <ToastIcon type={toast.type} />
          <Toast.Title className="flex-1 text-sm font-medium">{toast.message}</Toast.Title>
          <Toast.Close className="rounded-full p-1 text-current/70 hover:bg-black/5 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed right-4 top-4 z-[90] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </Toast.Provider>
  )
}
