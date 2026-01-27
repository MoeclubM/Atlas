import { defineStore } from 'pinia'
import { ref } from 'vue'

type NotifyType = 'success' | 'info' | 'warning' | 'error'

type NotifyState = {
  open: boolean
  message: string
  type: NotifyType
}

type ConfirmState = {
  open: boolean
  title?: string
  message: string
  resolve?: (value: boolean) => void
}

export const useUiStore = defineStore('ui', () => {
  const notifyState = ref<NotifyState>({ open: false, message: '', type: 'info' })
  const confirmState = ref<ConfirmState>({ open: false, message: '' })

  function notify(message: string, type: NotifyType = 'info') {
    notifyState.value = { open: true, message, type }
  }

  function closeNotify() {
    notifyState.value.open = false
  }

  function confirm(message: string, opts?: { title?: string }): Promise<boolean> {
    return new Promise((resolve) => {
      confirmState.value = {
        open: true,
        title: opts?.title,
        message,
        resolve,
      }
    })
  }

  function closeConfirm(result: boolean) {
    const resolve = confirmState.value.resolve
    confirmState.value.open = false
    confirmState.value.resolve = undefined
    resolve?.(result)
  }

  return {
    notifyState,
    confirmState,
    notify,
    closeNotify,
    confirm,
    closeConfirm,
  }
})
