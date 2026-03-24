import { buildLatencyScale, getLatencyHex } from '@/lib/latency'

export function SparkBars({
  samples,
  fallbackLatency,
  status,
}: {
  samples: Array<number | null>
  fallbackLatency?: number
  status?: string
}) {
  if (!samples.length) {
    return (
      <svg viewBox="0 0 90 24" className="h-6 w-[90px]">
        <rect
          x="0"
          y="7"
          width={Math.max(18, Math.min(90, (fallbackLatency || 50) * 0.36))}
          height="10"
          rx="5"
          fill={getLatencyHex(fallbackLatency, status)}
        />
      </svg>
    )
  }

  const scale = buildLatencyScale(samples)
  return (
    <svg viewBox="0 0 90 24" className="h-6 w-[90px]">
      {samples.map((sample, index) => {
        const x = (index / samples.length) * 90
        const width = Math.max(1, 90 / samples.length)
        const scaleFloor = scale?.floor ?? 0
        const scaleCeiling = scale?.ceiling ?? Math.max(sample ?? 1, 1)
        const scaleRange = Math.max(1, scaleCeiling - scaleFloor)
        const clamped =
          sample === null ? scaleCeiling : Math.max(scaleFloor, Math.min(scaleCeiling, sample))
        const percent =
          sample === null ? 1 : 0.15 + ((clamped - scaleFloor) / scaleRange) * 0.85
        const barHeight = Math.max(2, 24 * percent)
        return (
          <rect
            key={`spark-${index}`}
            x={x}
            y={24 - barHeight}
            width={width}
            height={barHeight}
            fill={sample === null ? getLatencyHex(undefined, 'failed') : getLatencyHex(sample, 'success')}
          />
        )
      })}
    </svg>
  )
}
