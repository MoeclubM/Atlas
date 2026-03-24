import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/state/app-store'

export function ConfirmDialog() {
  const confirm = useAppStore(state => state.confirm)
  const resolveConfirm = useAppStore(state => state.resolveConfirm)

  return (
    <AlertDialog.Root
      open={confirm.open}
      onOpenChange={open => {
        if (!open && confirm.open) resolveConfirm(false)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-stone-950/45" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-stone-300 bg-[var(--surface)] p-6 dark:border-stone-700 dark:bg-[var(--surface)]">
          <AlertDialog.Title className="text-lg font-semibold text-stone-950 dark:text-stone-50">
            {confirm.title || 'Confirm'}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">
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
