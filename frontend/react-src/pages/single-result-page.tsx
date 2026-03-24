import {
  getAvgLatency,
  getHTTPAttempts,
  getMTRResult,
  getPacketLossPercent,
  getResolvedIP,
  getTargetNetworkInfo,
  getTracerouteResult,
} from '@/lib/result'
import { hasValidCoordinates } from '@/lib/coordinate'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HttpHeadersGrid } from '@/components/common/http-headers-grid'
import { WorldMap, type ProbeMarker } from '@/components/common/world-map'
import api from '@/lib/api-client'
import { normalizeProbe, type ProbeRecord, type TaskInfo, type TaskResult } from '@/lib/domain'

export function SingleResultPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const taskQuery = useQuery({
    queryKey: ['single-task', id],
    queryFn: () => api.get<{ task?: TaskInfo; results?: TaskResult[] }>(`/tasks/${id}`),
  })

  const probesQuery = useQuery({
    queryKey: ['single-probes', id],
    queryFn: async () => {
      const response = await api.get<{ probes?: ProbeRecord[] }>('/probes')
      return (response.probes || []).map((probe) => normalizeProbe(probe))
    },
  })

  const probeMap = useMemo(
    () => new Map((probesQuery.data || []).map((probe) => [probe.probe_id, probe])),
    [probesQuery.data],
  )

  const results = useMemo(() => taskQuery.data?.results || [], [taskQuery.data?.results])
  const markers = useMemo<ProbeMarker[]>(
    () =>
      results
        .map((result) => {
          const probe = probeMap.get(result.probe_id)
          if (!probe || !hasValidCoordinates(probe.latitude, probe.longitude)) return null
          const marker: ProbeMarker = {
            probe_id: result.probe_id,
            name: probe.name || probe.probe_id,
            location: probe.location || t('common.unknown'),
            latitude: probe.latitude,
            longitude: probe.longitude as number,
            latency: getAvgLatency(result.summary, result.result_data),
            status:
              result.status === 'success' || result.status === 'failed' || result.status === 'timeout'
                ? result.status
                : 'pending',
            packetLoss: getPacketLossPercent(result.summary, result.result_data),
          }
          return marker
        })
        .filter((marker): marker is ProbeMarker => marker !== null),
    [probeMap, results, t],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => navigate('/test')}>
          {t('common.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{t('route.singleResult')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{id}</p>
        </div>
      </div>

      {markers.length ? <WorldMap probes={markers} /> : null}

      <div className="grid gap-4">
        {results.map((result) => {
          const probe = probeMap.get(result.probe_id)
          const targetNetwork = getTargetNetworkInfo(result.summary, result.result_data)
          const traceroute = getTracerouteResult(result.result_data)
          const mtr = getMTRResult(result.result_data)
          const attempts = getHTTPAttempts(result.result_data)

          return (
            <Card key={result.result_id || result.probe_id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{probe?.location || t('common.unknown')}</CardTitle>
                  <Badge variant={statusVariant(result.status)}>{result.status || t('common.pending')}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label={t('results.resolvedIP')} value={getResolvedIP(result.summary, result.result_data, result.target) || '-'} />
                  <Metric label={t('results.targetISP')} value={targetNetwork.isp || '-'} />
                  <Metric label={t('singleResult.latency')} value={formatLatency(getAvgLatency(result.summary, result.result_data), t)} />
                  <Metric label={t('results.loss')} value={formatLoss(getPacketLossPercent(result.summary, result.result_data))} />
                </div>
                {traceroute?.hops?.length ? (
                  <RouteTable
                    title={t('results.tracerouteDetail')}
                    rows={traceroute.hops.map((hop) => [
                      String(hop.hop),
                      hop.ip || '*',
                      hop.timeout ? '-' : hop.rtts?.length ? `${hop.rtts[0].toFixed(1)} ${t('common.ms')}` : '-',
                    ])}
                  />
                ) : null}
                {mtr?.hops?.length ? (
                  <RouteTable
                    title={t('results.mtrDetail')}
                    rows={mtr.hops.map((hop) => [
                      String(hop.hop),
                      hop.ip || '*',
                      hop.lossPercent !== undefined ? `${hop.lossPercent.toFixed(1)}%` : '-',
                      hop.avgRttMs !== undefined ? `${hop.avgRttMs.toFixed(1)} ${t('common.ms')}` : '-',
                    ])}
                  />
                ) : null}
                {attempts.length ? (
                  <RouteTable
                    title={t('results.httpDetail')}
                    rows={attempts.map((attempt) => [
                      String(attempt.seq ?? '-'),
                      String(attempt.statusCode ?? '-'),
                      attempt.timeMs !== undefined ? `${attempt.timeMs.toFixed(1)} ${t('common.ms')}` : '-',
                      attempt.resolvedIP || '-',
                    ])}
                  />
                ) : null}
                {attempts.length ? <HttpHeadersGrid resultData={result.result_data} /> : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm">{value}</div>
    </div>
  )
}

function RouteTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="border-t border-slate-200 dark:border-slate-800">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${index}-${cellIndex}`} className="py-2 pr-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  if (status === 'success' || status === 'completed') return 'success' as const
  if (status === 'failed' || status === 'timeout' || status === 'cancelled') return 'danger' as const
  return 'default' as const
}
