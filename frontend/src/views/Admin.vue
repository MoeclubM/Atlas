<template>
  <div class="admin-page">
    <div class="admin-header">
      <h1>{{ $t('admin.title') }}</h1>
      <v-btn variant="outlined" @click="logout">
        {{ $t('admin.logout') }}
      </v-btn>
    </div>

    <v-card class="admin-card" variant="outlined">
      <v-tabs v-model="activeTab" color="primary" show-arrows>
        <v-tab value="nodes">
          {{ $t('admin.nodes') }}
        </v-tab>
        <v-tab value="keys">
          {{ $t('admin.keysTab') }}
        </v-tab>
        <v-tab value="blocked">
          {{ $t('admin.blockedTab') }}
        </v-tab>
        <v-tab value="test">
          {{ $t('admin.testTab') }}
        </v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- 节点列表 -->
        <v-window-item value="nodes">
          <div class="tab-content">
            <v-progress-linear v-if="loading" indeterminate />

            <div v-else class="admin-probes-section">
              <div class="admin-table-wrap desktop-only">
                <v-table>
                  <thead>
                    <tr>
                      <th style="width: 220px">
                        {{ $t('admin.nodeName') }}
                      </th>
                      <th style="width: 320px">
                        {{ $t('admin.nodeId') }}
                      </th>
                      <th style="width: 110px">
                        {{ $t('admin.version') }}
                      </th>
                      <th style="width: 160px">
                        {{ $t('admin.connectionIp') }}
                      </th>
                      <th style="width: 220px">
                        {{ $t('admin.providerLabel') }}
                      </th>
                      <th>{{ $t('admin.location') }}</th>
                      <th style="width: 110px">
                        {{ $t('admin.status') }}
                      </th>
                      <th style="width: 250px">
                        {{ $t('admin.actions') }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in probes" :key="row.probe_id">
                      <td>
                        <v-text-field
                          v-model="row.name"
                          density="compact"
                          variant="outlined"
                          hide-details
                          @keyup.enter="updateProbe(row)"
                        />
                      </td>
                      <td>
                        <code class="probe-id">{{ row.probe_id }}</code>
                      </td>
                      <td>
                        <div class="version-cell">
                          <span class="mono">{{ row.version || '-' }}</span>
                          <v-chip
                            v-if="row.latest_upgrade"
                            size="x-small"
                            variant="tonal"
                            :color="getUpgradeStatusColor(row.latest_upgrade.status)"
                          >
                            {{ getUpgradeStatusLabel(row.latest_upgrade.status) }}
                          </v-chip>
                        </div>
                      </td>
                      <td>
                        <span class="mono">{{ row.ip_address || '-' }}</span>
                      </td>
                      <td>
                        <span v-if="row.provider_label">
                          {{
                            $te(`admin.provider.${row.provider_label}`)
                              ? $t(`admin.provider.${row.provider_label}`)
                              : row.provider_label
                          }}
                        </span>
                        <span v-else>-</span>
                      </td>
                      <td>{{ row.location || '-' }}</td>
                      <td>
                        <v-chip
                          size="small"
                          variant="tonal"
                          :color="row.status === 'online' ? 'success' : 'secondary'"
                        >
                          {{
                            row.status === 'online'
                              ? $t('admin.statusOnline')
                              : $t('admin.statusOffline')
                          }}
                        </v-chip>
                      </td>
                      <td>
                        <div class="row-actions">
                          <v-btn
                            variant="tonal"
                            color="primary"
                            density="compact"
                            :loading="isProbeSaving(row.probe_id)"
                            @click="updateProbe(row)"
                          >
                            {{ $t('common.save') }}
                          </v-btn>
                          <v-btn
                            variant="tonal"
                            color="primary"
                            density="compact"
                            :loading="isProbeUpgrading(row.probe_id)"
                            :disabled="Boolean(getUpgradeDisabledReason(row))"
                            :title="getUpgradeDisabledReason(row)"
                            @click="upgradeProbe(row)"
                          >
                            {{ $t('admin.upgrade') }}
                          </v-btn>
                          <v-btn
                            variant="text"
                            color="error"
                            density="compact"
                            @click="deleteProbe(row.probe_id)"
                          >
                            {{ $t('admin.delete') }}
                          </v-btn>
                        </div>
                        <div v-if="getUpgradeNote(row)" class="upgrade-note">
                          {{ getUpgradeNote(row) }}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </div>

              <div class="mobile-probe-list">
                <v-card
                  v-for="row in probes"
                  :key="`${row.probe_id}-mobile`"
                  variant="outlined"
                  class="probe-card"
                >
                  <div class="probe-card-header">
                    <div class="probe-card-title-wrap">
                      <div class="probe-card-title">
                        {{ row.name || row.probe_id }}
                      </div>
                      <code class="probe-id">{{ row.probe_id }}</code>
                    </div>
                    <v-chip
                      size="small"
                      variant="tonal"
                      :color="row.status === 'online' ? 'success' : 'secondary'"
                    >
                      {{
                        row.status === 'online'
                          ? $t('admin.statusOnline')
                          : $t('admin.statusOffline')
                      }}
                    </v-chip>
                  </div>

                  <v-text-field
                    v-model="row.name"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="probe-name-field"
                    :label="$t('admin.nodeName')"
                    @keyup.enter="updateProbe(row)"
                  />

                  <div class="probe-meta-grid">
                    <div class="probe-meta-item">
                      <span class="probe-meta-label">{{ $t('admin.version') }}</span>
                      <span class="mono">{{ row.version || '-' }}</span>
                    </div>
                    <div class="probe-meta-item">
                      <span class="probe-meta-label">{{ $t('admin.connectionIp') }}</span>
                      <span class="mono">{{ row.ip_address || '-' }}</span>
                    </div>
                    <div class="probe-meta-item">
                      <span class="probe-meta-label">{{ $t('admin.providerLabel') }}</span>
                      <span>
                        {{
                          row.provider_label
                            ? $te(`admin.provider.${row.provider_label}`)
                              ? $t(`admin.provider.${row.provider_label}`)
                              : row.provider_label
                            : '-'
                        }}
                      </span>
                    </div>
                    <div class="probe-meta-item">
                      <span class="probe-meta-label">{{ $t('admin.location') }}</span>
                      <span>{{ row.location || '-' }}</span>
                    </div>
                    <div v-if="row.latest_upgrade" class="probe-meta-item">
                      <span class="probe-meta-label">{{ $t('admin.latestUpgrade') }}</span>
                      <div class="upgrade-state">
                        <v-chip
                          size="x-small"
                          variant="tonal"
                          :color="getUpgradeStatusColor(row.latest_upgrade.status)"
                        >
                          {{ getUpgradeStatusLabel(row.latest_upgrade.status) }}
                        </v-chip>
                        <span class="mono">{{ row.latest_upgrade.target_version }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="row-actions">
                    <v-btn
                      variant="tonal"
                      color="primary"
                      density="compact"
                      :loading="isProbeSaving(row.probe_id)"
                      @click="updateProbe(row)"
                    >
                      {{ $t('common.save') }}
                    </v-btn>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      density="compact"
                      :loading="isProbeUpgrading(row.probe_id)"
                      :disabled="Boolean(getUpgradeDisabledReason(row))"
                      :title="getUpgradeDisabledReason(row)"
                      @click="upgradeProbe(row)"
                    >
                      {{ $t('admin.upgrade') }}
                    </v-btn>
                    <v-btn
                      variant="text"
                      color="error"
                      density="compact"
                      @click="deleteProbe(row.probe_id)"
                    >
                      {{ $t('admin.delete') }}
                    </v-btn>
                  </div>
                  <div v-if="getUpgradeNote(row)" class="upgrade-note">
                    {{ getUpgradeNote(row) }}
                  </div>
                </v-card>
              </div>
            </div>
          </div>
        </v-window-item>

        <!-- 连接密钥 -->
        <v-window-item value="keys">
          <div class="tab-content">
            <v-card variant="outlined">
              <v-card-title>{{ $t('admin.secretConfig') }}</v-card-title>
              <v-card-text>
                <p class="hint">
                  {{ $t('admin.secretHint') }}
                </p>

                <v-textarea
                  v-model="config.shared_secret"
                  :label="$t('admin.connectionSecret')"
                  :placeholder="$t('admin.secretPlaceholder')"
                  rows="3"
                  variant="outlined"
                  auto-grow
                />

                <div class="actions-row">
                  <v-btn color="primary" @click="saveConfig">
                    {{ $t('common.save') }}
                  </v-btn>
                  <v-btn variant="tonal" @click="generateSecret">
                    {{ $t('admin.generate') }}
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>

            <v-card variant="outlined" style="margin-top: 20px">
              <v-card-title>{{ $t('admin.address') }}</v-card-title>
              <v-card-text>
                <p class="hint">
                  {{ $t('admin.connectAddressHint') }}
                </p>

                <div class="code-box">
                  <code>{{ wsUrl }}</code>
                  <v-btn size="small" variant="tonal" @click="copyAddress">
                    {{ $t('admin.copyAddress') }}
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </v-window-item>

        <!-- 禁测网段 -->
        <v-window-item value="blocked">
          <div class="tab-content">
            <v-card variant="outlined">
              <v-card-title>{{ $t('admin.blockedConfig') }}</v-card-title>
              <v-card-text>
                <p class="hint">
                  {{ $t('admin.blockedHint') }}
                </p>

                <v-textarea
                  v-model="config.blocked_networks"
                  :label="$t('admin.blockedNetworks')"
                  :placeholder="$t('admin.blockedPlaceholder')"
                  rows="6"
                  variant="outlined"
                  auto-grow
                />

                <div class="actions-row">
                  <v-btn color="primary" @click="saveConfig">
                    {{ $t('common.save') }}
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </v-window-item>

        <!-- 测试参数 -->
        <v-window-item value="test">
          <div class="tab-content">
            <v-card variant="outlined">
              <v-card-title>{{ $t('admin.testConfig') }}</v-card-title>
              <v-card-text>
                <p class="hint">
                  {{ $t('admin.testHint') }}
                </p>

                <div class="test-config-grid">
                  <v-text-field
                    v-model.number="config.ping_max_runs"
                    type="number"
                    density="compact"
                    variant="outlined"
                    :label="$t('admin.pingMaxRuns')"
                    hide-details
                  />

                  <v-text-field
                    v-model.number="config.tcp_ping_max_runs"
                    type="number"
                    density="compact"
                    variant="outlined"
                    :label="$t('admin.tcpPingMaxRuns')"
                    hide-details
                  />

                  <v-text-field
                    v-model.number="config.traceroute_timeout_seconds"
                    type="number"
                    density="compact"
                    variant="outlined"
                    :label="$t('admin.tracerouteTimeoutSeconds')"
                    hide-details
                  />

                  <v-text-field
                    v-model.number="config.mtr_timeout_seconds"
                    type="number"
                    density="compact"
                    variant="outlined"
                    :label="$t('admin.mtrTimeoutSeconds')"
                    hide-details
                  />
                </div>

                <div class="actions-row">
                  <v-btn color="primary" @click="saveConfig">
                    {{ $t('common.save') }}
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </v-window-item>
      </v-window>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import api from '@/utils/request'
import { getProbeMetadataSummary } from '@/utils/probe'

const router = useRouter()
const ui = useUiStore()
const { t: $t, te: $te } = useI18n()

const activeTab = ref('nodes')
const loading = ref(false)

type AdminProbeRow = {
  probe_id: string
  name: string
  version?: string
  location?: string
  status?: string
  ip_address?: string
  metadata?: unknown
  upgrade_supported?: boolean
  upgrade_reason?: string
  deploy_mode?: string
  upgrade_channel?: string
  latest_upgrade?: AdminProbeUpgrade | null

  // 前端派生字段（用于展示）
  provider_label?: string
}

type AdminProbeUpgrade = {
  upgrade_id: string
  target_version: string
  status: string
  error_message?: string | null
}

type AdminConfig = {
  shared_secret: string
  blocked_networks: string

  ping_max_runs: number
  tcp_ping_max_runs: number
  traceroute_timeout_seconds: number
  mtr_timeout_seconds: number
}

const probes = ref<AdminProbeRow[]>([])
const savingProbeIds = ref<string[]>([])
const upgradingProbeIds = ref<string[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null
const config = ref<AdminConfig>({
  shared_secret: '',
  blocked_networks: '',

  ping_max_runs: 100,
  tcp_ping_max_runs: 100,
  traceroute_timeout_seconds: 60,
  mtr_timeout_seconds: 60,
})

const wsUrl = computed(() => {
  const protocol = globalThis.location?.protocol
  const host = globalThis.location?.host
  const scheme = protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${host}/ws`
})

function normalizePositiveInt(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

function getUpgradeStatusLabel(status?: string) {
  const normalized = typeof status === 'string' ? status.trim() : ''
  const key = `admin.upgradeStates.${normalized}`
  return normalized && $te(key) ? String($t(key)) : normalized || String($t('common.unknown'))
}

function getUpgradeStatusColor(status?: string) {
  switch ((status || '').trim()) {
    case 'applied':
      return 'success'
    case 'accepted':
      return 'primary'
    case 'queued':
      return 'warning'
    case 'rejected':
    case 'failed':
    case 'timeout':
      return 'error'
    default:
      return 'secondary'
  }
}

function getUpgradeDisabledReason(probe: AdminProbeRow) {
  if (!probe.upgrade_supported) {
    return probe.upgrade_reason || String($t('admin.upgradeUnsupported'))
  }

  const status = probe.latest_upgrade?.status?.trim()
  if (status === 'queued' || status === 'accepted') {
    return String($t('admin.upgradeInProgress'))
  }

  return ''
}

function getUpgradeNote(probe: AdminProbeRow) {
  if (probe.latest_upgrade) {
    const parts = [
      `${String($t('admin.latestUpgrade'))}: ${getUpgradeStatusLabel(probe.latest_upgrade.status)}`,
      probe.latest_upgrade.target_version,
    ].filter(Boolean)

    if (probe.latest_upgrade.error_message) {
      parts.push(probe.latest_upgrade.error_message)
    }

    return parts.join(' · ')
  }

  if (!probe.upgrade_supported) {
    return getUpgradeDisabledReason(probe)
  }

  return ''
}

async function loadProbes() {
  loading.value = true
  try {
    type ProbesResponse = {
      probes: AdminProbeRow[]
    }
    const response = await api.get<ProbesResponse>('/admin/probes')
    probes.value = (response.probes as AdminProbeRow[]).map(p => {
      const metadata = getProbeMetadataSummary(p.metadata)
      const next: AdminProbeRow = {
        ...p,
        version: metadata.version || '',
        provider_label: metadata.providerLabel || '',
        latest_upgrade: p.latest_upgrade || null,
      }
      return next
    })
  } finally {
    loading.value = false
  }
}

async function loadConfig() {
  try {
    type ConfigResponse = {
      shared_secret?: string
      blocked_networks?: string

      ping_max_runs?: string
      tcp_ping_max_runs?: string
      traceroute_timeout_seconds?: string
      mtr_timeout_seconds?: string
    }
    const response = await api.get<ConfigResponse>('/admin/config')

    const pingMaxRuns = Number(response.ping_max_runs)
    const tcpPingMaxRuns = Number(response.tcp_ping_max_runs)
    const tracerouteTimeoutSeconds = Number(response.traceroute_timeout_seconds)
    const mtrTimeoutSeconds = Number(response.mtr_timeout_seconds)

    config.value = {
      shared_secret: response.shared_secret || '',
      blocked_networks: response.blocked_networks || '',

      ping_max_runs:
        Number.isFinite(pingMaxRuns) && pingMaxRuns > 0 ? Math.floor(pingMaxRuns) : 100,
      tcp_ping_max_runs:
        Number.isFinite(tcpPingMaxRuns) && tcpPingMaxRuns > 0 ? Math.floor(tcpPingMaxRuns) : 100,
      traceroute_timeout_seconds:
        Number.isFinite(tracerouteTimeoutSeconds) && tracerouteTimeoutSeconds > 0
          ? Math.floor(tracerouteTimeoutSeconds)
          : 60,
      mtr_timeout_seconds:
        Number.isFinite(mtrTimeoutSeconds) && mtrTimeoutSeconds > 0
          ? Math.floor(mtrTimeoutSeconds)
          : 60,
    }
  } catch (error) {
    console.error(error)
  }
}

async function updateProbe(probe: AdminProbeRow) {
  savingProbeIds.value = [...savingProbeIds.value, probe.probe_id]
  try {
    await api.put(`/admin/probes/${probe.probe_id}`, {
      name: probe.name,
    })
    await loadProbes()
    ui.notify(String($t('admin.updateSuccess')), 'success')
  } catch {
    ui.notify(String($t('admin.updateFailed')), 'error')
  } finally {
    savingProbeIds.value = savingProbeIds.value.filter(id => id !== probe.probe_id)
  }
}

function isProbeSaving(probeId: string) {
  return savingProbeIds.value.includes(probeId)
}

function isProbeUpgrading(probeId: string) {
  return upgradingProbeIds.value.includes(probeId)
}

async function upgradeProbe(probe: AdminProbeRow) {
  const disabledReason = getUpgradeDisabledReason(probe)
  if (disabledReason) {
    ui.notify(disabledReason, 'error')
    return
  }

  const requestedVersion = globalThis.prompt(String($t('admin.upgradePrompt')), '')?.trim()
  if (requestedVersion === undefined) {
    return
  }

  const target = probe.name || probe.probe_id
  const confirmed = await ui.confirm(
    requestedVersion
      ? String($t('admin.upgradeConfirmVersion', { target, version: requestedVersion }))
      : String($t('admin.upgradeConfirmLatest', { target })),
    {
      title: String($t('common.confirm')),
    }
  )
  if (!confirmed) {
    return
  }

  upgradingProbeIds.value = [...upgradingProbeIds.value, probe.probe_id]
  try {
    type UpgradeResponse = {
      upgrade?: AdminProbeUpgrade
    }
    const response = await api.post<UpgradeResponse>(
      `/admin/probes/${probe.probe_id}/upgrade`,
      requestedVersion ? { version: requestedVersion } : {}
    )
    await loadProbes()
    const targetVersion = response.upgrade?.target_version || requestedVersion || '-'
    ui.notify(
      requestedVersion
        ? String($t('admin.upgradeQueuedVersion', { version: targetVersion }))
        : String($t('admin.upgradeQueuedLatest', { version: targetVersion })),
      'success'
    )
  } catch {
    ui.notify(String($t('admin.upgradeFailed')), 'error')
  } finally {
    upgradingProbeIds.value = upgradingProbeIds.value.filter(id => id !== probe.probe_id)
  }
}

async function deleteProbe(probeId: string) {
  try {
    const confirmed = await ui.confirm(String($t('admin.deleteConfirm')), {
      title: String($t('common.confirm')),
    })
    if (!confirmed) return

    await api.delete(`/admin/probes/${probeId}`)
    ui.notify(String($t('admin.deleteSuccess')), 'success')
    loadProbes()
  } catch {
    ui.notify(String($t('admin.deleteFailed')), 'error')
  }
}

async function saveConfig() {
  try {
    await api.put('/admin/config', {
      shared_secret: config.value.shared_secret,
      blocked_networks: config.value.blocked_networks,
      ping_max_runs: normalizePositiveInt(config.value.ping_max_runs, 100),
      tcp_ping_max_runs: normalizePositiveInt(config.value.tcp_ping_max_runs, 100),
      traceroute_timeout_seconds: normalizePositiveInt(config.value.traceroute_timeout_seconds, 60),
      mtr_timeout_seconds: normalizePositiveInt(config.value.mtr_timeout_seconds, 60),
    })
    await loadConfig()
    ui.notify(String($t('admin.saveSuccess')), 'success')
  } catch {
    ui.notify(String($t('admin.saveFailed')), 'error')
  }
}

async function generateSecret() {
  try {
    type SecretResponse = {
      shared_secret?: string
    }
    const response = await api.get<SecretResponse>('/admin/generate-secret')
    if (response.shared_secret) {
      config.value.shared_secret = response.shared_secret
      ui.notify(String($t('admin.generateSuccess')), 'success')
    }
  } catch {
    ui.notify(String($t('admin.generateFailed')), 'error')
  }
}

function copyAddress() {
  navigator.clipboard.writeText(wsUrl.value).then(() => {
    ui.notify(String($t('admin.copyAddressSuccess')), 'success')
  })
}

function logout() {
  localStorage.removeItem('admin_token')
  router.push('/login')
}

onMounted(() => {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    router.push('/login')
    return
  }

  loadProbes()
  loadConfig()
  refreshTimer = setInterval(() => {
    void loadProbes()
  }, 10000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: var(--bg);
  padding: 24px;
  color: var(--text);
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.admin-header h1 {
  margin: 0;
  color: var(--text);
}

.admin-card {
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 30px var(--shadow);
}

.tab-content {
  padding: 20px;
}

.admin-probes-section {
  display: grid;
  gap: 16px;
}

.admin-table-wrap {
  overflow-x: auto;
}

.hint {
  color: var(--text-2);
  font-size: 14px;
  margin-bottom: 16px;
}

.actions-row {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.version-cell {
  display: grid;
  gap: 6px;
}

.upgrade-note {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.4;
}

.mobile-probe-list {
  display: none;
}

.probe-card {
  padding: 16px;
  border-radius: 12px;
  background: var(--surface);
}

.probe-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.probe-card-title-wrap {
  min-width: 0;
}

.probe-card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.probe-name-field {
  margin-top: 12px;
}

.probe-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.probe-meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.upgrade-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.probe-meta-label {
  font-size: 12px;
  color: var(--text-2);
}

.test-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .test-config-grid {
    grid-template-columns: 1fr;
  }
}

.code-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-2);
  padding: 12px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  border: 1px solid var(--border);
}

.code-box code {
  flex: 1;
}

.probe-id {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
}

.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .admin-page {
    padding: 16px 12px;
  }

  .tab-content {
    padding: 16px 12px;
  }

  .actions-row,
  .code-box {
    flex-direction: column;
    align-items: stretch;
  }

  .code-box code {
    word-break: break-all;
  }
}

@media (max-width: 720px) {
  .desktop-only {
    display: none;
  }

  .mobile-probe-list {
    display: grid;
    gap: 12px;
  }

  .probe-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
