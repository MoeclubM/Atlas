export type LatencyStatus = 'success' | 'failed' | 'timeout' | 'pending' | string | undefined

export type LatencyTone = 'excellent' | 'good' | 'fair' | 'warn' | 'bad' | 'neutral'

const LATENCY_COLORS: Record<LatencyTone, string> = {
  excellent: '#20b26b',
  good: '#67c23a',
  fair: '#c9cf3f',
  warn: '#f2a93b',
  bad: '#e05a5a',
  neutral: '#d2a542',
}

export function getLatencyTone(latency?: number, status?: LatencyStatus): LatencyTone {
  if (status === 'failed' || status === 'timeout') {
    return 'bad'
  }

  if (status === 'pending' || latency === undefined || latency === null || !Number.isFinite(latency)) {
    return 'neutral'
  }

  if (latency < 20) return 'excellent'
  if (latency < 50) return 'good'
  if (latency < 100) return 'fair'
  if (latency < 180) return 'warn'
  return 'bad'
}

export function getLatencyHex(latency?: number, status?: LatencyStatus): string {
  return LATENCY_COLORS[getLatencyTone(latency, status)]
}

export function getLatencyTextClass(latency?: number, status?: LatencyStatus): string {
  const tone = getLatencyTone(latency, status)
  return tone === 'neutral' ? '' : `latency-${tone}`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]

  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  if (lower === upper) {
    return sorted[lower]
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export type LatencyScale = {
  floor: number
  ceiling: number
}

export function buildLatencyScale(samples: Array<number | null>): LatencyScale | null {
  const finite = samples
    .filter((sample): sample is number => sample !== null && Number.isFinite(sample))
    .sort((left, right) => left - right)

  if (finite.length === 0) {
    return null
  }

  const min = finite[0]
  const max = finite[finite.length - 1]
  const p95 = percentile(finite, 0.95)

  let floor = min
  let ceiling = max

  // 对极少数尖峰做轻微裁剪，避免把常规小抖动全部压扁。
  if (finite.length >= 6 && max > p95 * 1.8) {
    ceiling = p95
  }

  if (ceiling <= floor) {
    const center = finite[Math.floor(finite.length / 2)]
    floor = Math.max(0, center - 2)
    ceiling = center + 2
    return { floor, ceiling }
  }

  const range = ceiling - floor
  const padding = Math.max(2, range * 0.12)

  floor = Math.max(0, floor - padding)
  ceiling += padding

  if (ceiling - floor < 4) {
    const center = (ceiling + floor) / 2
    floor = Math.max(0, center - 2)
    ceiling = center + 2
  }

  return { floor, ceiling }
}
