import { useQuery } from '@tanstack/react-query'
import {
  getHTTPAttempts,
  getMTRResult,
  getTracerouteResult,
  type MTRResultData,
  type TracerouteResultData,
} from '@/lib/result'
import { hasValidCoordinates } from '@/lib/coordinate'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select'
import { SparkBars } from '@/components/common/spark-bars'
import { WorldMap, type ProbeMarker } from '@/components/common/world-map'
import api from '@/lib/api-client'
import { type DisplayTaskStatus, normalizeProbe, probeSupportsTaskType, type ProbeRecord, type TaskInfo, type TaskResult } from '@/lib/domain'
import { deriveHomeRows, getSparkSamplesFromResult, type HomeResultRow } from '@/lib/home'

type TaskDetailResponse = { task?: TaskInfo; results?: TaskResult[] }
type ResultsResponse = { results?: TaskResult[] }

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

  const probeMarkers = useMemo<ProbeMarker[]>(
    () =>
      results
        .map((result) => {
          const probe = probesMap.get(result.probe_id)
          const latitude = probe?.latitude ?? null
          const longitude = probe?.longitude ?? null
          if (!hasValidCoordinates(latitude, longitude)) return null
          const safeLongitude = longitude as number
          const marker: ProbeMarker = {
            probe_id: result.probe_id,
            name: probe?.name || result.location,
            location: result.location,
            latitude,
            longitude: safeLongitude,
            latency: result.last_latency ?? result.avg_latency,
            status:
              result.status === 'success' || result.status === 'failed' || result.status === 'timeout'
                ? result.status
                : 'pending',
            packetLoss: result.packet_loss,
          }
          return marker
        })
        .filter((marker): marker is ProbeMarker => marker !== null),
    [probesMap, results],
  )

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
      parameters: { ip_version: ipVersion, count: pageMode === 'continuous' ? 100 : 4 },
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

      if (detail.task?.status === 'completed' || detail.task?.status === 'failed' || detail.task?.status === 'cancelled') {
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
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-3 text-sm font-medium">{t('home.probeLabel')}</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {routeCapableProbes.map((probe) => {
                  const checked = targetedProbeIds.includes(probe.probe_id)
                  return (
                    <label
                      key={probe.probe_id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/60"
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
            <CardTitle>{t('results.results')}</CardTitle>
            <CardDescription>{taskStatus}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {probeMarkers.length ? <WorldMap probes={probeMarkers} /> : null}
            <div className="grid gap-4 xl:grid-cols-2">
              {results.map((result) => {
                const isExpanded = expandedProbeIds.includes(result.probe_id)
                const resultAttempts = getHTTPAttempts(httpData[result.probe_id])
                return (
                  <div
                    key={result.probe_id}
                    className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4 shadow-panel dark:border-slate-800 dark:bg-slate-900/60"
                    data-testid="home-result-row"
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() =>
                        setExpandedProbeIds((current) =>
                          current.includes(result.probe_id)
                            ? current.filter((item) => item !== result.probe_id)
                            : [...current, result.probe_id],
                        )
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{result.location}</div>
                          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {result.provider || '-'}
                          </div>
                        </div>
                        <Badge variant={statusVariant(result.status)}>
                          {result.status || t('common.pending')}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Metric label={t('results.resolvedIP')} value={result.resolved_ip || '-'} mono />
                        <Metric label={t('results.targetISP')} value={result.target_isp || '-'} />
                        <Metric label={t('results.loss')} value={formatLoss(result.packet_loss)} />
                        <Metric label={t('results.current')} value={formatLatency(result.last_latency, t)} />
                        <Metric label={t('results.avg')} value={formatLatency(result.avg_latency, t)} />
                        <Metric
                          label={t('results.chart')}
                          renderValue={
                            <SparkBars
                              samples={samples[result.probe_id] || []}
                              fallbackLatency={result.avg_latency}
                              status={result.status}
                            />
                          }
                          value=""
                        />
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                        {renderTraceroute(tracerouteData[result.probe_id], t)}
                        {renderMTR(mtrData[result.probe_id], t)}
                        {renderHTTP(resultAttempts, t)}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Metric({
  label,
  value,
  mono = false,
  renderValue,
}: {
  label: string
  value: string
  mono?: boolean
  renderValue?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={mono ? 'mt-2 break-all font-mono text-sm' : 'mt-2 text-sm'}>
        {renderValue ?? value}
      </div>
    </div>
  )
}

function renderTraceroute(
  data: TracerouteResultData | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!data?.hops?.length) return null
  return (
    <div data-testid="home-traceroute-detail">
      <div className="mb-3 text-sm font-semibold">{t('results.tracerouteDetail')}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="pb-2">{t('home.route.hop')}</th>
              <th className="pb-2">{t('home.route.ip')}</th>
              <th className="pb-2">{t('home.route.rtt')}</th>
            </tr>
          </thead>
          <tbody>
            {data.hops.map((hop) => (
              <tr key={`tr-${hop.hop}`} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2">{hop.hop}</td>
                <td className="py-2">{hop.ip || '*'}</td>
                <td className="py-2">
                  {hop.timeout
                    ? '-'
                    : hop.rtts?.length
                      ? `${hop.rtts[0].toFixed(1)} ${t('common.ms')}`
                      : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderMTR(
  data: MTRResultData | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!data?.hops?.length) return null
  return (
    <div data-testid="home-mtr-detail">
      <div className="mb-3 text-sm font-semibold">{t('results.mtrDetail')}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="pb-2">{t('home.route.hop')}</th>
              <th className="pb-2">{t('home.route.ip')}</th>
              <th className="pb-2">{t('home.route.lossPercent')}</th>
              <th className="pb-2">{t('home.route.avg')}</th>
            </tr>
          </thead>
          <tbody>
            {data.hops.map((hop) => (
              <tr
                key={`mtr-${hop.hop}`}
                className="border-t border-slate-200 dark:border-slate-800"
                data-testid="home-mtr-hop-row"
              >
                <td className="py-2">{hop.hop}</td>
                <td className="py-2">{hop.ip || '*'}</td>
                <td className="py-2">
                  {hop.lossPercent !== undefined ? `${hop.lossPercent.toFixed(1)}%` : '-'}
                </td>
                <td className="py-2">
                  {hop.avgRttMs !== undefined ? `${hop.avgRttMs.toFixed(1)} ${t('common.ms')}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderHTTP(
  attempts: ReturnType<typeof getHTTPAttempts>,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!attempts.length) return null
  return (
    <div>
      <div className="mb-3 text-sm font-semibold">{t('results.httpDetail')}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="pb-2">{t('results.attempt')}</th>
              <th className="pb-2">{t('results.statusCode')}</th>
              <th className="pb-2">{t('singleResult.latency')}</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => (
              <tr key={`http-${attempt.seq ?? 0}`} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2">{attempt.seq ?? '-'}</td>
                <td className="py-2">{attempt.statusCode ?? '-'}</td>
                <td className="py-2">
                  {attempt.timeMs !== undefined ? `${attempt.timeMs.toFixed(1)} ${t('common.ms')}` : '-'}
                </td>
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
  if (status === 'running' || status === 'scheduling') return 'info' as const
  if (status === 'failed' || status === 'timeout' || status === 'cancelled') return 'danger' as const
  return 'default' as const
}
