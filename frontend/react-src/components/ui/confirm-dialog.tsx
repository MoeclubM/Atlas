import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/state/app-store'

export function ConfirmDialog() {
  const confirm = useAppStore((state) => state.confirm)
  const resolveConfirm = useAppStore((state) => state.resolveConfirm)

  return (
    <AlertDialog.Root
      open={confirm.open}
      onOpenChange={(open) => {
        if (!open && confirm.open) resolveConfirm(false)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/55 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-950">
          <AlertDialog.Title className="text-lg font-semibold text-slate-950 dark:text-white">
            {confirm.title || 'Confirm'}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {confirm.message}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" onClick={() => resolveConfirm(false)}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={() => resolveConfirm(true)}>Continue</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
