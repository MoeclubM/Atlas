export function formatLossPercent(value?: number) {
  return value !== undefined ? `${value.toFixed(1)}%` : '-'
}

export function formatLatencyMs(
  value: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return value !== undefined ? `${value.toFixed(1)} ${t('common.ms')}` : '-'
}

export function getLossTextClass(value?: number) {
  if (value === undefined) return ''
  if (value === 0) return 'text-emerald-600 dark:text-emerald-400'
  if (value < 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function getResultStatusVariant(status?: string) {
  if (status === 'success' || status === 'completed') return 'success' as const
  if (status === 'running' || status === 'scheduling') return 'info' as const
  if (status === 'failed' || status === 'timeout' || status === 'cancelled') return 'danger' as const
  return 'default' as const
}

export function getResultStatusText(
  status: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (status === 'success' || status === 'completed') return t('common.success')
  if (status === 'failed') return t('common.failed')
  if (status === 'timeout') return t('common.timeout')
  if (status === 'cancelled') return t('common.cancelled')
  if (status === 'running') return t('common.running')
  if (status === 'pending' || status === 'scheduling') return t('common.pending')
  return status || t('common.unknown')
}
