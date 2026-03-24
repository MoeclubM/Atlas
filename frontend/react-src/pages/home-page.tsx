import { useQuery } from '@tanstack/react-query'
import {
  getHTTPAttempts,
  getHTTPStatusTextClass,
  getMTRResult,
  getTracerouteResult,
  type MTRResultData,
  type TracerouteResultData,
} from '@/lib/result'
import { getLatencyTextClass } from '@/lib/latency'
import { hasValidCoordinates } from '@/lib/coordinate'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select'
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
import { SparkBars } from '@/components/common/spark-bars'
import { WorldMap, type ProbeMarker } from '@/components/common/world-map'
import api from '@/lib/api-client'
import {
  formatLatencyMs,
  formatLossPercent,
  getLossTextClass,
  getResultStatusText,
  getResultStatusVariant,
} from '@/lib/result-presentation'
import {
  type DisplayTaskStatus,
  normalizeProbe,
  probeSupportsTaskType,
  type ProbeRecord,
  type TaskInfo,
  type TaskResult,
} from '@/lib/domain'
import { deriveHomeRows, getSparkSamplesFromResult, type HomeResultRow } from '@/lib/home'

type TaskDetailResponse = { task?: TaskInfo; results?: TaskResult[] }
type ResultsResponse = { results?: TaskResult[] }

const CONTINUOUS_RUNS = 100

export function HomePage() {
  const { t } = useTranslation()
  const [target, setTarget] = useState('')
  const [testType, setTestType] = useState('icmp_ping')
  const [ipVersion, setIPVersion] = useState<'auto' | 'ipv4' | 'ipv6'>('auto')
  const [selectedProbeIds, setSelectedProbeIds] = useState<string[]>([])
  const [testing, setTesting] = useState(false)
  const [taskStatus, setTaskStatus] = useState<DisplayTaskStatus>('idle')
  const [currentTaskId, setCurrentTaskId] = useState('')
  const [results, setResults] = useState<HomeResultRow[]>([])
  const [expandedProbeIds, setExpandedProbeIds] = useState<string[]>([])
  const [filterKeyword, setFilterKeyword] = useState('')
  const [mtrData, setMTRData] = useState<Record<string, MTRResultData>>({})
  const [tracerouteData, setTracerouteData] = useState<Record<string, TracerouteResultData>>({})
  const [httpData, setHTTPData] = useState<Record<string, unknown>>({})
  const [samples, setSamples] = useState<Record<string, Array<number | null>>>({})
  const rawResultsRef = useRef<TaskResult[]>([])
  const pollTimerRef = useRef<number | null>(null)
  const currentTaskIdRef = useRef('')
  const taskStatusRef = useRef<DisplayTaskStatus>('idle')

  const probesQuery = useQuery({
    queryKey: ['home-probes'],
    queryFn: async () => {
      const response = await api.get<{ probes?: ProbeRecord[] }>('/probes', {
        params: { status: 'online' },
      })
      return (response.probes || []).map((probe) => normalizeProbe(probe))
    },
  })

  useEffect(() => {
    taskStatusRef.current = taskStatus
  }, [taskStatus])

  useEffect(() => {
    currentTaskIdRef.current = currentTaskId
  }, [currentTaskId])

  useEffect(
    () => () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
    },
    [],
  )

  const probes = useMemo(() => probesQuery.data || [], [probesQuery.data])
  const probesMap = useMemo(() => new Map(probes.map((probe) => [probe.probe_id, probe])), [probes])
  const supportsProbeSelection = testType === 'traceroute' || testType === 'mtr'
  const pageMode: 'single' | 'continuous' =
    testType === 'icmp_ping' || testType === 'tcp_ping' ? 'continuous' : 'single'
  const routeCapableProbes = probes.filter((probe) =>
    supportsProbeSelection ? probeSupportsTaskType(probe, testType) : true,
  )
  const targetedProbeIds =
    supportsProbeSelection && selectedProbeIds.length > 0
      ? selectedProbeIds
      : supportsProbeSelection
        ? routeCapableProbes.map((probe) => probe.probe_id)
        : []

  const filteredResults = useMemo(() => {
    const keyword = filterKeyword.trim().toLowerCase()
    if (!keyword) return results

    return results.filter((result) =>
      [
        result.location,
        result.provider,
        result.resolved_ip,
        result.target_isp,
        result.target_asn,
        result.target_as_name,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .some((value) => value.toLowerCase().includes(keyword)),
    )
  }, [filterKeyword, results])

  const probeMarkers = useMemo<ProbeMarker[]>(
    () =>
      filteredResults
        .map<ProbeMarker | null>((result) => {
          const probe = probesMap.get(result.probe_id)
          const latitude = probe?.latitude ?? null
          const longitude = probe?.longitude ?? null
          if (!hasValidCoordinates(latitude, longitude)) return null
          return {
            probe_id: result.probe_id,
            name: probe?.name || result.location,
            location: result.location,
            latitude,
            longitude: longitude as number,
            latency: result.last_latency ?? result.avg_latency,
            status:
              result.status === 'success' || result.status === 'failed' || result.status === 'timeout'
                ? result.status
                : 'pending',
            packetLoss: result.packet_loss,
          } satisfies ProbeMarker
        })
        .filter((marker): marker is ProbeMarker => marker !== null),
    [filteredResults, probesMap],
  )

  const resultsColumnCount = 9 + (testType === 'http_test' ? 1 : 0) + (pageMode === 'continuous' ? 1 : 0)

  async function startTest() {
    if (!target.trim() || testing) return
    if (supportsProbeSelection && targetedProbeIds.length === 0) return
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)

    rawResultsRef.current = []
    setTesting(true)
    setTaskStatus('scheduling')
    setResults([])
    setExpandedProbeIds([])
    setSamples({})
    setMTRData({})
    setTracerouteData({})
    setHTTPData({})

    const task = await api.post<{ task_id: string }>('/tasks', {
      task_type: testType,
      mode: pageMode,
      target: target.trim(),
      ip_version: ipVersion,
      parameters: {
        ip_version: ipVersion,
        count: pageMode === 'continuous' ? CONTINUOUS_RUNS : 4,
      },
      assigned_probes: supportsProbeSelection ? targetedProbeIds : [],
      priority: 5,
    })

    setCurrentTaskId(task.task_id)

    const refresh = async () => {
      const detail = await api.get<TaskDetailResponse>(`/tasks/${task.task_id}`)
      let fetchedResults: TaskResult[] = detail.results || []
      if (pageMode === 'continuous') {
        const response = await api.get<ResultsResponse>('/results', {
          params: { task_id: task.task_id, limit: 200, offset: 0 },
        })
        fetchedResults = (response.results || []).slice().reverse()
      }

      rawResultsRef.current = fetchedResults
      setResults(
        deriveHomeRows({
          taskResults: fetchedResults,
          probesMap,
          activeProbeIds: supportsProbeSelection ? targetedProbeIds : [],
          target: target.trim(),
          getUnknownLabel: () => String(t('common.unknown')),
          getPlaceholderStatus: () =>
            taskStatusRef.current === 'completed' || taskStatusRef.current === 'failed'
              ? 'timeout'
              : 'pending',
        }),
      )

      if (testType === 'icmp_ping' || testType === 'tcp_ping') {
        const next: Record<string, Array<number | null>> = {}
        for (const result of fetchedResults) {
          if (!next[result.probe_id]) next[result.probe_id] = []
          next[result.probe_id]?.push(...getSparkSamplesFromResult(result, testType))
        }
        setSamples(next)
      }

      const nextTraceroute: Record<string, TracerouteResultData> = {}
      const nextMTR: Record<string, MTRResultData> = {}
      const nextHTTP: Record<string, unknown> = {}
      for (const result of fetchedResults) {
        const traceroute = getTracerouteResult(result.result_data)
        if (traceroute) nextTraceroute[result.probe_id] = traceroute
        const mtr = getMTRResult(result.result_data)
        if (mtr) nextMTR[result.probe_id] = mtr
        const attempts = getHTTPAttempts(result.result_data)
        if (attempts.length) nextHTTP[result.probe_id] = result.result_data
      }
      setTracerouteData(nextTraceroute)
      setMTRData(nextMTR)
      setHTTPData(nextHTTP)

      if (
        detail.task?.status === 'completed' ||
        detail.task?.status === 'failed' ||
        detail.task?.status === 'cancelled'
      ) {
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
        setTesting(false)
        setTaskStatus((detail.task.status as DisplayTaskStatus) || 'completed')
        setCurrentTaskId('')
        return
      }

      setTaskStatus(fetchedResults.length ? 'running' : 'scheduling')
    }

    await refresh()
    pollTimerRef.current = window.setInterval(() => {
      void refresh()
    }, 1000)
  }

  async function stopTask() {
    if (!currentTaskIdRef.current) return
    await api.delete(`/tasks/${currentTaskIdRef.current}`)
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
    setTesting(false)
    setTaskStatus('cancelled')
    setCurrentTaskId('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('route.continuousTest')}</CardTitle>
          <CardDescription>{t('home.targetPlaceholder')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_160px_auto]">
            <SelectField
              value={testType}
              onValueChange={setTestType}
              options={[
                { value: 'icmp_ping', label: String(t('taskTable.typeNames.icmp_ping')), testId: 'home-type-option-icmp_ping' },
                { value: 'tcp_ping', label: String(t('taskTable.typeNames.tcp_ping')), testId: 'home-type-option-tcp_ping' },
                { value: 'http_test', label: String(t('taskTable.typeNames.http_test')), testId: 'home-type-option-http_test' },
                { value: 'traceroute', label: String(t('taskTable.typeNames.traceroute')), testId: 'home-type-option-traceroute' },
                { value: 'mtr', label: String(t('taskTable.typeNames.mtr')), testId: 'home-type-option-mtr' },
              ]}
              testId="home-type-select"
            />
            <div data-testid="home-target">
              <Input value={target} onChange={(event) => setTarget(event.target.value)} />
            </div>
            <SelectField
              value={ipVersion}
              onValueChange={(value) => setIPVersion(value as 'auto' | 'ipv4' | 'ipv6')}
              options={[
                { value: 'auto', label: String(t('home.ipAuto')) },
                { value: 'ipv4', label: String(t('home.ipV4')) },
                { value: 'ipv6', label: String(t('home.ipV6')) },
              ]}
              testId="home-ip-select"
            />
            <div className="flex gap-2">
              <Button data-testid="home-start" onClick={() => void startTest()}>
                {testing ? t('common.loading') : t('home.startTest')}
              </Button>
              {currentTaskId ? (
                <Button variant="danger" data-testid="home-stop-test" onClick={() => void stopTask()}>
                  {t('home.stopTest')}
                </Button>
              ) : null}
            </div>
          </div>
          {supportsProbeSelection ? (
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 text-sm font-medium">{t('home.probeLabel')}</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {routeCapableProbes.map((probe) => {
                  const checked = targetedProbeIds.includes(probe.probe_id)
                  return (
                    <label
                      key={probe.probe_id}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          setSelectedProbeIds((current) => {
                            if (next) return Array.from(new Set([...current, probe.probe_id]))
                            return current.filter((item) => item !== probe.probe_id)
                          })
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium">{probe.location || t('common.unknown')}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {probe.name || probe.probe_id}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {results.length || currentTaskId ? (
        <Card data-testid="home-results">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{t('results.results')}</CardTitle>
                <CardDescription>{taskStatus}</CardDescription>
              </div>
              <div className="w-full max-w-sm">
                <Input
                  value={filterKeyword}
                  onChange={(event) => setFilterKeyword(event.target.value)}
                  placeholder={String(t('common.search'))}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredResults.length ? (
              <DenseTable minWidthClassName="min-w-[1180px]">
                <DenseTableHead>
                  <tr>
                    <DenseHeaderCell>{t('home.probeLabel')}</DenseHeaderCell>
                    <DenseHeaderCell>{t('results.resolvedIP')}</DenseHeaderCell>
                    <DenseHeaderCell>{t('results.targetISP')}</DenseHeaderCell>
                    {testType === 'http_test' ? (
                      <DenseHeaderCell align="right">{t('results.httpStatus')}</DenseHeaderCell>
                    ) : null}
                    <DenseHeaderCell align="right">{t('results.loss')}</DenseHeaderCell>
                    {pageMode === 'continuous' ? (
                      <DenseHeaderCell align="right">{t('results.progress')}</DenseHeaderCell>
                    ) : null}
                    <DenseHeaderCell align="right">{t('results.current')}</DenseHeaderCell>
                    <DenseHeaderCell align="right">{t('results.avg')}</DenseHeaderCell>
                    <DenseHeaderCell align="right">{t('results.min')}</DenseHeaderCell>
                    <DenseHeaderCell align="right">{t('results.max')}</DenseHeaderCell>
                    <DenseHeaderCell align="right">{t('results.chart')}</DenseHeaderCell>
                  </tr>
                </DenseTableHead>
                <tbody>
                  {filteredResults.map((result) => {
                    const isExpanded = expandedProbeIds.includes(result.probe_id)
                    const resultAttempts = getHTTPAttempts(httpData[result.probe_id])

                    return (
                      <FragmentRow
                        key={result.probe_id}
                        main={
                          <tr
                            className="cursor-pointer transition hover:bg-sky-50/55 dark:hover:bg-slate-900/80"
                            data-testid="home-result-row"
                            onClick={() =>
                              setExpandedProbeIds((current) =>
                                current.includes(result.probe_id)
                                  ? current.filter((item) => item !== result.probe_id)
                                  : [...current, result.probe_id],
                              )
                            }
                          >
                            <DenseCell>
                              <ProbeSummaryCell
                                location={result.location}
                                provider={result.provider}
                                badge={
                                  <Badge variant={getResultStatusVariant(result.status)}>
                                    {getResultStatusText(result.status, t)}
                                  </Badge>
                                }
                              />
                            </DenseCell>
                            <DenseCell mono>{result.resolved_ip || '-'}</DenseCell>
                            <DenseCell>
                              <TargetNetworkCell
                                isp={result.target_isp}
                                asn={result.target_asn}
                                asName={result.target_as_name}
                              />
                            </DenseCell>
                            {testType === 'http_test' ? (
                              <DenseCell
                                align="right"
                                className={getHTTPStatusTextClass(result.http_status_code)}
                              >
                                {result.http_status_code ?? '-'}
                              </DenseCell>
                            ) : null}
                            <DenseCell align="right" className={getLossTextClass(result.packet_loss)}>
                              {formatLossPercent(result.packet_loss)}
                            </DenseCell>
                            {pageMode === 'continuous' ? (
                              <DenseCell align="right">
                                {`${result.send_count ?? 0}/${CONTINUOUS_RUNS}`}
                              </DenseCell>
                            ) : null}
                            <DenseCell
                              align="right"
                              className={getLatencyTextClass(result.last_latency, result.status)}
                            >
                              {formatLatencyMs(result.last_latency, t)}
                            </DenseCell>
                            <DenseCell align="right" className={getLatencyTextClass(result.avg_latency)}>
                              {formatLatencyMs(result.avg_latency, t)}
                            </DenseCell>
                            <DenseCell align="right">{formatLatencyMs(result.min_latency, t)}</DenseCell>
                            <DenseCell align="right">{formatLatencyMs(result.max_latency, t)}</DenseCell>
                            <DenseCell align="right">
                              <div className="ml-auto w-[96px]" onClick={(event) => event.stopPropagation()}>
                                <SparkBars
                                  samples={samples[result.probe_id] || []}
                                  fallbackLatency={result.avg_latency}
                                  status={result.status}
                                />
                              </div>
                            </DenseCell>
                          </tr>
                        }
                        detail={
                          isExpanded ? (
                        <tr>
                          <DenseCell colSpan={resultsColumnCount} className="bg-slate-50 py-4 dark:bg-slate-900">
                            <div className="space-y-5">
                                  {renderTraceroute(tracerouteData[result.probe_id], t)}
                                  {renderMTR(mtrData[result.probe_id], t)}
                                  {renderHTTP(httpData[result.probe_id], t)}
                                  {!tracerouteData[result.probe_id] &&
                                  !mtrData[result.probe_id] &&
                                  resultAttempts.length === 0 ? (
                                    <div className="text-sm text-slate-500 dark:text-slate-400">
                                      {testType === 'http_test'
                                        ? t('results.noHttpData')
                                        : testType === 'mtr'
                                          ? t('results.noMtrData')
                                          : t('results.noRouteData')}
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
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t('home.noMatchedResults')}
              </div>
            )}

            {probeMarkers.length ? (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {t('singleResult.worldMap')}
                </div>
                <WorldMap probes={probeMarkers} height={320} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
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

function renderTraceroute(
  data: TracerouteResultData | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!data?.hops?.length) return null

  return (
    <DetailBlock title={t('results.tracerouteDetail')} testId="home-traceroute-detail">
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
            <tr key={`tr-${hop.hop}`}>
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
                    ? `${hop.rtts[0].toFixed(1)} ${t('common.ms')}`
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

function renderMTR(
  data: MTRResultData | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!data?.hops?.length) return null

  return (
    <DetailBlock title={t('results.mtrDetail')} testId="home-mtr-detail">
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
            <tr key={`mtr-${hop.hop}`} data-testid="home-mtr-hop-row">
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

function renderHTTP(
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
            <tr key={`http-${attempt.seq ?? 0}`}>
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
