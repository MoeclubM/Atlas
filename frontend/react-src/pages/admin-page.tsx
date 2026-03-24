import { useQuery } from '@tanstack/react-query'
import { Copy, LogOut, RefreshCcw, Rocket, Save, Shield, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import api from '@/lib/api-client'
import { clearAdminToken, isAuthenticated } from '@/lib/auth'
import {
  buildAdminProbeRow,
  type AdminConfig,
  type AdminProbeRow,
  type AdminProbeUpgrade,
  type ProbeRecord,
} from '@/lib/domain'
import { useAppStore } from '@/state/app-store'

type ConfigResponse = {
  shared_secret?: string
  blocked_networks?: string
  ping_max_runs?: string
  tcp_ping_max_runs?: string
  traceroute_timeout_seconds?: string
  mtr_timeout_seconds?: string
}

export function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notify = useAppStore((state) => state.notify)
  const confirmAction = useAppStore((state) => state.confirmAction)
  const [activeTab, setActiveTab] = useState('nodes')
  const [config, setConfig] = useState<AdminConfig>({
    shared_secret: '',
    blocked_networks: '',
    ping_max_runs: 100,
    tcp_ping_max_runs: 100,
    traceroute_timeout_seconds: 60,
    mtr_timeout_seconds: 60,
  })
  const [probeEdits, setProbeEdits] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<string[]>([])
  const [upgradingIds, setUpgradingIds] = useState<string[]>([])

  const probesQuery = useQuery({
    queryKey: ['admin-probes'],
    queryFn: async () => {
      const response = await api.get<{ probes?: ProbeRecord[] }>('/admin/probes')
      return (response.probes || []).map((probe) => buildAdminProbeRow(probe))
    },
    refetchInterval: 10000,
  })

  const configQuery = useQuery({
    queryKey: ['admin-config'],
    queryFn: async () => {
      const response = await api.get<ConfigResponse>('/admin/config')
      return {
        shared_secret: response.shared_secret || '',
        blocked_networks: response.blocked_networks || '',
        ping_max_runs: normalizePositiveNumber(response.ping_max_runs, 100),
        tcp_ping_max_runs: normalizePositiveNumber(response.tcp_ping_max_runs, 100),
        traceroute_timeout_seconds: normalizePositiveNumber(
          response.traceroute_timeout_seconds,
          60,
        ),
        mtr_timeout_seconds: normalizePositiveNumber(response.mtr_timeout_seconds, 60),
      } satisfies AdminConfig
    },
  })

  useEffect(() => {
    if (configQuery.data) {
      setConfig(configQuery.data)
    }
  }, [configQuery.data])

  useEffect(() => {
    const rows = probesQuery.data || []
    setProbeEdits((current) => {
      const next = { ...current }
      for (const probe of rows) {
        if (!(probe.probe_id in next)) {
          next[probe.probe_id] = probe.name || ''
        }
      }
      return next
    })
  }, [probesQuery.data])

  const wsUrl = useMemo(() => {
    const protocol = globalThis.location?.protocol
    const host = globalThis.location?.host
    return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`
  }, [])

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  async function updateProbe(probe: AdminProbeRow) {
    setSavingIds((current) => [...current, probe.probe_id])
    try {
      await api.put(`/admin/probes/${probe.probe_id}`, {
        name: (probeEdits[probe.probe_id] || probe.name || '').trim(),
      })
      await probesQuery.refetch()
      notify(String(t('admin.updateSuccess')), 'success')
    } catch {
      notify(String(t('admin.updateFailed')), 'error')
    } finally {
      setSavingIds((current) => current.filter((id) => id !== probe.probe_id))
    }
  }

  async function upgradeProbe(probe: AdminProbeRow) {
    const disabledReason = getUpgradeDisabledReason(probe, t)
    if (disabledReason) {
      notify(disabledReason, 'error')
      return
    }

    const requestedVersion = globalThis.prompt(String(t('admin.upgradePrompt')), '')?.trim()
    if (requestedVersion === undefined) return

    const confirmed = await confirmAction(
      requestedVersion
        ? String(t('admin.upgradeConfirmVersion', { target: probe.name || probe.probe_id, version: requestedVersion }))
        : String(t('admin.upgradeConfirmLatest', { target: probe.name || probe.probe_id })),
      { title: String(t('common.confirm')) },
    )
    if (!confirmed) return

    setUpgradingIds((current) => [...current, probe.probe_id])
    try {
      const response = await api.post<{ upgrade?: AdminProbeUpgrade }>(
        `/admin/probes/${probe.probe_id}/upgrade`,
        requestedVersion ? { version: requestedVersion } : {},
      )
      await probesQuery.refetch()
      const targetVersion = response.upgrade?.target_version || requestedVersion || '-'
      notify(
        requestedVersion
          ? String(t('admin.upgradeQueuedVersion', { version: targetVersion }))
          : String(t('admin.upgradeQueuedLatest', { version: targetVersion })),
        'success',
      )
    } catch {
      notify(String(t('admin.upgradeFailed')), 'error')
    } finally {
      setUpgradingIds((current) => current.filter((id) => id !== probe.probe_id))
    }
  }

  async function deleteProbe(probeId: string) {
    const confirmed = await confirmAction(String(t('admin.deleteConfirm')), {
      title: String(t('common.confirm')),
    })
    if (!confirmed) return

    try {
      await api.delete(`/admin/probes/${probeId}`)
      await probesQuery.refetch()
      notify(String(t('admin.deleteSuccess')), 'success')
    } catch {
      notify(String(t('admin.deleteFailed')), 'error')
    }
  }

  async function saveConfig() {
    try {
      await api.put('/admin/config', {
        shared_secret: config.shared_secret,
        blocked_networks: config.blocked_networks,
        ping_max_runs: normalizePositiveNumber(config.ping_max_runs, 100),
        tcp_ping_max_runs: normalizePositiveNumber(config.tcp_ping_max_runs, 100),
        traceroute_timeout_seconds: normalizePositiveNumber(config.traceroute_timeout_seconds, 60),
        mtr_timeout_seconds: normalizePositiveNumber(config.mtr_timeout_seconds, 60),
      })
      await configQuery.refetch()
      notify(String(t('admin.saveSuccess')), 'success')
    } catch {
      notify(String(t('admin.saveFailed')), 'error')
    }
  }

  async function generateSecret() {
    try {
      const response = await api.get<{ shared_secret?: string }>('/admin/generate-secret')
      if (response.shared_secret) {
        setConfig((current) => ({ ...current, shared_secret: response.shared_secret || '' }))
        notify(String(t('admin.generateSuccess')), 'success')
      }
    } catch {
      notify(String(t('admin.generateFailed')), 'error')
    }
  }

  async function copyWSAddress() {
    await navigator.clipboard.writeText(wsUrl)
    notify(String(t('admin.copyAddressSuccess')), 'success')
  }

  function logout() {
    clearAdminToken()
    navigate('/login', { replace: true })
  }

  const probes = probesQuery.data || []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('admin.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('route.admin')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void probesQuery.refetch()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {t('common.refresh')}
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            {t('admin.logout')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="nodes" data-testid="admin-tab-nodes">
            {t('admin.nodes')}
          </TabsTrigger>
          <TabsTrigger value="keys" data-testid="admin-tab-keys">
            {t('admin.keysTab')}
          </TabsTrigger>
          <TabsTrigger value="blocked" data-testid="admin-tab-blocked">
            {t('admin.blockedTab')}
          </TabsTrigger>
          <TabsTrigger value="test" data-testid="admin-tab-test">
            {t('admin.testTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="mt-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {probes.map((probe) => (
              <Card key={probe.probe_id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{probe.name || probe.probe_id}</CardTitle>
                      <CardDescription className="mt-1 break-all">{probe.probe_id}</CardDescription>
                    </div>
                    <Badge variant={probe.status === 'online' ? 'success' : 'default'}>
                      {probe.status === 'online' ? t('admin.statusOnline') : t('admin.statusOffline')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldValue label={t('admin.version')} value={probe.version || '-'} mono />
                    <FieldValue label={t('admin.providerLabel')} value={probe.provider_label || '-'} />
                    <FieldValue label={t('admin.location')} value={probe.location || '-'} />
                    <FieldValue label={t('admin.connectionIp')} value={probe.ip_address || '-'} mono />
                  </div>

                  {probe.latest_upgrade ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t('admin.latestUpgrade')}</span>
                        <Badge variant={getUpgradeStatusVariant(probe.latest_upgrade.status)}>
                          {getUpgradeStatusLabel(probe.latest_upgrade.status, t)}
                        </Badge>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {probe.latest_upgrade.target_version}
                        </span>
                      </div>
                      {probe.latest_upgrade.error_message ? (
                        <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                          {probe.latest_upgrade.error_message}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!probe.upgrade_supported && probe.upgrade_reason ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {probe.upgrade_reason}
                    </p>
                  ) : null}

                  <div>
                    <Label htmlFor={`probe-name-${probe.probe_id}`}>{t('admin.nodeName')}</Label>
                    <Input
                      id={`probe-name-${probe.probe_id}`}
                      value={probeEdits[probe.probe_id] ?? probe.name ?? ''}
                      onChange={(event) =>
                        setProbeEdits((current) => ({
                          ...current,
                          [probe.probe_id]: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void updateProbe(probe)}
                      disabled={savingIds.includes(probe.probe_id)}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {t('common.save')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void upgradeProbe(probe)}
                      disabled={
                        upgradingIds.includes(probe.probe_id) ||
                        Boolean(getUpgradeDisabledReason(probe, t))
                      }
                    >
                      <Rocket className="mr-2 h-4 w-4" />
                      {t('admin.upgrade')}
                    </Button>
                    <Button variant="danger" onClick={() => void deleteProbe(probe.probe_id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('admin.delete')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="keys" className="mt-5">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.sharedSecret')}</CardTitle>
                <CardDescription>{t('admin.keysTab')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="shared-secret">{t('admin.sharedSecret')}</Label>
                  <Input
                    id="shared-secret"
                    value={config.shared_secret}
                    onChange={(event) =>
                      setConfig((current) => ({ ...current, shared_secret: event.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void generateSecret()}>
                    <WandSparkles className="mr-2 h-4 w-4" />
                    {t('admin.generate')}
                  </Button>
                  <Button onClick={() => void saveConfig()}>
                    <Save className="mr-2 h-4 w-4" />
                    {t('common.save')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.wsAddress')}</CardTitle>
                <CardDescription>{t('admin.installCommand')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 font-mono text-sm break-all dark:border-slate-800 dark:bg-slate-900/60">
                  {wsUrl}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void copyWSAddress()}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('admin.copyAddress')}
                  </Button>
                  <Button onClick={() => void saveConfig()}>
                    <Shield className="mr-2 h-4 w-4" />
                    {t('common.save')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="blocked" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.blockedNetworks')}</CardTitle>
              <CardDescription>{t('admin.blockedNetworksHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={config.blocked_networks}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, blocked_networks: event.target.value }))
                }
              />
              <Button onClick={() => void saveConfig()}>
                <Save className="mr-2 h-4 w-4" />
                {t('common.save')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.testTab')}</CardTitle>
              <CardDescription>{t('admin.testConfig')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <NumericField
                id="ping-max-runs"
                label={t('admin.pingMaxRuns')}
                value={config.ping_max_runs}
                testId="admin-ping-max-runs"
                onChange={(value) =>
                  setConfig((current) => ({ ...current, ping_max_runs: value }))
                }
              />
              <NumericField
                id="tcp-ping-max-runs"
                label={t('admin.tcpPingMaxRuns')}
                value={config.tcp_ping_max_runs}
                testId="admin-tcp-ping-max-runs"
                onChange={(value) =>
                  setConfig((current) => ({ ...current, tcp_ping_max_runs: value }))
                }
              />
              <NumericField
                id="traceroute-timeout"
                label={t('admin.tracerouteTimeoutSeconds')}
                value={config.traceroute_timeout_seconds}
                testId="admin-traceroute-timeout"
                onChange={(value) =>
                  setConfig((current) => ({ ...current, traceroute_timeout_seconds: value }))
                }
              />
              <NumericField
                id="mtr-timeout"
                label={t('admin.mtrTimeoutSeconds')}
                value={config.mtr_timeout_seconds}
                testId="admin-mtr-timeout"
                onChange={(value) =>
                  setConfig((current) => ({ ...current, mtr_timeout_seconds: value }))
                }
              />
              <div className="md:col-span-2">
                <Button data-testid="admin-save-test-config" onClick={() => void saveConfig()}>
                  <Save className="mr-2 h-4 w-4" />
                  {t('common.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function normalizePositiveNumber(value: string | number | undefined, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function getUpgradeStatusLabel(
  status: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const normalized = (status || '').trim()
  const key = `admin.upgradeStates.${normalized}`
  return normalized ? t(key) : t('common.unknown')
}

function getUpgradeStatusVariant(status: string | undefined) {
  switch ((status || '').trim()) {
    case 'applied':
      return 'success' as const
    case 'accepted':
      return 'info' as const
    case 'queued':
      return 'warning' as const
    case 'rejected':
    case 'failed':
    case 'timeout':
      return 'danger' as const
    default:
      return 'default' as const
  }
}

function getUpgradeDisabledReason(
  probe: AdminProbeRow,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!probe.upgrade_supported) {
    return probe.upgrade_reason || String(t('admin.upgradeUnsupported'))
  }
  const status = probe.latest_upgrade?.status?.trim()
  if (status === 'queued' || status === 'accepted') {
    return String(t('admin.upgradeInProgress'))
  }
  return ''
}

function FieldValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={mono ? 'mt-2 break-all font-mono text-sm' : 'mt-2 text-sm'}>{value}</div>
    </div>
  )
}

function NumericField({
  id,
  label,
  value,
  onChange,
  testId,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  testId?: string
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div data-testid={testId}>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          value={String(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  )
}
