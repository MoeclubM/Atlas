<template>
  <div class="single-test-result">
    <div class="page-header">
      <v-btn variant="text" @click="router.back()">
        {{ $t('common.back') }}
      </v-btn>
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

        <div v-else class="table-scroll">
          <v-table>
            <thead>
              <tr>
                <th style="width: 220px">
                  {{ $t('home.probeLabel') }}
                </th>
                <th style="width: 160px">
                  {{ $t('results.resolvedIP') }}
                </th>
                <th style="width: 160px">
                  {{ $t('results.targetISP') }}
                </th>
                <th v-if="isHTTPTask" style="width: 110px">
                  {{ $t('results.httpStatus') }}
                </th>
                <th style="width: 130px">
                  {{ $t('singleResult.latency') }}
                </th>
                <th style="width: 100px">
                  {{ $t('singleResult.lossRate') }}
                </th>
                <th>{{ $t('singleResult.stats') }}</th>
                <th style="width: 110px">
                  {{ $t('results.status') }}
                </th>
                <th style="width: 110px">
                  {{ $t('common.actions') }}
                </th>
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
                    :target-asn="row.target_asn"
                    :target-as-name="row.target_as_name"
                    :target-isp="row.target_isp"
                  />
                </td>
                <td v-if="isHTTPTask">
                  <v-chip
                    v-if="row.http_status_code !== undefined"
                    size="small"
                    variant="tonal"
                    :color="getHTTPStatusChipColor(row.http_status_code)"
                  >
                    {{ row.http_status_code }}
                  </v-chip>
                  <span v-else>-</span>
                </td>
                <td>
                  <v-chip
                    v-if="row.avg_latency !== undefined"
                    size="small"
                    variant="tonal"
                    :color="getLatencyHex(row.avg_latency, 'success')"
                  >
                    {{ row.avg_latency.toFixed(2) }} {{ $t('common.ms') }}
                  </v-chip>
                  <span v-else>-</span>
                </td>
                <td>
                  <span v-if="row.packet_loss !== undefined"
                    >{{ row.packet_loss.toFixed(1) }}%</span
                  >
                  <span v-else>-</span>
                </td>
                <td>
                  <div v-if="row.min_latency !== undefined" class="stats-cell">
                    <span
                      >{{ $t('singleResult.min') }}: {{ row.min_latency.toFixed(2) }}
                      {{ $t('common.ms') }}</span
                    >
                    <span
                      >{{ $t('singleResult.max') }}: {{ row.max_latency?.toFixed(2) || '-' }}
                      {{ $t('common.ms') }}</span
                    >
                    <span
                      >{{ $t('singleResult.stdev') }}: {{ row.stddev?.toFixed(2) || '-' }}
                      {{ $t('common.ms') }}</span
                    >
                  </div>
                  <div v-else-if="row.test_type === 'traceroute'" class="stats-cell">
                    <span
                      >{{ $t('singleResult.routeHops') }}:
                      {{ row.traceroute_total_hops ?? 0 }}</span
                    >
                    <span>{{
                      row.traceroute_success ? $t('home.route.arrived') : $t('common.failed')
                    }}</span>
                  </div>
                  <div v-else-if="row.test_type === 'mtr'" class="stats-cell">
                    <span>{{ $t('singleResult.routeHops') }}: {{ row.mtr_total_hops ?? 0 }}</span>
                    <span>{{
                      row.mtr_success ? $t('home.route.arrived') : $t('common.failed')
                    }}</span>
                  </div>
                  <span v-else>-</span>
                </td>
                <td>
                  <v-chip size="small" variant="tonal" :color="getResultStatusColor(row.status)">
                    {{
                      row.status === 'success'
                        ? $t('common.success')
                        : row.status === 'failed'
                          ? $t('common.failed')
                          : $t('common.unknown')
                    }}
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
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="detailVisible" max-width="600">
      <v-card>
        <v-card-title>{{ $t('singleResult.detailTitle') }}</v-card-title>
        <v-card-text v-if="currentDetail">
          <v-table density="compact">
            <tbody>
              <tr>
                <th style="width: 140px">
                  {{ $t('singleResult.location') }}
                </th>
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
                    :target-asn="currentDetail.target_asn"
                    :target-as-name="currentDetail.target_as_name"
                    :target-isp="currentDetail.target_isp"
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
                  <v-chip
                    size="small"
                    variant="tonal"
                    :color="getResultStatusColor(currentDetail.status)"
                  >
                    {{
                      currentDetail.status === 'success'
                        ? $t('common.success')
                        : currentDetail.status === 'failed'
                          ? $t('common.failed')
                          : $t('common.unknown')
                    }}
                  </v-chip>
                </td>
              </tr>
              <tr v-if="currentDetail.http_status_code !== undefined">
                <th>{{ $t('results.httpStatus') }}</th>
                <td>
                  <v-chip
                    size="small"
                    variant="tonal"
                    :color="getHTTPStatusChipColor(currentDetail.http_status_code)"
                  >
                    {{ currentDetail.http_status_code }}
                  </v-chip>
                  <span v-if="currentDetail.http_response_status" style="margin-left: 8px">{{
                    currentDetail.http_response_status
                  }}</span>
                </td>
              </tr>
              <tr v-if="currentDetail.http_final_url">
                <th>{{ $t('results.finalUrl') }}</th>
                <td class="detail-url">
                  {{ currentDetail.http_final_url }}
                </td>
              </tr>
            </tbody>
          </v-table>

          <HttpHeadersGrid
            v-if="currentDetail.test_type === 'http_test'"
            :result-data="currentDetail.raw_data"
            key-prefix="single-detail"
          />

          <div
            v-if="currentDetail.test_type === 'traceroute' && currentDetail.traceroute_hops?.length"
            style="margin-top: 20px"
          >
            <h4>{{ $t('results.tracerouteDetail') }}</h4>
            <v-table density="compact">
              <thead>
                <tr>
                  <th style="width: 70px">
                    {{ $t('home.route.hop') }}
                  </th>
                  <th>{{ $t('home.route.ip') }}</th>
                  <th style="width: 160px">
                    {{ $t('home.route.rtt') }}
                  </th>
                  <th style="width: 90px">
                    {{ $t('results.status') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="hop in currentDetail.traceroute_hops" :key="hop.hop">
                  <td>{{ hop.hop }}</td>
                  <td>
                    <div>{{ hop.ip || '*' }}</div>
                    <div v-if="hop.hostname" class="hop-geo">
                      {{ hop.hostname }}
                    </div>
                    <div v-if="hop.geo" class="hop-geo">
                      {{
                        [hop.geo.isp, hop.geo.country, hop.geo.region, hop.geo.city]
                          .filter(Boolean)
                          .join(' ')
                      }}
                    </div>
                  </td>
                  <td>
                    <span v-if="hop.timeout">-</span>
                    <span v-else-if="hop.rtts?.length">{{
                      hop.rtts.map(value => `${value.toFixed(1)} ${$t('common.ms')}`).join(' / ')
                    }}</span>
                    <span v-else>-</span>
                  </td>
                  <td>
                    {{
                      hop.timeout ? $t('common.timeout') : hop.ip ? $t('home.route.arrived') : '-'
                    }}
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <div
            v-if="currentDetail.test_type === 'mtr' && currentDetail.mtr_hops?.length"
            style="margin-top: 20px"
          >
            <h4>{{ $t('results.mtrDetail') }}</h4>
            <v-table density="compact">
              <thead>
                <tr>
                  <th style="width: 70px">
                    {{ $t('home.route.hop') }}
                  </th>
                  <th>{{ $t('home.route.ip') }}</th>
                  <th style="width: 90px; text-align: right">
                    {{ $t('home.route.lossPercent') }}
                  </th>
                  <th style="width: 90px; text-align: right">
                    {{ $t('home.route.sent') }}
                  </th>
                  <th style="width: 110px; text-align: right">
                    {{ $t('home.route.avg') }}
                  </th>
                  <th style="width: 140px; text-align: right">
                    {{ $t('home.route.best') }}/{{ $t('home.route.worst') }}
                  </th>
                  <th style="width: 100px; text-align: right">
                    {{ $t('home.route.stdev') }}
                  </th>
                  <th style="width: 90px; text-align: right">
                    {{ $t('results.status') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="hop in currentDetail.mtr_hops" :key="hop.hop">
                  <td>{{ hop.hop }}</td>
                  <td>
                    <div>{{ hop.ip || '*' }}</div>
                    <div v-if="hop.hostname" class="hop-geo">
                      {{ hop.hostname }}
                    </div>
                    <div v-if="hop.geo" class="hop-geo">
                      {{
                        [hop.geo.isp, hop.geo.country, hop.geo.region, hop.geo.city]
                          .filter(Boolean)
                          .join(' ')
                      }}
                    </div>
                  </td>
                  <td style="text-align: right">
                    {{ hop.lossPercent !== undefined ? `${hop.lossPercent.toFixed(1)}%` : '-' }}
                  </td>
                  <td style="text-align: right">{{ hop.sent ?? '-' }}</td>
                  <td style="text-align: right">
                    {{
                      hop.avgRttMs !== undefined
                        ? `${hop.avgRttMs.toFixed(1)} ${$t('common.ms')}`
                        : '-'
                    }}
                  </td>
                  <td style="text-align: right">
                    {{
                      hop.bestRttMs !== undefined || hop.worstRttMs !== undefined
                        ? `${hop.bestRttMs?.toFixed(1) ?? '-'} / ${
                            hop.worstRttMs?.toFixed(1) ?? '-'
                          } ${$t('common.ms')}`
                        : '-'
                    }}
                  </td>
                  <td style="text-align: right">
                    {{
                      hop.stddevRttMs !== undefined
                        ? `${hop.stddevRttMs.toFixed(1)} ${$t('common.ms')}`
                        : '-'
                    }}
                  </td>
                  <td style="text-align: right">
                    {{
                      hop.timeout ? $t('common.timeout') : hop.ip ? $t('home.route.arrived') : '-'
                    }}
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <div v-if="currentDetail.raw_data" style="margin-top: 20px">
            <h4>{{ $t('resultsPage.rawData') }}</h4>
            <pre class="json-data">{{ JSON.stringify(currentDetail.raw_data, null, 2) }}</pre>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="detailVisible = false">
            {{ $t('common.close') }}
          </v-btn>
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
import HttpHeadersGrid from '@/components/HttpHeadersGrid.vue'
import ProviderCell from '@/components/ProviderCell.vue'
import ProbeCell from '@/components/ProbeCell.vue'
import { useUiStore } from '@/stores/ui'
import { parseMaybeJSON } from '@/utils/parse'
import { hasValidCoordinates } from '@/utils/coordinate'
import { getLatencyHex } from '@/utils/latency'
import api from '@/utils/request'
import {
  getAvgLatency,
  getHTTPStatusChipColor,
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
  type MTRHop,
  type TracerouteHop,
} from '@/utils/result'
import { getProbeMetadataSummary, normalizeProbeCoordinates } from '@/utils/probe'

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
  http_status_code?: number
  http_final_url?: string
  http_response_status?: string
  min_latency?: number
  max_latency?: number
  stddev?: number
  packet_loss?: number
  traceroute_hops?: TracerouteHop[]
  traceroute_total_hops?: number
  traceroute_success?: boolean
  mtr_hops?: MTRHop[]
  mtr_total_hops?: number
  mtr_success?: boolean
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
const isHTTPTask = computed(() => results.value.some(result => result.test_type === 'http_test'))

// 地图标记点数据
const probeMarkers = computed<ProbeMarker[]>(() => {
  return results.value
    .map(result => {
      const probe = result.probe
      if (!probe || !hasValidCoordinates(probe.latitude, probe.longitude)) return null

      const summary = parseMaybeJSON(result.summary)
      const latestHTTPAttempt = getLatestHTTPAttempt(result.result_data)
      const traceroute = getTracerouteResult(result.result_data)
      const mtr = getMTRResult(result.result_data)
      const status = latestHTTPAttempt?.status
        ? latestHTTPAttempt.status
        : mtr
          ? mtr.success === false
            ? 'failed'
            : result.status || 'success'
          : traceroute
            ? traceroute.success === false
              ? 'failed'
              : result.status || 'success'
            : result.status || 'timeout'
      const validStatus: 'success' | 'failed' | 'timeout' =
        status === 'success' || status === 'failed' ? status : 'timeout'

      return {
        probe_id: probe.probe_id,
        name: probe.name,
        location: probe.location,
        latitude: probe.latitude,
        longitude: probe.longitude,
        latency: latestHTTPAttempt?.timeMs ?? getAvgLatency(summary, result.result_data),
        status: validStatus,
        packetLoss: getPacketLossPercent(result.summary, result.result_data),
      } as ProbeMarker
    })
    .filter((m): m is ProbeMarker => m !== null)
})

// 节点结果数据
const probeResults = computed<ProbeResultRow[]>(() => {
  return results.value.map(result => {
    const summary = parseMaybeJSON(result.summary)
    const data = parseMaybeJSON(result.result_data)
    const metadata = getProbeMetadataSummary(result.probe?.metadata)
    const targetNetwork = getTargetNetworkInfo(summary, data)
    const latestHTTPAttempt = getLatestHTTPAttempt(data)
    const traceroute = getTracerouteResult(data)
    const mtr = getMTRResult(data)
    const derivedStatus = latestHTTPAttempt?.status
      ? latestHTTPAttempt.status
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
      probe_id: result.probe?.probe_id,
      probe_name: result.probe?.name || String($t('common.unknown')),
      location: result.probe?.location || String($t('common.unknown')),
      provider: metadata.providerLabel,
      target: result.target,
      ip_address: getResolvedIP(summary, data, result.target) || '-',
      target_asn: targetNetwork.asn,
      target_as_name: targetNetwork.asName,
      target_isp: targetNetwork.isp,
      avg_latency: latestHTTPAttempt?.timeMs ?? getAvgLatency(summary, data),
      http_status_code: getHTTPStatusCode(summary, data),
      http_final_url: latestHTTPAttempt?.finalURL,
      http_response_status: latestHTTPAttempt?.responseStatus,
      min_latency: getMinLatency(summary, data),
      max_latency: getMaxLatency(summary, data),
      stddev: getStddevLatency(summary, data),
      packet_loss: getPacketLossPercent(summary, data),
      traceroute_hops: traceroute?.hops,
      traceroute_total_hops: traceroute?.totalHops ?? traceroute?.hops.length,
      traceroute_success: traceroute?.success,
      mtr_hops: mtr?.hops,
      mtr_total_hops: mtr?.totalHops ?? mtr?.hops.length,
      mtr_success: mtr?.success,
      status: derivedStatus,
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
      (probesRes.probes as RawProbeRow[]).map(p => {
        const normalized = normalizeProbeCoordinates(p)
        return [
          p.probe_id,
          {
            probe_id: p.probe_id,
            name: (p.name as string) || String($t('common.unknown')),
            location: (p.location as string) || String($t('common.unknown')),
            metadata: p.metadata,
            latitude: normalized.latitude,
            longitude: normalized.longitude,
          },
        ]
      })
    )

    results.value = (resultsRes.results as ResultView[]).map(r => ({
      ...r,
      probe: probesMap.get(r.probe_id),
      summary: parseMaybeJSON(r.summary),
      result_data: parseMaybeJSON(r.result_data),
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
  flex-wrap: wrap;
}

.page-title {
  font-size: 18px;
  font-weight: bold;
}

.result-card {
  border-radius: 8px;
}

.table-scroll {
  overflow-x: auto;
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

.detail-url {
  word-break: break-all;
}

.hop-geo {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 2px;
}

.json-data {
  background: var(--surface-2);
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  max-height: 400px;
  overflow-y: auto;
}

@media (max-width: 720px) {
  .single-test-result {
    padding: 12px;
  }

  .page-title {
    font-size: 16px;
    word-break: break-word;
  }
}
</style>
