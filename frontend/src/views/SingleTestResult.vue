<template>
  <div class="single-test-result">
    <div class="page-header">
      <v-btn variant="text" @click="router.back()">{{ $t('common.back') }}</v-btn>
      <div class="page-title">{{ $t('resultsPage.title') }} - {{ taskId }}</div>
      <v-chip size="small" variant="tonal" :color="statusColor">
        {{ statusText }}
      </v-chip>
    </div>

    <v-card class="result-card" variant="outlined">
      <v-card-title class="card-header">
        <v-icon icon="mdi-earth" />
        <span>{{ $t('singleResult.worldMap') }}</span>
      </v-card-title>
      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <WorldMap :probes="probeMarkers" height="500px" />
      </v-card-text>
    </v-card>

    <v-card class="result-card" variant="outlined" style="margin-top: 20px">
      <v-card-title class="card-header">
        <v-icon icon="mdi-format-list-bulleted" />
        <span>{{ $t('singleResult.probeData') }}</span>
      </v-card-title>

      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <v-table v-else>
          <thead>
            <tr>
              <th style="width: 220px">{{ $t('home.probeLabel') }}</th>
              <th style="width: 160px">{{ $t('results.resolvedIP') }}</th>
              <th style="width: 160px">{{ $t('results.targetISP') }}</th>
              <th style="width: 130px">{{ $t('singleResult.latency') }}</th>
              <th style="width: 100px">{{ $t('singleResult.lossRate') }}</th>
              <th>{{ $t('singleResult.stats') }}</th>
              <th style="width: 110px">{{ $t('results.status') }}</th>
              <th style="width: 110px">{{ $t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in probeResults" :key="row.probe_id || row.probe_name">
              <td>
                <ProbeCell :location="row.location" :provider="row.provider" />
              </td>
              <td>{{ row.ip_address }}</td>
              <td>
                <ProviderCell
                  :target_asn="row.target_asn"
                  :target_as_name="row.target_as_name"
                  :target_isp="row.target_isp"
                />
              </td>
              <td>
                <v-chip
                  v-if="row.avg_latency !== undefined"
                  size="small"
                  variant="tonal"
                  :color="getLatencyColor(row.avg_latency)"
                >
                  {{ row.avg_latency.toFixed(2) }} {{ $t('common.ms') }}
                </v-chip>
                <span v-else>-</span>
              </td>
              <td>
                <span v-if="row.packet_loss !== undefined">{{ row.packet_loss.toFixed(1) }}%</span>
                <span v-else>-</span>
              </td>
              <td>
                <div v-if="row.min_latency !== undefined" class="stats-cell">
                  <span>{{ $t('singleResult.min') }}: {{ row.min_latency.toFixed(2) }} {{ $t('common.ms') }}</span>
                  <span>{{ $t('singleResult.max') }}: {{ row.max_latency?.toFixed(2) || '-' }} {{ $t('common.ms') }}</span>
                  <span>{{ $t('singleResult.stdev') }}: {{ row.stddev?.toFixed(2) || '-' }} {{ $t('common.ms') }}</span>
                </div>
                <span v-else>-</span>
              </td>
              <td>
                <v-chip size="small" variant="tonal" :color="getResultStatusColor(row.status)">
                  {{ row.status === 'success' ? $t('common.success') : row.status === 'failed' ? $t('common.failed') : $t('common.unknown') }}
                </v-chip>
              </td>
              <td>
                <v-btn variant="text" color="primary" density="compact" @click="showDetail(row)">
                  {{ $t('common.detail') }}
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="detailVisible" max-width="600">
      <v-card>
        <v-card-title>{{ $t('singleResult.detailTitle') }}</v-card-title>
        <v-card-text v-if="currentDetail">
          <v-table density="compact">
            <tbody>
              <tr>
                <th style="width: 140px">{{ $t('singleResult.location') }}</th>
                <td>{{ currentDetail.location }}</td>
              </tr>
              <tr v-if="currentDetail.provider">
                <th>{{ $t('singleResult.provider') }}</th>
                <td>{{ currentDetail.provider }}</td>
              </tr>
              <tr>
                <th>{{ $t('taskTable.target') }}</th>
                <td>{{ currentDetail.target }}</td>
              </tr>
              <tr>
                <th>{{ $t('results.resolvedIP') }}</th>
                <td>{{ currentDetail.ip_address }}</td>
              </tr>
              <tr>
                <th>{{ $t('results.targetISP') }}</th>
                <td>
                  <ProviderCell
                    :target_asn="currentDetail.target_asn"
                    :target_as_name="currentDetail.target_as_name"
                    :target_isp="currentDetail.target_isp"
                  />
                </td>
              </tr>
              <tr>
                <th>{{ $t('singleResult.testType') }}</th>
                <td>{{ currentDetail.test_type }}</td>
              </tr>
              <tr>
                <th>{{ $t('results.status') }}</th>
                <td>
                  <v-chip size="small" variant="tonal" :color="getResultStatusColor(currentDetail.status)">
                    {{ currentDetail.status === 'success' ? $t('common.success') : $t('common.failed') }}
                  </v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>

          <div v-if="currentDetail.raw_data" style="margin-top: 20px">
            <h4>{{ $t('resultsPage.rawData') }}</h4>
            <pre class="json-data">{{ JSON.stringify(currentDetail.raw_data, null, 2) }}</pre>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="detailVisible = false">{{ $t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import WorldMap from '@/components/WorldMap.vue'
import type { ProbeMarker } from '@/components/WorldMap.vue'
import ProviderCell from '@/components/ProviderCell.vue'
import ProbeCell from '@/components/ProbeCell.vue'
import { useUiStore } from '@/stores/ui'
import api from '@/utils/request'

type TaskInfo = {
  status?: string
}

type ProbeView = {
  probe_id: string
  name: string
  location: string
  latitude?: number | null
  longitude?: number | null
  metadata?: unknown
}

type ResultView = {
  probe_id: string
  target: string
  test_type: string
  status?: string
  summary?: unknown
  result_data?: unknown
  probe?: ProbeView
}

type ProbeResultRow = {
  probe_id?: string
  probe_name: string
  location: string
  provider?: string
  target: string
  ip_address: string

  target_asn?: string
  target_as_name?: string
  target_isp?: string

  avg_latency?: number
  min_latency?: number
  max_latency?: number
  stddev?: number
  packet_loss?: number
  status: string
  test_type: string
  raw_data?: unknown
}

type RawProbeRow = {
  probe_id: string
  name?: string
  location?: string
  metadata?: unknown
}

const { t: $t } = useI18n()

const ui = useUiStore()

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as string

const loading = ref(true)
const detailVisible = ref(false)

const currentDetail = ref<ProbeResultRow | null>(null)
const taskInfo = ref<TaskInfo | null>(null)
const results = ref<ResultView[]>([])

// 地图标记点数据
const probeMarkers = computed<ProbeMarker[]>(() => {
  return results.value
    .map((result) => {
      const probe = result.probe
      if (!probe?.latitude || !probe?.longitude) return null

      const summary = (result.summary || {}) as Record<string, unknown>
      const status = result.status || 'timeout'
      const validStatus: 'success' | 'failed' | 'timeout' =
        status === 'success' || status === 'failed' ? status : 'timeout'

      return {
        probe_id: probe.probe_id,
        name: probe.name,
        location: probe.location,
        latitude: probe.latitude,
        longitude: probe.longitude,
        latency: (summary['avg_rtt_ms'] as number | undefined) || (summary['avg_latency'] as number | undefined),
        status: validStatus,
        packetLoss: (summary['packet_loss_percent'] as number | undefined) || 0,
      } as ProbeMarker
    })
    .filter((m): m is ProbeMarker => m !== null)
})

// 节点结果数据
const probeResults = computed<ProbeResultRow[]>(() => {
  return results.value.map((result) => {
    const summary = (result.summary || {}) as Record<string, unknown>
    const metadata = (result.probe?.metadata || {}) as Record<string, unknown>
    const provider = (metadata['provider'] as string) || (metadata['isp'] as string) || undefined

    return {
      probe_id: result.probe?.probe_id,
      probe_name: result.probe?.name || String($t('common.unknown')),
      location: result.probe?.location || String($t('common.unknown')),
      provider,
      target: result.target,
      ip_address: (summary['resolved_ip'] as string) || (summary['resolvedIP'] as string) || '-',
      target_asn: (summary['target_asn'] as string) || undefined,
      target_as_name: (summary['target_as_name'] as string) || undefined,
      target_isp: (summary['target_isp'] as string) || undefined,
      avg_latency: (summary['avg_rtt_ms'] as number) || (summary['avg_latency'] as number),
      min_latency: (summary['min_rtt_ms'] as number) || (summary['min_latency'] as number),
      max_latency: (summary['max_rtt_ms'] as number) || (summary['max_latency'] as number),
      stddev: (summary['stddev_rtt_ms'] as number) || (summary['stddev'] as number),
      packet_loss: summary['packet_loss_percent'] as number,
      status: result.status || 'unknown',
      test_type: result.test_type,
      raw_data: result.result_data,
    }
  })
})

const statusText = computed(() => {
  if (!taskInfo.value?.status) return String($t('common.loading'))
  const statusMap: Record<string, string> = {
    pending: String($t('common.pending')),
    running: String($t('common.running')),
    completed: String($t('common.success')),
    failed: String($t('common.failed')),
    cancelled: String($t('common.cancelled')),
  }
  return statusMap[taskInfo.value.status] || taskInfo.value.status
})

const statusColor = computed(() => {
  const s = taskInfo.value?.status
  if (!s) return 'info'
  const map: Record<string, string> = {
    pending: 'info',
    running: 'primary',
    completed: 'success',
    failed: 'error',
    cancelled: 'warning',
  }
  return map[s] || 'info'
})

function getLatencyColor(latency?: number): string {
  if (latency === undefined) return 'info'
  if (latency < 100) return 'success'
  if (latency < 200) return 'warning'
  return 'error'
}

function getResultStatusColor(status: string): string {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'error'
  return 'warning'
}

function showDetail(row: ProbeResultRow) {
  currentDetail.value = row
  detailVisible.value = true
}

async function loadData() {
  try {
    loading.value = true

    // 获取任务信息
    type TaskResponse = {
      task: TaskInfo
    }
    const taskRes = await api.get<TaskResponse>(`/tasks/${taskId}`)
    taskInfo.value = taskRes.task

    // 获取测试结果
    type ResultsResponse = {
      results: ResultView[]
    }
    const resultsRes = await api.get<ResultsResponse>(`/results`, {
      params: { task_id: taskId },
    })

    // 合并探针信息
    type ProbesResponse = {
      probes: RawProbeRow[]
    }
    const probesRes = await api.get<ProbesResponse>('/probes')

    const probesMap = new Map<string, ProbeView>(
      (probesRes.probes as RawProbeRow[]).map((p) => {
        // 解析 metadata 字段，提取坐标信息
        let metadata: Record<string, unknown> = {}
        try {
          metadata = typeof p.metadata === 'string'
            ? (JSON.parse(p.metadata) as Record<string, unknown>)
            : ((p.metadata || {}) as Record<string, unknown>)
        } catch (e) {
          console.error('Failed to parse metadata:', e)
        }

        // 将坐标信息提升到 probe 对象的顶层
        return [
          p.probe_id,
          {
            probe_id: p.probe_id,
            name: (p.name as string) || String($t('common.unknown')),
            location: (p.location as string) || String($t('common.unknown')),
            metadata: p.metadata,
            latitude: metadata?.latitude ? Number(metadata.latitude) : null,
            longitude: metadata?.longitude ? Number(metadata.longitude) : null,
          },
        ]
      })
    )

    results.value = (resultsRes.results as ResultView[]).map((r) => ({
      ...r,
      probe: probesMap.get(r.probe_id),
      summary:
        typeof r.summary === 'string' ? (JSON.parse(r.summary) as Record<string, unknown>) : ((r.summary || {}) as Record<string, unknown>),
      result_data:
        typeof r.result_data === 'string'
          ? (JSON.parse(r.result_data) as Record<string, unknown>)
          : ((r.result_data || {}) as Record<string, unknown>),
    }))
  } catch (error: unknown) {
    console.error('加载数据失败:', error)
    ui.notify(String($t('errors.loadDataFailed')), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.single-test-result {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.page-title {
  font-size: 18px;
  font-weight: bold;
}

.result-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.stats-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.provider-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.provider-line-1 {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.provider-line-2 {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.json-data {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 400px;
  overflow-y: auto;
}
</style>
