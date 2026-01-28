<template>
  <div class="admin-page">
    <div class="admin-header">
      <h1>{{ $t('admin.title') }}</h1>
      <v-btn variant="outlined" @click="logout">
        {{ $t('admin.logout') }}
      </v-btn>
    </div>

    <v-card class="admin-card" variant="outlined">
      <v-tabs v-model="activeTab" color="primary">
        <v-tab value="nodes">{{ $t('admin.nodes') }}</v-tab>
        <v-tab value="keys">{{ $t('admin.keysTab') }}</v-tab>
        <v-tab value="blocked">{{ $t('admin.blockedTab') }}</v-tab>
        <v-tab value="test">{{ $t('admin.testTab') }}</v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- 节点列表 -->
        <v-window-item value="nodes">
          <div class="tab-content">
            <v-progress-linear v-if="loading" indeterminate />

            <v-table v-else>
              <thead>
                <tr>
                  <th style="width: 220px">{{ $t('admin.nodeName') }}</th>
                  <th style="width: 320px">{{ $t('admin.nodeId') }}</th>
                  <th style="width: 160px">{{ $t('admin.ipAddress') }}</th>
                  <th style="width: 220px">{{ $t('admin.providerLabel') }}</th>
                  <th>{{ $t('admin.location') }}</th>
                  <th style="width: 110px">{{ $t('admin.status') }}</th>
                  <th style="width: 110px">{{ $t('admin.actions') }}</th>
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
                      @blur="updateProbe(row)"
                    />
                  </td>
                  <td>
                    <code class="probe-id">{{ row.probe_id }}</code>
                  </td>
                  <td>
                    <span class="mono">{{ row.ip_address || '-' }}</span>
                  </td>
                  <td>
                    <span v-if="row.provider_label">
                      {{ $te(`admin.provider.${row.provider_label}`) ? $t(`admin.provider.${row.provider_label}`) : row.provider_label }}
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td>{{ row.location }}</td>
                  <td>
                    <v-chip
                      size="small"
                      variant="tonal"
                      :color="row.status === 'online' ? 'success' : 'secondary'"
                    >
                      {{ row.status === 'online' ? $t('admin.statusOnline') : $t('admin.statusOffline') }}
                    </v-chip>
                  </td>
                  <td>
                    <v-btn
                      variant="text"
                      color="error"
                      density="compact"
                      @click="deleteProbe(row.probe_id)"
                    >
                      {{ $t('admin.delete') }}
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-window-item>

        <!-- 连接密钥 -->
        <v-window-item value="keys">
          <div class="tab-content">
            <v-card variant="outlined">
              <v-card-title>{{ $t('admin.secretConfig') }}</v-card-title>
              <v-card-text>
                <p class="hint">{{ $t('admin.secretHint') }}</p>

                <v-textarea
                  v-model="config.shared_secret"
                  :label="$t('admin.connectionSecret')"
                  :placeholder="$t('admin.secretPlaceholder')"
                  rows="3"
                  variant="outlined"
                  auto-grow
                />

                <div class="actions-row">
                  <v-btn color="primary" @click="saveConfig">{{ $t('common.save') }}</v-btn>
                  <v-btn variant="tonal" @click="generateSecret">{{ $t('admin.generate') }}</v-btn>
                </div>
              </v-card-text>
            </v-card>

            <v-card variant="outlined" style="margin-top: 20px">
              <v-card-title>{{ $t('admin.address') }}</v-card-title>
              <v-card-text>
                <p class="hint">{{ $t('admin.connectAddressHint') }}</p>

                <div class="code-box">
                  <code>{{ wsUrl }}</code>
                  <v-btn size="small" variant="tonal" @click="copyAddress">{{ $t('admin.copyAddress') }}</v-btn>
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
                <p class="hint">{{ $t('admin.blockedHint') }}</p>

                <v-textarea
                  v-model="config.blocked_networks"
                  :label="$t('admin.blockedNetworks')"
                  :placeholder="$t('admin.blockedPlaceholder')"
                  rows="6"
                  variant="outlined"
                  auto-grow
                />

                <div class="actions-row">
                  <v-btn color="primary" @click="saveConfig">{{ $t('common.save') }}</v-btn>
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
                <p class="hint">{{ $t('admin.testHint') }}</p>

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
                </div>

                <div class="actions-row">
                  <v-btn color="primary" @click="saveConfig">{{ $t('common.save') }}</v-btn>
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
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import api from '@/utils/request'
import { getProviderLabelFromMetadata } from '@/utils/provider'

const router = useRouter()
const ui = useUiStore()
const { t: $t, te: $te } = useI18n()

const activeTab = ref('nodes')
const loading = ref(false)

type AdminProbeRow = {
  probe_id: string
  name: string
  location?: string
  status?: string
  ip_address?: string
  metadata?: unknown

  // 前端派生字段（用于展示）
  provider_label?: string
}

type AdminConfig = {
  shared_secret: string
  blocked_networks: string

  ping_max_runs: number
  tcp_ping_max_runs: number
  traceroute_timeout_seconds: number
}

const probes = ref<AdminProbeRow[]>([])
const config = ref<AdminConfig>({
  shared_secret: '',
  blocked_networks: '',

  ping_max_runs: 100,
  tcp_ping_max_runs: 100,
  traceroute_timeout_seconds: 60,
})


const wsUrl = computed(() => {
  const protocol = globalThis.location?.protocol
  const host = globalThis.location?.host
  const scheme = protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${host}/ws`
})



async function loadProbes() {
  loading.value = true
  try {
    type ProbesResponse = {
      probes: AdminProbeRow[]
    }
    const response = await api.get<ProbesResponse>('/probes')
    probes.value = (response.probes as AdminProbeRow[]).map((p) => {
      const next: AdminProbeRow = {
        ...p,
        provider_label: getProviderLabelFromMetadata(p.metadata),
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
    }
    const response = await api.get<ConfigResponse>('/admin/config')

    const pingMaxRuns = Number(response.ping_max_runs)
    const tcpPingMaxRuns = Number(response.tcp_ping_max_runs)
    const tracerouteTimeoutSeconds = Number(response.traceroute_timeout_seconds)

    config.value = {
      shared_secret: response.shared_secret || '',
      blocked_networks: response.blocked_networks || '',

      ping_max_runs: Number.isFinite(pingMaxRuns) && pingMaxRuns > 0 ? Math.floor(pingMaxRuns) : 100,
      tcp_ping_max_runs: Number.isFinite(tcpPingMaxRuns) && tcpPingMaxRuns > 0 ? Math.floor(tcpPingMaxRuns) : 100,
      traceroute_timeout_seconds:
        Number.isFinite(tracerouteTimeoutSeconds) && tracerouteTimeoutSeconds > 0 ? Math.floor(tracerouteTimeoutSeconds) : 60,
    }
  } catch (error) {
    console.error(error)
  }
}

async function updateProbe(probe: AdminProbeRow) {
  try {
    await api.put(`/admin/probes/${probe.probe_id}`, {
      name: probe.name,
    })
    ui.notify(String($t('admin.updateSuccess')), 'success')
  } catch (error) {
    ui.notify(String($t('admin.updateFailed')), 'error')
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
  } catch (error) {
    ui.notify(String($t('admin.deleteFailed')), 'error')
  }
}

async function saveConfig() {
  try {
    await api.put('/admin/config', {
      ...config.value,
      ping_max_runs: String(config.value.ping_max_runs),
      tcp_ping_max_runs: String(config.value.tcp_ping_max_runs),
      traceroute_timeout_seconds: String(config.value.traceroute_timeout_seconds),
    })
    ui.notify(String($t('admin.saveSuccess')), 'success')
  } catch (error) {
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
  } catch (e) {
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
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-variant-numeric: tabular-nums;
}
</style>
