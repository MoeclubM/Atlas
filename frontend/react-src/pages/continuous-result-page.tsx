import ReactECharts from 'echarts-for-react'
import {
  getAvgLatency,
  getPacketLossPercent,
  getPacketLossStats,
  getResolvedIP,
  getTargetNetworkInfo,
} from '@/lib/result'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/lib/api-client'
import { normalizeProbe, type ProbeRecord, type TaskInfo, type TaskResult } from '@/lib/domain'

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
          <CardTitle>{t('continuous.latencyChart')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReactECharts option={chartOption} style={{ height: 360 }} />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {stats.map((row) => (
          <Card key={row.probe_id}>
            <CardContent className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-6">
              <Metric label={t('admin.nodeName')} value={row.probe_name} />
              <Metric label={t('admin.location')} value={row.location} />
              <Metric label={t('results.resolvedIP')} value={row.resolved_ip || '-'} />
              <Metric label={t('results.avg')} value={formatLatency(row.avg_latency, t)} />
              <Metric label={t('results.loss')} value={formatLoss(row.packet_loss)} />
              <Metric label={t('results.targetISP')} value={row.target_isp || '-'} />
            </CardContent>
          </Card>
        ))}
      </div>
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

function buildStats(results: TaskResult[], probeMap: Map<string, ProbeRecord>, target: string) {
  const grouped = new Map<string, TaskResult[]>()
  for (const result of results) {
    const current = grouped.get(result.probe_id) || []
    current.push(result)
    grouped.set(result.probe_id, current)
  }

  return Array.from(grouped.entries()).map(([probeId, items]) => {
    const probe = probeMap.get(probeId)
    const latencies = items
      .map((item) => getAvgLatency(item.summary, item.result_data))
      .filter((value): value is number => value !== undefined)
    const avgLatency = latencies.length
      ? latencies.reduce((sum, current) => sum + current, 0) / latencies.length
      : undefined
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
    const last = items[items.length - 1]
    const targetNetwork = getTargetNetworkInfo(last?.summary, last?.result_data)
    return {
      probe_id: probeId,
      probe_name: probe?.name || probeId,
      location: probe?.location || '',
      avg_latency: avgLatency,
      packet_loss:
        lossStats.total > 0
          ? (lossStats.failed / lossStats.total) * 100
          : getPacketLossPercent(last?.summary, last?.result_data),
      resolved_ip: getResolvedIP(last?.summary, last?.result_data, target),
      target_isp: targetNetwork.isp,
    }
  })
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm">{value}</div>
    </div>
  )
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

function statusVariant(status?: string) {
  if (status === 'running') return 'info' as const
  if (status === 'completed' || status === 'success') return 'success' as const
  if (status === 'failed' || status === 'cancelled') return 'danger' as const
  return 'default' as const
}
