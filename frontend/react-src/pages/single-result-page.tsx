import {
  getAvgLatency,
  getHTTPAttempts,
  getHTTPStatusTextClass,
  getHTTPStatusCode,
  getLatestHTTPAttempt,
  getMaxLatency,
  getMTRResult,
  getMinLatency,
  getPacketLossPercent,
  getResolvedIP,
  getStddevLatency,
  getTargetNetworkInfo,
  getTracerouteResult,
  type MTRResultData,
  type TracerouteResultData,
} from '@/lib/result'
import { getLatencyTextClass } from '@/lib/latency'
import { hasValidCoordinates } from '@/lib/coordinate'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HttpHeadersGrid } from '@/components/common/http-headers-grid'
import {
  DenseCell,
  DenseHeaderCell,
  DenseTable,
  DenseTableHead,
  DetailBlock,
  ProbeSummaryCell,
  TargetNetworkCell,
} from '@/components/common/result-table'
import { WorldMap, type ProbeMarker } from '@/components/common/world-map'
import api from '@/lib/api-client'
import { normalizeProbe, type ProbeRecord, type TaskInfo, type TaskResult } from '@/lib/domain'
import { getProbeProviderLabel } from '@/lib/probe'
import {
  formatLatencyMs,
  formatLossPercent,
  getLossTextClass,
  getResultStatusText,
  getResultStatusVariant,
} from '@/lib/result-presentation'

type SingleResultRow = {
  key: string
  probe_id: string
  location: string
  provider?: string
  target: string
  resolved_ip: string
  target_isp?: string
  target_asn?: string
  target_as_name?: string
  latency?: number
  http_status_code?: number
  packet_loss?: number
  min_latency?: number
  max_latency?: number
  stddev?: number
  status: string
  test_type?: string
  traceroute?: TracerouteResultData
  mtr?: MTRResultData
  result_data?: unknown
}

export function SingleResultPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const [expandedProbeIds, setExpandedProbeIds] = useState<string[]>([])

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
        .map<ProbeMarker | null>((result) => {
          const probe = probeMap.get(result.probe_id)
          if (!probe || !hasValidCoordinates(probe.latitude, probe.longitude)) return null
          return {
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
          } satisfies ProbeMarker
        })
        .filter((marker): marker is ProbeMarker => marker !== null),
    [probeMap, results, t],
  )

  const rows = useMemo<SingleResultRow[]>(() => {
    return results.map((result) => {
      const probe = probeMap.get(result.probe_id)
      const targetNetwork = getTargetNetworkInfo(result.summary, result.result_data)
      const latestAttempt = getLatestHTTPAttempt(result.result_data)
      const traceroute = getTracerouteResult(result.result_data)
      const mtr = getMTRResult(result.result_data)
      const derivedStatus = latestAttempt?.status
        ? latestAttempt.status
        : mtr
          ? mtr.success === false
            ? 'failed'
            : result.status || 'success'
          : traceroute
            ? traceroute.success === false
              ? 'failed'
              : result.status || 'success'
            : result.status || 'unknown'

      return {
        key: result.result_id || result.probe_id,
        probe_id: result.probe_id,
        location: probe?.location || t('common.unknown'),
        provider: getProbeProviderLabel(probe?.metadata),
        target: result.target || '',
        resolved_ip: getResolvedIP(result.summary, result.result_data, result.target) || '-',
        target_isp: targetNetwork.isp,
        target_asn: targetNetwork.asn,
        target_as_name: targetNetwork.asName,
        latency: latestAttempt?.timeMs ?? getAvgLatency(result.summary, result.result_data),
        http_status_code: getHTTPStatusCode(result.summary, result.result_data),
        packet_loss: getPacketLossPercent(result.summary, result.result_data),
        min_latency: getMinLatency(result.summary, result.result_data),
        max_latency: getMaxLatency(result.summary, result.result_data),
        stddev: getStddevLatency(result.summary, result.result_data),
        status: derivedStatus,
        test_type: result.test_type,
        traceroute,
        mtr,
        result_data: result.result_data,
      }
    })
  }, [probeMap, results, t])

  const isHTTPTask = rows.some((row) => row.test_type === 'http_test')
  const columnCount = 7 + (isHTTPTask ? 1 : 0)

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

      <Card>
        <CardHeader>
          <CardTitle>{t('singleResult.probeData')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DenseTable minWidthClassName="min-w-[1080px]">
            <DenseTableHead>
              <tr>
                <DenseHeaderCell>{t('home.probeLabel')}</DenseHeaderCell>
                <DenseHeaderCell>{t('results.resolvedIP')}</DenseHeaderCell>
                <DenseHeaderCell>{t('results.targetISP')}</DenseHeaderCell>
                {isHTTPTask ? <DenseHeaderCell align="right">{t('results.httpStatus')}</DenseHeaderCell> : null}
                <DenseHeaderCell align="right">{t('singleResult.latency')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('singleResult.lossRate')}</DenseHeaderCell>
                <DenseHeaderCell>{t('singleResult.stats')}</DenseHeaderCell>
                <DenseHeaderCell align="right">{t('results.status')}</DenseHeaderCell>
              </tr>
            </DenseTableHead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedProbeIds.includes(row.probe_id)
                return (
                  <FragmentRow
                    key={row.key}
                    main={
                      <tr
                        className="cursor-pointer transition hover:bg-sky-50/55 dark:hover:bg-slate-900/80"
                        onClick={() =>
                          setExpandedProbeIds((current) =>
                            current.includes(row.probe_id)
                              ? current.filter((item) => item !== row.probe_id)
                              : [...current, row.probe_id],
                          )
                        }
                      >
                        <DenseCell>
                          <ProbeSummaryCell
                            location={row.location}
                            provider={row.provider}
                            badge={
                              <Badge variant={getResultStatusVariant(row.status)}>
                                {getResultStatusText(row.status, t)}
                              </Badge>
                            }
                          />
                        </DenseCell>
                        <DenseCell mono>{row.resolved_ip}</DenseCell>
                        <DenseCell>
                          <TargetNetworkCell
                            isp={row.target_isp}
                            asn={row.target_asn}
                            asName={row.target_as_name}
                          />
                        </DenseCell>
                        {isHTTPTask ? (
                          <DenseCell align="right" className={getHTTPStatusTextClass(row.http_status_code)}>
                            {row.http_status_code ?? '-'}
                          </DenseCell>
                        ) : null}
                        <DenseCell align="right" className={getLatencyTextClass(row.latency, row.status)}>
                          {formatLatencyMs(row.latency, t)}
                        </DenseCell>
                        <DenseCell align="right" className={getLossTextClass(row.packet_loss)}>
                          {formatLossPercent(row.packet_loss)}
                        </DenseCell>
                        <DenseCell>{renderStatsSummary(row, t)}</DenseCell>
                        <DenseCell align="right">
                          <Badge variant={getResultStatusVariant(row.status)}>
                            {getResultStatusText(row.status, t)}
                          </Badge>
                        </DenseCell>
                      </tr>
                    }
                    detail={
                      isExpanded ? (
                        <tr>
                          <DenseCell colSpan={columnCount} className="bg-slate-50 py-4 dark:bg-slate-900">
                            <div className="space-y-5">
                              {renderTracerouteDetail(row.traceroute, t)}
                              {renderMTRDetail(row.mtr, t)}
                              {renderHTTPDetail(row.result_data, t)}
                              {!row.traceroute && !row.mtr && getHTTPAttempts(row.result_data).length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                  {t('results.noRouteData')}
                                </div>
                              ) : null}
                            </div>
                          </DenseCell>
                        </tr>
                      ) : null
                    }
                  />
                )
              })}
            </tbody>
          </DenseTable>

          {markers.length ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {t('singleResult.worldMap')}
              </div>
              <WorldMap probes={markers} height={320} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function FragmentRow({
  main,
  detail,
}: {
  main: ReactNode
  detail: ReactNode
}) {
  return (
    <>
      {main}
      {detail}
    </>
  )
}

function renderStatsSummary(
  row: SingleResultRow,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (row.test_type === 'traceroute' && row.traceroute) {
    const totalHops = row.traceroute.totalHops ?? row.traceroute.hops.length
    return (
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div>{`${t('singleResult.routeHops')}: ${totalHops}`}</div>
        <div>{row.traceroute.success ? t('home.route.arrived') : t('common.failed')}</div>
      </div>
    )
  }

  if (row.test_type === 'mtr' && row.mtr) {
    const totalHops = row.mtr.totalHops ?? row.mtr.hops.length
    return (
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div>{`${t('singleResult.routeHops')}: ${totalHops}`}</div>
        <div>{row.mtr.success ? t('home.route.arrived') : t('common.failed')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
      <div>{`${t('singleResult.min')}: ${formatLatencyMs(row.min_latency, t)}`}</div>
      <div>{`${t('singleResult.max')}: ${formatLatencyMs(row.max_latency, t)}`}</div>
      <div>{`${t('singleResult.stdev')}: ${formatLatencyMs(row.stddev, t)}`}</div>
    </div>
  )
}

function renderTracerouteDetail(
  data: TracerouteResultData | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!data?.hops?.length) return null

  return (
    <DetailBlock title={t('results.tracerouteDetail')}>
      <DenseTable minWidthClassName="min-w-[860px]">
        <DenseTableHead>
          <tr>
            <DenseHeaderCell>{t('home.route.hop')}</DenseHeaderCell>
            <DenseHeaderCell>{t('home.route.ip')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('home.route.rtt')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('results.status')}</DenseHeaderCell>
          </tr>
        </DenseTableHead>
        <tbody>
          {data.hops.map((hop) => (
            <tr key={`single-tr-${hop.hop}`}>
              <DenseCell>{hop.hop}</DenseCell>
              <DenseCell>
                <div>{hop.ip || '*'}</div>
                {hop.hostname ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{hop.hostname}</div>
                ) : null}
                {hop.geo ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {[hop.geo.isp, hop.geo.country, hop.geo.region, hop.geo.city].filter(Boolean).join(' ')}
                  </div>
                ) : null}
              </DenseCell>
              <DenseCell align="right">
                {hop.timeout
                  ? '-'
                  : hop.rtts?.length
                    ? hop.rtts.map((value) => `${value.toFixed(1)} ${t('common.ms')}`).join(' / ')
                    : '-'}
              </DenseCell>
              <DenseCell align="right">
                {hop.timeout ? t('common.timeout') : hop.ip ? t('home.route.arrived') : '-'}
              </DenseCell>
            </tr>
          ))}
        </tbody>
      </DenseTable>
    </DetailBlock>
  )
}

function renderMTRDetail(
  data: MTRResultData | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!data?.hops?.length) return null

  return (
    <DetailBlock title={t('results.mtrDetail')}>
      <DenseTable minWidthClassName="min-w-[1080px]">
        <DenseTableHead>
          <tr>
            <DenseHeaderCell>{t('home.route.hop')}</DenseHeaderCell>
            <DenseHeaderCell>{t('home.route.ip')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('home.route.lossPercent')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('home.route.sent')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('home.route.avg')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{`${t('home.route.best')}/${t('home.route.worst')}`}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('home.route.stdev')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('results.status')}</DenseHeaderCell>
          </tr>
        </DenseTableHead>
        <tbody>
          {data.hops.map((hop) => (
            <tr key={`single-mtr-${hop.hop}`}>
              <DenseCell>{hop.hop}</DenseCell>
              <DenseCell>
                <div>{hop.ip || '*'}</div>
                {hop.hostname ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{hop.hostname}</div>
                ) : null}
                {hop.geo ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {[hop.geo.isp, hop.geo.country, hop.geo.region, hop.geo.city].filter(Boolean).join(' ')}
                  </div>
                ) : null}
              </DenseCell>
              <DenseCell align="right">
                {hop.lossPercent !== undefined ? `${hop.lossPercent.toFixed(1)}%` : '-'}
              </DenseCell>
              <DenseCell align="right">{hop.sent ?? '-'}</DenseCell>
              <DenseCell align="right">
                {hop.avgRttMs !== undefined ? `${hop.avgRttMs.toFixed(1)} ${t('common.ms')}` : '-'}
              </DenseCell>
              <DenseCell align="right">
                {hop.bestRttMs !== undefined || hop.worstRttMs !== undefined
                  ? `${hop.bestRttMs?.toFixed(1) ?? '-'} / ${hop.worstRttMs?.toFixed(1) ?? '-'} ${t('common.ms')}`
                  : '-'}
              </DenseCell>
              <DenseCell align="right">
                {hop.stddevRttMs !== undefined ? `${hop.stddevRttMs.toFixed(1)} ${t('common.ms')}` : '-'}
              </DenseCell>
              <DenseCell align="right">
                {hop.timeout ? t('common.timeout') : hop.ip ? t('home.route.arrived') : '-'}
              </DenseCell>
            </tr>
          ))}
        </tbody>
      </DenseTable>
    </DetailBlock>
  )
}

function renderHTTPDetail(
  resultData: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const attempts = getHTTPAttempts(resultData)
  if (!attempts.length) return null

  return (
    <DetailBlock title={t('results.httpDetail')}>
      <DenseTable minWidthClassName="min-w-[1040px]">
        <DenseTableHead>
          <tr>
            <DenseHeaderCell>{t('results.attempt')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('results.statusCode')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('singleResult.latency')}</DenseHeaderCell>
            <DenseHeaderCell>{t('results.resolvedIP')}</DenseHeaderCell>
            <DenseHeaderCell>{t('results.finalUrl')}</DenseHeaderCell>
            <DenseHeaderCell align="right">{t('results.status')}</DenseHeaderCell>
          </tr>
        </DenseTableHead>
        <tbody>
          {attempts.map((attempt) => (
            <tr key={`single-http-${attempt.seq ?? 0}`}>
              <DenseCell>{attempt.seq ?? '-'}</DenseCell>
              <DenseCell align="right">{attempt.statusCode ?? '-'}</DenseCell>
              <DenseCell align="right">
                {attempt.timeMs !== undefined ? `${attempt.timeMs.toFixed(1)} ${t('common.ms')}` : '-'}
              </DenseCell>
              <DenseCell mono>{attempt.resolvedIP || '-'}</DenseCell>
              <DenseCell className="max-w-[320px] break-all text-slate-500 dark:text-slate-400">
                {attempt.finalURL || '-'}
              </DenseCell>
              <DenseCell align="right">{getResultStatusText(attempt.status, t)}</DenseCell>
            </tr>
          ))}
        </tbody>
      </DenseTable>
      <HttpHeadersGrid resultData={resultData} />
    </DetailBlock>
  )
}
