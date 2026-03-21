<template>
  <div class="home-page">
    <main class="main">
      <div class="test-container">
        <div class="input-wrapper">
          <div class="target-row">
            <v-select
              v-model="testType"
              :items="testTypes"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="compact"
              hide-details
              single-line
              class="type-select-md3"
              data-testid="home-type-select"
              :label="$t('home.type')"
              style="width: 140px"
              @update:model-value="onSelectType"
            />

            <v-text-field
              ref="targetInput"
              v-model="target"
              class="target-input"
              data-testid="home-target"
              :placeholder="targetPlaceholder"
              variant="outlined"
              density="compact"
              hide-details
              single-line
              clearable
              @keyup.enter="startFromMode"
            />

            <v-select
              v-model="ipVersion"
              :items="ipVersionItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              hide-details
              single-line
              class="ip-select-md3"
              data-testid="home-ip-select"
              :label="$t('home.ip')"
              style="width: 120px"
            />

            <v-btn
              color="primary"
              data-testid="home-start"
              :disabled="!canStart"
              :loading="testing"
              @click="startFromMode"
            >
              {{ $t('home.startTest') }}
            </v-btn>

            <v-btn
              v-if="currentTaskId && (taskStatus === 'scheduling' || taskStatus === 'running')"
              color="error"
              variant="tonal"
              data-testid="home-stop-test"
              @click="stopContinuousTest"
            >
              {{ $t('home.stopTest') }}
            </v-btn>
          </div>
        </div>

        <div
          v-if="supportsContinuous"
          class="param-hint"
        >
          {{ $t('home.continuousHint') }}
        </div>

        <div
          v-if="testType === 'traceroute'"
          class="param-hint"
        >
          {{ $t('home.tracerouteHint') }}
        </div>

        <div
          v-if="testType === 'traceroute'"
          class="probe-select"
        >
          <v-select
            v-model="selectedProbeIds"
            :items="availableProbeItems"
            item-title="title"
            item-value="value"
            :label="$t('home.probeLabel')"
            multiple
            chips
            variant="outlined"
            density="compact"
            hide-details
            class="probe-select-md3"
          />
        </div>
      </div>

      <div
        v-if="hasStartedTask"
        class="results-container"
      >
        <div class="results-header">
          <h2>{{ $t('results.results') }}</h2>
          <div class="results-actions">
            <span
              v-if="taskStatusText"
              class="result-count"
            >{{ taskStatusText }}</span>
            <span
              v-else
              class="result-count"
            >{{ filteredResults.length }} {{ $t('results.nodes') }}</span>
          </div>
        </div>

        <div class="results-filters">
          <v-text-field
            v-model="filterState.keyword"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            :label="$t('common.search')"
          />
        </div>

        <v-progress-linear
          v-if="(taskStatus === 'scheduling' || taskStatus === 'running') && results.length === 0"
          indeterminate
        />

        <v-alert
          v-else-if="filteredResults.length === 0"
          type="info"
          variant="tonal"
          density="compact"
          class="mx-5 my-4"
        >
          {{ $t('home.noMatchedResults') }}
        </v-alert>

        <!-- 地图组件 -->
        <div
          v-if="probeMarkers.length > 0"
          class="map-section"
        >
          <WorldMap
            :probes="probeMarkers"
            height="400px"
          />
        </div>

        <div
          v-if="filteredResults.length > 0"
          class="results-table"
        >
          <v-table density="compact">
            <thead>
              <tr>
                <th style="width: 240px">
                  {{ $t('home.probeLabel') }}
                </th>
                <th style="width: 160px">
                  {{ $t('results.resolvedIP') }}
                </th>
                <th style="width: 180px">
                  {{ $t('results.targetISP') }}
                </th>
                <th
                  v-if="testType === 'http_test'"
                  style="width: 110px; text-align: right"
                >
                  {{ $t('results.httpStatus') }}
                </th>
                <th style="width: 110px; text-align: right">
                  {{ $t('results.loss') }}
                </th>
                <th style="width: 110px; text-align: right">
                  {{ pageMode === 'continuous' ? $t('results.progress') : '' }}
                </th>
                <th style="width: 120px; text-align: right">
                  {{ $t('results.current') }}
                </th>
                <th style="width: 120px; text-align: right">
                  {{ $t('results.avg') }}
                </th>
                <th style="width: 120px; text-align: right">
                  {{ $t('results.min') }}
                </th>
                <th style="width: 120px; text-align: right">
                  {{ $t('results.max') }}
                </th>
                <th style="width: 90px; text-align: right">
                  {{ $t('results.chart') }}
                </th>
              </tr>
            </thead>

            <tbody>
              <template
                v-for="r in filteredResults"
                :key="r.probe_id"
              >
                <tr
                  class="result-row"
                  style="cursor: pointer"
                  @click="toggleExpandedProbe(r.probe_id)"
                >
                  <td>
                    <ProbeCell
                      :location="r.location"
                      :provider="r.provider"
                    />
                  </td>
                  <td>{{ r.resolved_ip || '-' }}</td>
                  <td>
                    <ProviderCell
                      :target-asn="r.target_asn"
                      :target-as-name="r.target_as_name"
                      :target-isp="r.target_isp"
                    />
                  </td>
                  <td
                    v-if="testType === 'http_test'"
                    style="text-align: right"
                    :class="getHTTPStatusTextClass(r.http_status_code)"
                  >
                    {{ r.http_status_code !== undefined ? r.http_status_code : '-' }}
                  </td>
                  <td
                    style="text-align: right"
                    :class="getLossClass(r.packet_loss)"
                  >
                    {{ r.packet_loss !== undefined ? r.packet_loss.toFixed(1) + '%' : '-' }}
                  </td>
                  <td style="text-align: right">
                    {{ pageMode === 'continuous' ? `${r.send_count ?? 0}/${maxRuns}` : '-' }}
                  </td>
                  <td
                    style="text-align: right"
                    :class="getLatencyTextClass(r.last_latency, r.status)"
                  >
                    {{ r.last_latency !== undefined ? r.last_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td
                    style="text-align: right"
                    :class="getLatencyTextClass(r.avg_latency)"
                  >
                    {{ r.avg_latency !== undefined ? r.avg_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td style="text-align: right">
                    {{ r.min_latency !== undefined ? r.min_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td style="text-align: right">
                    {{ r.max_latency !== undefined ? r.max_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td
                    style="text-align: right"
                    @click.stop
                  >
                    <canvas
                      :ref="(el) => registerSparkCanvas(el, r.probe_id)"
                      class="spark-canvas"
                    />
                  </td>
                </tr>

                <tr v-if="expandedProbeIds.includes(r.probe_id)">
                  <td
                    :colspan="resultsColumnCount"
                    class="detail-cell"
                  >
                    <div
                      v-if="tracerouteData[r.probe_id]?.hops?.length"
                      class="row-detail"
                    >
                      <h4 class="detail-title">
                        {{ $t('results.tracerouteDetail') }}
                      </h4>
                      <v-table density="compact">
                        <thead>
                          <tr>
                            <th style="width: 70px">
                              {{ $t('home.route.hop') }}
                            </th>
                            <th>{{ $t('home.route.ip') }}</th>
                            <th style="width: 110px">
                              {{ $t('home.route.rtt') }}
                            </th>
                            <th style="width: 90px">
                              {{ $t('results.status') }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="hop in tracerouteData[r.probe_id].hops"
                            :key="hop.hop"
                          >
                            <td>{{ hop.hop }}</td>
                            <td>
                              <div>{{ hop.ip || '*' }}</div>
                              <div
                                v-if="hop.geo"
                                class="hop-geo"
                              >
                                {{ [hop.geo.isp, hop.geo.country, hop.geo.region, hop.geo.city].filter(Boolean).join(' ') }}
                              </div>
                            </td>
                            <td>
                              <span v-if="hop.timeout">-</span>
                              <span v-else-if="hop.rtts?.length">{{ hop.rtts[0].toFixed(1) }} {{ $t('common.ms') }}</span>
                              <span v-else>-</span>
                            </td>
                            <td>
                              {{ hop.timeout ? $t('common.timeout') : (hop.ip ? $t('home.route.arrived') : '-') }}
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                    </div>

                    <div
                      v-else-if="testType === 'http_test' && getHTTPAttempts(httpDetails[r.probe_id]).length > 0"
                      class="row-detail"
                    >
                      <h4 class="detail-title">
                        {{ $t('results.httpDetail') }}
                      </h4>

                      <v-table density="compact">
                        <thead>
                          <tr>
                            <th style="width: 70px">
                              {{ $t('results.attempt') }}
                            </th>
                            <th style="width: 90px">
                              {{ $t('results.statusCode') }}
                            </th>
                            <th style="width: 110px">
                              {{ $t('singleResult.latency') }}
                            </th>
                            <th style="width: 150px">
                              {{ $t('results.resolvedIP') }}
                            </th>
                            <th>{{ $t('results.finalUrl') }}</th>
                            <th style="width: 90px">
                              {{ $t('results.status') }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="attempt in getHTTPAttempts(httpDetails[r.probe_id])"
                            :key="`${r.probe_id}-${attempt.seq ?? 0}`"
                          >
                            <td>{{ attempt.seq ?? '-' }}</td>
                            <td>{{ attempt.statusCode ?? '-' }}</td>
                            <td>{{ attempt.timeMs !== undefined ? attempt.timeMs.toFixed(1) + ' ' + $t('common.ms') : '-' }}</td>
                            <td>{{ attempt.resolvedIP || '-' }}</td>
                            <td class="http-url-cell">
                              {{ attempt.finalURL || '-' }}
                            </td>
                            <td>{{ attempt.status === 'success' ? $t('common.success') : attempt.status === 'failed' ? $t('common.failed') : $t('common.unknown') }}</td>
                          </tr>
                        </tbody>
                      </v-table>

                      <HttpHeadersGrid
                        :result-data="httpDetails[r.probe_id]"
                        :key-prefix="r.probe_id"
                      />
                    </div>

                    <div
                      v-else
                      class="row-detail-empty"
                    >
                      <span class="text-muted">
                        {{ testType === 'http_test' ? $t('results.noHttpData') : $t('results.noRouteData') }}
                      </span>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </v-table>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/utils/request'
import { parseMaybeJSON } from '@/utils/parse'
import { hasValidCoordinates } from '@/utils/coordinate'
import { buildLatencyScale, getLatencyHex, getLatencyTextClass } from '@/utils/latency'
import { getAvgLatency, getHTTPAttempts, getHTTPStatusCode, getHTTPStatusTextClass, getLatestHTTPAttempt, getMaxLatency, getMinLatency, getPacketLossPercent, getResolvedIP, getTargetNetworkInfo, type HTTPAttempt } from '@/utils/result'
import { getProbeProviderLabel, normalizeProbeCoordinates } from '@/utils/probe'
import HttpHeadersGrid from '@/components/HttpHeadersGrid.vue'
import WorldMap, { type ProbeMarker } from '@/components/WorldMap.vue'
import ProviderCell from '@/components/ProviderCell.vue'
import ProbeCell from '@/components/ProbeCell.vue'

const { t: $t } = useI18n()


const targetInput = ref<any>()
const target = ref('')
const testType = ref('icmp_ping')
const testing = ref(false)

const pageMode = ref<'single' | 'continuous'>('single')

type HomeResultRow = {
  probe_id: string
  location: string
  provider?: string
  http_status_code?: number
  avg_latency?: number
  min_latency?: number
  max_latency?: number
  last_latency?: number
  packet_loss?: number
  send_count?: number
  status?: string

  // 目标解析 IP（域名时为探针解析到的 IP；输入为 IP 时等于输入）
  resolved_ip?: string
  // 目标解析 IP 的 ISP（后端尚未返回时可为空）
  target_isp?: string
  target_asn?: string
  target_as_name?: string
}

type ProbeRecord = {
  probe_id: string
  name: string
  location: string
  latitude?: number | null
  longitude?: number | null
  capabilities?: unknown
  metadata?: unknown
  status?: string
}

type TaskInfo = {
  status?: string
  schedule?: unknown
  created_at?: string
}

type DisplayTaskStatus = 'idle' | 'scheduling' | 'running' | 'completed' | 'failed' | 'cancelled'

type TaskResult = {
  result_id?: string
  probe_id: string
  summary?: unknown
  result_data?: unknown
  status?: string
  created_at?: string
}

type TaskDetailResponse = {
  task?: TaskInfo
  results?: TaskResult[]
}

type ResultsListResponse = {
  results?: TaskResult[]
}

type HopGeo = {
  isp?: string
  country?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
}

type TracerouteHop = {
  hop: number
  ip: string
  geo?: HopGeo
  rtts?: number[]
  timeout?: boolean
}

type TracerouteResult = {
  hops?: TracerouteHop[]
  target?: string
  total_hops?: number
  success?: boolean
}

type HTTPTestResult = {
  target?: string
  final_url?: string
  resolved_ip?: string
  request_headers?: Record<string, string[]>
  response_headers?: Record<string, string[]>
  attempts?: HTTPAttempt[]
}

const results = ref<HomeResultRow[]>([])
const probesData = ref<Map<string, ProbeRecord>>(new Map())
const availableProbes = ref<ProbeRecord[]>([])

const filterState = ref({
  keyword: '',
})

const filteredResults = computed(() => {
  const keyword = filterState.value.keyword.trim().toLowerCase()

  return results.value.filter((r) => {
    if (keyword) {
      const hay = [r.location, r.provider].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(keyword)) return false
    }

    return true
  })
})
const selectedProbeIds = ref<string[]>([])

// Traceroute 详情默认全部折叠（v-expansion-panels multiple）
const expandedProbeIds = ref<string[]>([])

function toggleExpandedProbe(probeId: string) {
  if (!probeId) return
  const current = expandedProbeIds.value
  expandedProbeIds.value = current.includes(probeId)
    ? current.filter((id) => id !== probeId)
    : [...current, probeId]
}

const tracerouteData = ref<Record<string, TracerouteResult>>({})
const httpDetails = ref<Record<string, HTTPTestResult>>({})
const activeProbeIds = ref<string[]>([])

// 保留原始任务结果，用于绘制每包的柱状图
const rawTaskResults = ref<TaskResult[]>([])


// 累积的包数据，用于绘制连续监控的柱状图
// 格式: { probeId: Array<timeMs | null> }
// 数组索引代表包的顺序（全局递增），避免 seq 冲突导致数据覆盖
const accumulatedPacketData = ref<Record<string, Array<number | null>>>({})


const currentTaskId = ref<string>('')
// run_count（全局执行次数，用于停止条件/展示）

// continuous（ping/tcp）最大轮次：默认 100，后续会从 task.schedule.max_runs 读取
const maxRuns = ref<number>(100)

const taskStatus = ref<DisplayTaskStatus>('idle')

let pollIntervalId: number | null = null
let pollTimeoutId: number | null = null
let pollInFlight = false

const testTypes = [
  { value: 'icmp_ping', label: String($t('taskTable.typeNames.icmp_ping')) },
  { value: 'tcp_ping', label: String($t('taskTable.typeNames.tcp_ping')) },
  { value: 'http_test', label: String($t('taskTable.typeNames.http_test')) },
  { value: 'traceroute', label: String($t('taskTable.typeNames.traceroute')) },
]

const ipVersion = ref<'auto' | 'ipv4' | 'ipv6'>('auto')

const ipVersionItems = computed(() => [
  { title: String($t('home.ipAuto')), value: 'auto' as const },
  { title: String($t('home.ipV4')), value: 'ipv4' as const },
  { title: String($t('home.ipV6')), value: 'ipv6' as const },
])

const availableProbeItems = computed(() =>
  availableProbes.value.map((p) => ({
    title: p.location,
    value: p.probe_id,
  }))
)

const canStart = computed(() => {
  if (testing.value) return false
  if (target.value.trim().length === 0) return false
  // 任务运行中时禁用
  if (currentTaskId.value && (taskStatus.value === 'scheduling' || taskStatus.value === 'running')) {
    return false
  }
  return true
})

function isContinuousTaskType(taskTypeValue: string): boolean {
  return taskTypeValue === 'icmp_ping' || taskTypeValue === 'tcp_ping'
}

function getPageModeForTaskType(taskTypeValue: string): 'single' | 'continuous' {
  return isContinuousTaskType(taskTypeValue) ? 'continuous' : 'single'
}

function startFromMode() {
  if (!canStart.value) return

  const nextMode = getPageModeForTaskType(testType.value)
  pageMode.value = nextMode
  void startTest(nextMode)
}

const targetPlaceholder = computed(() => {
  const examples: Record<string, string> = {
    icmp_ping: String($t('home.targetExamples.icmp_ping')),
    tcp_ping: String($t('home.targetExamples.tcp_ping')),
    http_test: String($t('home.targetExamples.http_test')),
    traceroute: String($t('home.targetExamples.traceroute')),
  }
  return examples[testType.value] || String($t('home.targetPlaceholder'))
})

// continuous 模式：仅 Ping/TCP
const supportsContinuous = computed(() => isContinuousTaskType(testType.value))

// 已启动过任务就保持显示（任务结束后也保留最终结果）
const hasStartedTask = computed(() => currentTaskId.value !== '' || results.value.length > 0)

const taskStatusText = computed(() => {
  if (taskStatus.value === 'scheduling') return String($t('home.scheduling'))
  if (taskStatus.value === 'running') return String($t('common.running'))
  if (taskStatus.value === 'completed') return String($t('common.success'))
  if (taskStatus.value === 'failed') return String($t('common.failed'))
  if (taskStatus.value === 'cancelled') return String($t('common.cancelled'))
  return ''
})

const resultsColumnCount = computed(() => testType.value === 'http_test' ? 11 : 10)

function markTaskCompletedAndStopPolling(status: DisplayTaskStatus) {
  taskStatus.value = status
  cleanupPolling()
  testing.value = false

  // 结束任务后允许重新开始：清空 currentTaskId，隐藏“停止测试”按钮。
  // 注意：不要清空 results，页面会保留最终结果。
  currentTaskId.value = ''
}

function onSelectType(value: string) {
  testType.value = value

  if (value !== 'traceroute') {
    selectedProbeIds.value = []
  }

  pageMode.value = getPageModeForTaskType(value)
}

function getSparkSamplesFromResult(result: TaskResult, taskType: string): Array<number | null> {
  const data = parseMaybeJSON(result.result_data)

  if (taskType === 'icmp_ping') {
    const replies = Array.isArray(data['replies']) ? data['replies'] as Array<Record<string, unknown>> : []
    const packetsSent = typeof data['packets_sent'] === 'number' && Number.isFinite(data['packets_sent'])
      ? Math.max(0, Math.floor(data['packets_sent'] as number))
      : 0

    if (replies.length > 0) {
      const samples = replies.map((reply) => {
        const timeMs = reply['time_ms'] as number | undefined
        return timeMs !== undefined && Number.isFinite(timeMs) && timeMs > 0 ? timeMs : null
      })

      while (samples.length < packetsSent) {
        samples.push(null)
      }

      return samples
    }

    if (packetsSent > 0) {
      return Array.from({ length: packetsSent }, () => null)
    }

    return result.status === 'failed' ? [null] : []
  }

  if (taskType === 'tcp_ping') {
    const attempts = Array.isArray(data['attempts']) ? data['attempts'] as Array<Record<string, unknown>> : []
    if (attempts.length > 0) {
      return attempts.map((attempt) => {
        const timeMs = attempt['time_ms'] as number | undefined
        const status = attempt['status'] as string | undefined
        return status !== 'failed' && timeMs !== undefined && Number.isFinite(timeMs) && timeMs > 0 ? timeMs : null
      })
    }

    const successful = typeof data['successful_connections'] === 'number' && Number.isFinite(data['successful_connections'])
      ? Math.max(0, Math.floor(data['successful_connections'] as number))
      : 0
    const failed = typeof data['failed_connections'] === 'number' && Number.isFinite(data['failed_connections'])
      ? Math.max(0, Math.floor(data['failed_connections'] as number))
      : 0
    const total = successful + failed

    if (total > 0) {
      return Array.from({ length: total }, () => null)
    }

    return result.status === 'failed' ? [null] : []
  }

  const latency = getAvgLatency(result.summary, result.result_data)
  if (latency !== undefined) return [latency]
  return result.status === 'failed' ? [null] : []
}

function getProbeCapabilities(probe: ProbeRecord): string[] {
  if (Array.isArray(probe.capabilities)) {
    return probe.capabilities.filter((item): item is string => typeof item === 'string')
  }

  if (typeof probe.capabilities === 'string') {
    try {
      const parsed = JSON.parse(probe.capabilities)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      return []
    }
  }

  return []
}

function probeSupportsTaskType(probe: ProbeRecord, taskTypeValue: string): boolean {
  const capabilities = getProbeCapabilities(probe)
  if (capabilities.length === 0) {
    return true
  }

  return capabilities.includes('all') || capabilities.includes(taskTypeValue)
}

function getAutoSelectedProbeIds(taskTypeValue: string): string[] {
  return availableProbes.value
    .filter((probe) => probeSupportsTaskType(probe, taskTypeValue))
    .map((probe) => probe.probe_id)
}

function getTargetedProbeIds(taskTypeValue: string): string[] {
  if (taskTypeValue === 'traceroute' && selectedProbeIds.value.length > 0) {
    return selectedProbeIds.value
  }

  return getAutoSelectedProbeIds(taskTypeValue)
}

function getPlaceholderStatus(): string {
  return taskStatus.value === 'completed' || taskStatus.value === 'failed' || taskStatus.value === 'cancelled'
    ? 'timeout'
    : 'pending'
}


function deriveHomeRows(taskResults: TaskResult[]): HomeResultRow[] {
  const byProbe = new Map<string, TaskResult[]>()
  for (const r of taskResults) {
    if (!byProbe.has(r.probe_id)) byProbe.set(r.probe_id, [])
    byProbe.get(r.probe_id)!.push(r)
  }

  const rows: HomeResultRow[] = []

  byProbe.forEach((items, probeId) => {
    const probe = probesData.value.get(probeId)

    const latencies: number[] = []
    const mins: number[] = []
    const maxs: number[] = []

    for (const it of items) {
      const latency = getAvgLatency(it.summary, it.result_data)
      if (latency !== undefined) latencies.push(latency)

      const minL = getMinLatency(it.summary, it.result_data)
      if (minL !== undefined) mins.push(minL)

      const maxL = getMaxLatency(it.summary, it.result_data)
      if (maxL !== undefined) maxs.push(maxL)
    }

    const last = items.length ? items[items.length - 1] : undefined
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : undefined
    const minLatency = mins.length ? Math.min(...mins) : undefined
    const maxLatency = maxs.length ? Math.max(...maxs) : undefined
    const latestHTTPAttempt = last ? getLatestHTTPAttempt(last.result_data) : undefined
    const lastLatency = latestHTTPAttempt?.timeMs ?? (last ? getAvgLatency(last.summary, last.result_data) : undefined)
    const latestStatus = latestHTTPAttempt?.status || last?.status || (latencies.length > 0 ? 'success' : 'unknown')

    const lastSummary = last ? parseMaybeJSON(last.summary) : {}
    const lastData = last ? parseMaybeJSON(last.result_data) : {}
    const calculatedPacketLoss = last ? getPacketLossPercent(lastSummary, lastData) : undefined
    const resolvedIP = last ? getResolvedIP(lastSummary, lastData, target.value) : undefined
    const targetNetwork = getTargetNetworkInfo(lastSummary, lastData)

    rows.push({
      probe_id: probeId,
      location: probe?.location || String($t('common.unknown')),
      provider: getProbeProviderLabel(probe?.metadata) || '-',
      http_status_code: last ? getHTTPStatusCode(lastSummary, lastData) : undefined,
      avg_latency: avgLatency,
      min_latency: minLatency,
      max_latency: maxLatency,
      last_latency: lastLatency,
      packet_loss: calculatedPacketLoss,
      send_count: items.length,
      status: latestStatus,
      resolved_ip: resolvedIP,
      target_isp: targetNetwork.isp,
      target_asn: targetNetwork.asn,
      target_as_name: targetNetwork.asName,
    })
  })

  for (const probeId of activeProbeIds.value) {
    if (rows.some((row) => row.probe_id === probeId)) {
      continue
    }

    const probe = probesData.value.get(probeId)
    rows.push({
      probe_id: probeId,
      location: probe?.location || String($t('common.unknown')),
      provider: getProbeProviderLabel(probe?.metadata) || '-',
      send_count: 0,
      status: getPlaceholderStatus(),
      resolved_ip: getResolvedIP({}, {}, target.value),
    })
  }

  rows.sort((left, right) => left.location.localeCompare(right.location))

  return rows
}


function getLossClass(loss?: number): string {
  if (loss === undefined) return ''
  if (loss === 0) return 'good'
  if (loss < 5) return 'warn'
  return 'bad'
}

const sparkCanvasByProbeId = ref<Record<string, HTMLCanvasElement>>({})

function registerSparkCanvas(el: Element | ComponentPublicInstance | null, probeId: string) {
  const canvas = (el as HTMLCanvasElement | null)
  if (!canvas) return
  if (sparkCanvasByProbeId.value[probeId] === canvas) return

  sparkCanvasByProbeId.value[probeId] = canvas
  drawSparkForProbe(probeId)
}


function drawSparkOnCanvas(canvas: HTMLCanvasElement, latency?: number, status?: string) {
  const cssWidth = canvas.clientWidth || 90
  const cssHeight = canvas.clientHeight || 10

  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.floor(cssWidth * dpr))
  const height = Math.max(1, Math.floor(cssHeight * dpr))

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, width, height)

  let percent = 0.3
  if (status === 'failed' || status === 'timeout') {
    percent = 1
  } else if (latency !== undefined && Number.isFinite(latency)) {
    const clamped = Math.max(0, Math.min(250, latency))
    percent = 0.18 + (clamped / 250) * 0.82
  }

  const fillW = Math.max(1, Math.floor(width * percent))
  const radius = height / 2

  ctx.fillStyle = getLatencyHex(latency, status)

  // 圆角条
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.arcTo(fillW, 0, fillW, height, radius)
  ctx.arcTo(fillW, height, 0, height, radius)
  ctx.arcTo(0, height, 0, 0, radius)
  ctx.arcTo(0, 0, fillW, 0, radius)
  ctx.closePath()
  ctx.fill()
}

function drawSparkForProbe(probeId: string) {
  const canvas = sparkCanvasByProbeId.value[probeId]
  if (!canvas) return

  // 只为 Ping/TCP 类型绘制柱状图；其他类型仍使用旧的平均延迟条
  if (testType.value !== 'icmp_ping' && testType.value !== 'tcp_ping') {
    const row = results.value.find((r) => r.probe_id === probeId)
    if (!row) return
    drawSparkOnCanvas(canvas, row.avg_latency, row.status)
    return
  }

  // 使用累积的包数据（现在是数组）
  const packetArray = accumulatedPacketData.value[probeId]
  if (!packetArray || packetArray.length === 0) {
    const row = results.value.find((r) => r.probe_id === probeId)
    if (row) {
      drawSparkOnCanvas(canvas, row.avg_latency, row.status)
    }
    return
  }

  drawPacketBars(canvas, packetArray)
}

/**
 * 绘制类似 ping.pe 的最近包延迟柱状图：
 * - 每个 execution/attempt 至少占一栏
 * - 展示全部历史，随样本数增多自动压缩到画布宽度内
 * - 颜色和表格/地图共享统一延迟阈值
 * - 纵向使用自适应量程，默认按历史延迟分布缩放，微小抖动也能看出来
 */
function drawPacketBars(canvas: HTMLCanvasElement, latencies: (number | null)[]) {
  const cssWidth = canvas.clientWidth || 90
  const cssHeight = canvas.clientHeight || 10

  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.floor(cssWidth * dpr))
  const height = Math.max(1, Math.floor(cssHeight * dpr))

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, width, height)

  const barCount = latencies.length
  if (barCount === 0) return
  const scale = buildLatencyScale(latencies)

  latencies.forEach((latency, i) => {
    const x = Math.floor((i * width) / barCount)
    const nextX = Math.floor(((i + 1) * width) / barCount)
    const fillWidth = Math.max(1, nextX - x)

    let barHeight = 0
    let color = getLatencyHex(undefined, 'failed')

    if (latency !== null && Number.isFinite(latency)) {
      const scaleFloor = scale?.floor ?? 0
      const scaleCeiling = scale?.ceiling ?? Math.max(latency, 1)
      const scaleRange = Math.max(1, scaleCeiling - scaleFloor)
      const clamped = Math.max(scaleFloor, Math.min(scaleCeiling, latency))
      const percent = 0.15 + ((clamped - scaleFloor) / scaleRange) * 0.85
      barHeight = Math.max(1, Math.floor(height * percent))
      color = getLatencyHex(latency, 'success')
    } else {
      // 失败/超时/丢包: 显示红色满高度
      barHeight = height
    }

    ctx.fillStyle = color
    // 从底部向上绘制
    const y = height - barHeight
    ctx.fillRect(x, y, fillWidth, barHeight)
  })
}


async function loadAvailableProbes() {
  try {
    type ProbesResponse = {
      probes?: ProbeRecord[]
    }
    const res = await api.get<ProbesResponse>('/probes', { params: { status: 'online' } })
    const list = res.probes || []

    const map = new Map<string, ProbeRecord>()
    const normalized = list.map((p) => {
      const next: ProbeRecord = normalizeProbeCoordinates(p)
      map.set(next.probe_id, next)
      return next
    })

    availableProbes.value = normalized
    probesData.value = map
  } catch (e) {
    console.error('Failed to load probes:', e)
  }
}

function cleanupPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId)
    pollTimeoutId = null
  }
  pollInFlight = false
}

async function startTest(modeValue: 'single' | 'continuous') {
  if (!target.value.trim()) return

  cleanupPolling()

  testing.value = true
  taskStatus.value = 'scheduling'
  // 清理本轮缓存数据
  results.value = []
  rawTaskResults.value = []
  sparkCanvasByProbeId.value = {}
  accumulatedPacketData.value = {}
  tracerouteData.value = {}
  httpDetails.value = {}
  activeProbeIds.value = []
  currentTaskId.value = ''

  if (probesData.value.size === 0) {
    await loadAvailableProbes()
  }

  try {
    const params: Record<string, unknown> = { ip_version: ipVersion.value }

    if (modeValue === 'continuous') {
      // continuous 模式统一固定 maxRuns 次（调度器每秒触发一次）
      params.count = maxRuns.value
    } else {
      params.count = 4
    }


    type TaskResponse = {
      task_id: string
    }

    const assignedProbes = testType.value === 'traceroute' ? selectedProbeIds.value : []
    activeProbeIds.value = getTargetedProbeIds(testType.value)

    const task = await api.post<TaskResponse>('/tasks', {
      task_type: testType.value,
      mode: modeValue,
      target: target.value.trim(),
      ip_version: ipVersion.value,
      parameters: params,
      assigned_probes: assignedProbes,
      priority: 5,
    })

    const taskId = task.task_id
    currentTaskId.value = taskId

    // 任务已创建，立即展示“调度中”的结果区域
    taskStatus.value = 'scheduling'

    const fetchAndRender = async () => {
      if (pollInFlight) return
      pollInFlight = true
      try {
        const detail = await api.get<TaskDetailResponse>(`/tasks/${taskId}`)
        const status = detail.task?.status

        if (modeValue === 'continuous' && detail.task?.schedule) {
          const schedule = parseMaybeJSON(detail.task.schedule)

          // max_runs：由后端调度器写入/由后台配置决定；缺省 100
          const maxRunsFromServer = schedule['max_runs'] as number | undefined
          if (typeof maxRunsFromServer === 'number' && Number.isFinite(maxRunsFromServer) && maxRunsFromServer > 0) {
            maxRuns.value = Math.floor(maxRunsFromServer)
          }

          // max_runs 的 UI 需要 task.schedule 中的 run_count，这里不用额外处理
        }


        // 提取 run_count（连续任务）
        let runCount: number | undefined
        if (modeValue === 'continuous' && detail.task?.schedule) {
          const schedule = parseMaybeJSON(detail.task.schedule)
          runCount = (schedule['run_count'] as number) || 0
        }

        // 兼容：后端若未及时把 status 置为 completed，但 run_count 已到 maxRuns，也视为完成。
        const reachedMaxRuns = modeValue === 'continuous' && (runCount ?? 0) >= maxRuns.value
        const effectiveStatus = reachedMaxRuns ? 'completed' : status

        // 连续任务：/tasks/:id 端点只返回最新 100 条 results（全探针合计）。
        // 这会导致多探针时每个 probe 的 send_count 卡在 ~100/探针数。
        // 因此 continuous 时改用 /results 分页拉取，并按 created_at 升序重排。
        let rawResults: TaskResult[] = []
        if (modeValue === 'continuous') {
          const pageSize = 200
          const maxPages = 50

          const pages: TaskResult[][] = []
          for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
            const offset = pageIndex * pageSize
            const page = await api.get<ResultsListResponse>('/results', {
              params: { task_id: taskId, limit: pageSize, offset },
            })
            const chunk = page.results || []
            pages.push(chunk)
            if (chunk.length < pageSize) break
          }

          // /results 是按 created_at DESC 返回，需要反转后拼接，确保 offset 逻辑正确
          rawResults = pages.flatMap((p) => p.slice().reverse())
        } else {
          rawResults = detail.results || []
        }

        const taskResults = rawResults
          .map((r) => ({
            ...r,
            summary: parseMaybeJSON(r.summary),
            result_data: parseMaybeJSON(r.result_data),
          }))
          // /results 默认 created_at DESC，这里统一成按时间升序，避免 send_count / 图表乱跳
          .sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0
            return ta - tb
          })
          // 去重：防止分页/轮询过程中出现重复 result_id
          .filter((r, idx, arr) => {
            if (!r.result_id) return true
            return arr.findIndex((x) => x.result_id === r.result_id) === idx
          })

        // 累积 rawTaskResults 而不是替换
        const existingIds = new Set(rawTaskResults.value.map(r => r.result_id))
        const newResults = taskResults.filter(r => !existingIds.has(r.result_id))
        rawTaskResults.value = [...rawTaskResults.value, ...newResults]

        results.value = deriveHomeRows(rawTaskResults.value)

        // 更新累积的包数据（用于 Ping/TCP 柱状图）
        if (testType.value === 'icmp_ping' || testType.value === 'tcp_ping') {
          // 创建新的对象引用以触发 Vue 响应式更新
          const newAccumulatedData: Record<string, Array<number | null>> = {}
          const sparkTaskType = testType.value

          // 从 rawTaskResults（现在是累积的）中提取所有包数据
          const allResults = rawTaskResults.value

          for (const r of allResults) {
            const probeId = r.probe_id
            if (!newAccumulatedData[probeId]) {
              newAccumulatedData[probeId] = []
            }
            const packetArray = newAccumulatedData[probeId]!
            packetArray.push(...getSparkSamplesFromResult(r, sparkTaskType))
          }

          // 一次性替换整个对象以触发响应式更新
          accumulatedPacketData.value = newAccumulatedData
        }

        if (testType.value === 'traceroute') {
          const next: Record<string, TracerouteResult> = {}
          for (const r of taskResults) {
            const data = r.result_data as unknown as TracerouteResult
            if (data) next[r.probe_id] = data
          }
          tracerouteData.value = next
        }

        if (testType.value === 'http_test') {
          const next: Record<string, HTTPTestResult> = {}
          for (const r of taskResults) {
            const data = r.result_data as unknown as HTTPTestResult
            if (data) next[r.probe_id] = data
          }
          httpDetails.value = next
        }


        if (effectiveStatus === 'completed' || effectiveStatus === 'failed' || effectiveStatus === 'cancelled') {
          markTaskCompletedAndStopPolling(effectiveStatus as DisplayTaskStatus)
          return
        }

        taskStatus.value = taskResults.length > 0 ? 'running' : 'scheduling'
      } catch (e) {
        console.error(e)
      } finally {
        pollInFlight = false
      }
    }

    await fetchAndRender()

    pollIntervalId = window.setInterval(fetchAndRender, 1000)

    // 单次测试：保留 60s 轮询超时保护。
    // 连续监控：不设置超时，避免任务较慢时（尤其多探针）UI 提前停止刷新。
    if (modeValue === 'single') {
      pollTimeoutId = window.setTimeout(() => {
        cleanupPolling()
        testing.value = false
        if (taskStatus.value === 'running' || taskStatus.value === 'scheduling') {
          taskStatus.value = 'failed'
        }
      }, 60000)
    }
  } catch (e) {
    console.error(e)
    testing.value = false
    activeProbeIds.value = []
    taskStatus.value = 'failed'
    cleanupPolling()
  }
}

async function stopContinuousTest() {
  if (!currentTaskId.value) return
  try {
    await api.delete(`/tasks/${currentTaskId.value}`)
    cleanupPolling()
    testing.value = false
    taskStatus.value = 'cancelled'

    // 结束任务后允许重新开始：清空 currentTaskId，隐藏“停止测试”按钮。
    // 注意：不要清空 results，页面会保留最终结果。
    currentTaskId.value = ''
  } catch (e) {
    console.error('停止任务失败:', e)
  }
}

const probeMarkers = computed<ProbeMarker[]>(() => {
  return results.value
    .map((r) => {
      const probe = probesData.value.get(r.probe_id)

      const latitude = probe?.latitude ?? null
      const longitude = probe?.longitude ?? null

      if (!hasValidCoordinates(latitude, longitude)) {
        return null
      }

      const status = r.status || 'pending'
      const validStatus: 'success' | 'failed' | 'timeout' | 'pending' =
        status === 'success' || status === 'failed' || status === 'timeout' ? status : 'pending'

      return {
        probe_id: r.probe_id,
        name: r.location,
        location: r.location,
        latitude,
        longitude,
        latency: r.last_latency ?? r.avg_latency,
        status: validStatus,
        packetLoss: r.packet_loss,
      } as ProbeMarker
    })
    .filter((marker): marker is ProbeMarker => marker !== null)
})

async function redrawSparkCharts() {
  await nextTick()
  for (const r of results.value) {
    drawSparkForProbe(r.probe_id)
  }
}

watch(
  () => results.value,
  redrawSparkCharts,
  { deep: true }
)

// 监听累积数据变化，触发柱状图重绘
watch(
  () => accumulatedPacketData.value,
  redrawSparkCharts,
  { deep: true }
)

watch(
  () => taskStatus.value,
  () => {
    if (rawTaskResults.value.length === 0 && activeProbeIds.value.length === 0) {
      return
    }

    results.value = deriveHomeRows(rawTaskResults.value)
  }
)


onMounted(async () => {
  targetInput.value?.focus?.()

  // 默认模式：
  // - Ping/TCP 走持续（监控）
  // - Traceroute/HTTP 走单次
  pageMode.value = getPageModeForTaskType(testType.value)

  // 默认测试类型为 Ping
  testType.value = 'icmp_ping'

  await loadAvailableProbes()
})

onBeforeUnmount(() => {
  cleanupPolling()
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.main {
  padding: 32px 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.test-container {
  text-align: center;
  margin-bottom: 28px;
}

.input-wrapper {
  display: grid;
  gap: 12px;
  max-width: 980px;
  margin: 0 auto 16px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px var(--shadow);
}

.input-wrapper :deep(.v-field) {
  border-radius: 10px;
}

.input-wrapper :deep(.v-btn) {
  border-radius: 10px;
}

.target-row {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.target-row :deep(.v-btn) {
  height: 40px;
}

.type-select-md3 {
  min-width: 140px;
}

.ip-select-md3 {
  min-width: 120px;
}


.param-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-2);
}

.target-input {
  flex: 1;
  min-width: 0;
}

.probe-select {
  margin-top: 12px;
  display: grid;
  gap: 8px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  text-align: left;
}

.probe-select-md3 {
  width: 100%;
}

@media (max-width: 720px) {
  .target-row {
    flex-wrap: wrap;
  }

  .target-input {
    flex: 1 1 100%;
  }
}

.results-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px var(--shadow);
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.results-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.results-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.result-count {
  font-size: 14px;
  color: var(--text-2);
}

.map-section {
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.results-table {
  overflow-x: auto;
}

.results-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.results-filters :deep(.v-field) {
  border-radius: 10px;
}

@media (max-width: 720px) {
  .results-filters {
    grid-template-columns: 1fr;
  }
}

.spark-canvas {
  width: 90px;
  height: 24px;
  display: block;
}

.good { color: var(--good); }
.warn { color: var(--warn); }
.bad { color: var(--bad); }

.detail-cell {
  padding: 0 !important;
}

.result-row {
  user-select: none;
}

.row-detail {
  padding: 8px 0 0;
}

.detail-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.row-detail-empty {
  padding: 8px 0;
}

.text-muted {
  color: var(--text-2);
  font-size: 13px;
}

.hop-geo {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.http-url-cell {
  font-size: 12px;
  color: var(--text-2);
  word-break: break-all;
}
</style>
