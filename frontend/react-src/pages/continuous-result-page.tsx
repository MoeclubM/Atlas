import ReactECharts from 'echarts-for-react'
import {
  getAvgLatency,
  getMaxLatency,
  getMinLatency,
  getPacketLossPercent,
  getPacketLossStats,
  getResolvedIP,
  getStddevLatency,
  getTargetNetworkInfo,
} from '@/lib/result'
import { getLatencyTextClass } from '@/lib/latency'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DenseCell,
  DenseHeaderCell,
  DenseTable,
  DenseTableHead,
  ProbeSummaryCell,
  TargetNetworkCell,
} from '@/components/common/result-table'
import api from '@/lib/api-client'
import { normalizeProbe, type ProbeRecord, type TaskInfo, type TaskResult } from '@/lib/domain'
import { getProbeProviderLabel } from '@/lib/probe'

type ContinuousStatRow = {
  probe_id: string
  probe_name: string
  provider: string
  location: string
  test_count: number
  last_latency?: number
  avg_latency?: number
  min_latency?: number
  max_latency?: number
  packet_loss?: number
  stddev?: number
  resolved_ip?: string
  target_isp?: string
  target_asn?: string
  target_as_name?: string
}

export function ContinuousResultPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const taskQuery = useQuery({
    queryKey: ['continuous-task', id],
    queryFn: () => api.get<{ task?: TaskInfo }>(`/tasks/${id}`),
    refetchInterval: 5000,
  })

  const resultsQuery = useQuery({
    queryKey: ['continuous-results', id],
    queryFn: () => api.get<{ results?: TaskResult[] }>('/results', { params: { task_id: id } }),
    refetchInterval: 5000,
  })

  const probesQuery = useQuery({
    queryKey: ['continuous-probes', id],
    queryFn: async () => {
      const response = await api.get<{ probes?: ProbeRecord[] }>('/probes')
      return (response.probes || []).map((probe) => normalizeProbe(probe))
    },
  })

  const probeMap = useMemo(
    () => new Map((probesQuery.data || []).map((probe) => [probe.probe_id, probe])),
    [probesQuery.data],
  )

  const results = useMemo(() => resultsQuery.data?.results || [], [resultsQuery.data?.results])
  const chartOption = useMemo(() => buildChartOption(results, probeMap, t), [probeMap, results, t])
  const stats = useMemo(() => buildStats(results, probeMap, taskQuery.data?.task?.target || ''), [
    probeMap,
    results,
    taskQuery.data?.task?.target,
  ])

  async function stopTask() {
    await api.delete(`/tasks/${id}`)
    await taskQuery.refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate('/test')}>
            {t('common.back')}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{t('route.continuousResult')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(taskQuery.data?.task?.status)}>
            {taskQuery.data?.task?.status || t('common.loading')}
          </Badge>
          {taskQuery.data?.task?.status === 'running' ? (
            <Button variant="danger" onClick={() => void stopTask()}>
              {t('home.stopTest')}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('singleResult.probeData')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DenseTable minWidthClassName="min-w-[1180px]">
            <DenseTableHead>
              <tr>
                <DenseHeaderCell>{t('home.probeLabel')}</DenseHeaderCell>
                <DenseHeaderCell>{t('results.resolvedIP')}</DenseHeaderCell>
                <DenseHeaderCell>{t('results.targetISP')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('results.loss')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('continuous.count')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('continuous.last')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('results.avg')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('results.min')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('results.max')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('continuous.stdev')}</DenseHeaderCell>
              </tr>
            </DenseTableHead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.probe_id} className="transition hover:bg-sky-50/55 dark:hover:bg-slate-900/80">
                  <DenseCell>
                    <ProbeSummaryCell location={row.location} provider={row.provider || row.probe_name} />
                  </DenseCell>
                  <DenseCell mono>{row.resolved_ip || '-'}</DenseCell>
                  <DenseCell>
                    <TargetNetworkCell
                      isp={row.target_isp}
                      asn={row.target_asn}
                      asName={row.target_as_name}
                    />
                  </DenseCell>
                  <DenseCell align="right" className={lossTextClass(row.packet_loss)}>
                    {formatLoss(row.packet_loss)}
                  </DenseCell>
                  <DenseCell align="right">{row.test_count}</DenseCell>
                  <DenseCell align="right" className={getLatencyTextClass(row.last_latency, 'success')}>
                    {formatLatency(row.last_latency, t)}
                  </DenseCell>
                  <DenseCell align="right" className={getLatencyTextClass(row.avg_latency, 'success')}>
                    {formatLatency(row.avg_latency, t)}
                  </DenseCell>
                  <DenseCell align="right">{formatLatency(row.min_latency, t)}</DenseCell>
                  <DenseCell align="right">{formatLatency(row.max_latency, t)}</DenseCell>
                  <DenseCell align="right">{formatLatency(row.stddev, t)}</DenseCell>
                </tr>
              ))}
            </tbody>
          </DenseTable>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('continuous.latencyChart')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReactECharts option={chartOption} style={{ height: 360 }} />
        </CardContent>
      </Card>
    </div>
  )
}

function buildChartOption(
  results: TaskResult[],
  probeMap: Map<string, ProbeRecord>,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const seriesMap = new Map<string, Array<[number, number | null]>>()
  for (const result of results) {
    const point: [number, number | null] = [
      result.created_at ? new Date(result.created_at).getTime() : Date.now(),
      getAvgLatency(result.summary, result.result_data) ?? null,
    ]
    const points = seriesMap.get(result.probe_id) || []
    points.push(point)
    seriesMap.set(result.probe_id, points)
  }

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 8, type: 'scroll' },
    grid: { left: 40, right: 24, top: 48, bottom: 32 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: `${t('continuous.latencyMs')} (${t('common.ms')})` },
    series: Array.from(seriesMap.entries()).map(([probeId, data]) => ({
      name: probeMap.get(probeId)?.name || probeId,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data,
    })),
  }
}

function buildStats(
  results: TaskResult[],
  probeMap: Map<string, ProbeRecord>,
  target: string,
): ContinuousStatRow[] {
  const grouped = new Map<string, TaskResult[]>()
  for (const result of results) {
    const current = grouped.get(result.probe_id) || []
    current.push(result)
    grouped.set(result.probe_id, current)
  }

  return Array.from(grouped.entries())
    .map(([probeId, items]) => {
      const probe = probeMap.get(probeId)
      const latencies = items
        .map((item) => getAvgLatency(item.summary, item.result_data))
        .filter((value): value is number => value !== undefined)
      const last = items[items.length - 1]
      const targetNetwork = getTargetNetworkInfo(last?.summary, last?.result_data)
      const lossStats = items.reduce(
        (sum, item) => {
          const next = getPacketLossStats(item.result_data)
          if (next) {
            sum.failed += next.failed
            sum.total += next.total
          }
          return sum
        },
        { failed: 0, total: 0 },
      )
      const avgLatency = latencies.length
        ? latencies.reduce((sum, current) => sum + current, 0) / latencies.length
        : undefined

      return {
        probe_id: probeId,
        probe_name: probe?.name || probeId,
        provider: getProbeProviderLabel(probe?.metadata),
        location: probe?.location || '',
        test_count: items.length,
        last_latency: getAvgLatency(last?.summary, last?.result_data),
        avg_latency: avgLatency,
        min_latency: latencies.length ? Math.min(...latencies) : getMinLatency(last?.summary, last?.result_data),
        max_latency: latencies.length ? Math.max(...latencies) : getMaxLatency(last?.summary, last?.result_data),
        packet_loss:
          lossStats.total > 0
            ? (lossStats.failed / lossStats.total) * 100
            : getPacketLossPercent(last?.summary, last?.result_data),
        stddev: avgLatency !== undefined && latencies.length > 0
          ? Math.sqrt(
              latencies.reduce((sum, value) => sum + Math.pow(value - avgLatency, 2), 0) / latencies.length,
            )
          : getStddevLatency(last?.summary, last?.result_data),
        resolved_ip: getResolvedIP(last?.summary, last?.result_data, target),
        target_isp: targetNetwork.isp,
        target_asn: targetNetwork.asn,
        target_as_name: targetNetwork.asName,
      } satisfies ContinuousStatRow
    })
    .sort((left, right) => left.location.localeCompare(right.location))
}

function formatLoss(value?: number) {
  return value !== undefined ? `${value.toFixed(1)}%` : '-'
}

function formatLatency(
  value: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return value !== undefined ? `${value.toFixed(1)} ${t('common.ms')}` : '-'
}

function lossTextClass(value?: number) {
  if (value === undefined) return ''
  if (value === 0) return 'text-emerald-600 dark:text-emerald-400'
  if (value < 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function statusVariant(status?: string) {
  if (status === 'running') return 'info' as const
  if (status === 'completed' || status === 'success') return 'success' as const
  if (status === 'failed' || status === 'cancelled') return 'danger' as const
  return 'default' as const
}
