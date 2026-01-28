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
              @update:model-value="onSelectType"
              style="width: 140px"
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

        <div v-if="testType === 'traceroute'" class="probe-select">
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
            <span v-if="taskStatusText" class="result-count">{{ taskStatusText }}</span>
            <span v-else class="result-count">{{ filteredResults.length }} {{ $t('results.nodes') }}</span>
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

          <v-select
            v-model="filterState.status"
            :items="statusFilterItems"
            density="compact"
            variant="outlined"
            hide-details
            :label="$t('common.status')"
          />

          <v-select
            v-model="filterState.loss"
            :items="lossFilterItems"
            density="compact"
            variant="outlined"
            hide-details
            :label="$t('results.loss')"
          />

          <v-select
            v-model="filterState.avg"
            :items="avgFilterItems"
            density="compact"
            variant="outlined"
            hide-details
            :label="$t('results.avg')"
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

        <div v-if="filteredResults.length > 0" class="results-table">
          <v-table density="compact">
            <thead>
              <tr>
                <th style="width: 240px">{{ $t('home.probeLabel') }}</th>
                <th style="width: 160px">{{ $t('results.resolvedIP') }}</th>
                <th style="width: 180px">{{ $t('results.targetISP') }}</th>
                <th style="width: 110px; text-align: right">{{ $t('results.loss') }}</th>
                <th style="width: 110px; text-align: right">{{ pageMode === 'continuous' ? $t('results.progress') : '' }}</th>
                <th style="width: 120px; text-align: right">{{ $t('results.current') }}</th>
                <th style="width: 120px; text-align: right">{{ $t('results.avg') }}</th>
                <th style="width: 120px; text-align: right">{{ $t('results.min') }}</th>
                <th style="width: 120px; text-align: right">{{ $t('results.max') }}</th>
                <th style="width: 90px; text-align: right">{{ $t('results.chart') }}</th>
              </tr>
            </thead>

            <tbody>
              <template v-for="r in filteredResults" :key="r.probe_id">
                <tr class="result-row" @click="toggleExpandedProbe(r.probe_id)" style="cursor: pointer">
                  <td>
                    <ProbeCell :location="r.location" :provider="r.provider" />
                  </td>
                  <td>{{ r.resolved_ip || '-' }}</td>
                  <td>
                    <ProviderCell
                      :target_asn="r.target_asn"
                      :target_as_name="r.target_as_name"
                      :target_isp="r.target_isp"
                    />
                  </td>
                  <td style="text-align: right" :class="getLossClass(r.packet_loss)">
                    {{ r.packet_loss !== undefined ? r.packet_loss.toFixed(1) + '%' : '-' }}
                  </td>
                  <td style="text-align: right">
                    {{ pageMode === 'continuous' ? `${r.send_count ?? 0}/${maxRuns}` : '-' }}
                  </td>
                  <td style="text-align: right" :class="getLatencyClass(r.last_latency)">
                    {{ r.last_latency !== undefined ? r.last_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td style="text-align: right" :class="getLatencyClass(r.avg_latency)">
                    {{ r.avg_latency !== undefined ? r.avg_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td style="text-align: right">
                    {{ r.min_latency !== undefined ? r.min_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td style="text-align: right">
                    {{ r.max_latency !== undefined ? r.max_latency.toFixed(1) + ' ' + $t('common.ms') : '-' }}
                  </td>
                  <td style="text-align: right" @click.stop>
                    <canvas :ref="(el) => registerSparkCanvas(el, r.probe_id)" class="spark-canvas" />
                  </td>
                </tr>

                <tr v-if="expandedProbeIds.includes(r.probe_id)">
                  <td colspan="10" class="detail-cell">
                    <div v-if="tracerouteData[r.probe_id]?.hops?.length" class="row-detail">
                      <h4 class="detail-title">{{ $t('results.tracerouteDetail') }}</h4>
                      <v-table density="compact">
                        <thead>
                          <tr>
                            <th style="width: 70px">{{ $t('home.route.hop') }}</th>
                            <th>{{ $t('home.route.ip') }}</th>
                            <th style="width: 110px">{{ $t('home.route.rtt') }}</th>
                            <th style="width: 90px">{{ $t('results.status') }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="hop in tracerouteData[r.probe_id].hops" :key="hop.hop">
                            <td>{{ hop.hop }}</td>
                            <td>
                              <div>{{ hop.ip || '*' }}</div>
                              <div v-if="hop.geo" class="hop-geo">
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

                    <div v-if="!tracerouteData[r.probe_id]?.hops?.length" class="row-detail-empty">
                      <span class="text-muted">{{ $t('results.noRouteData') }}</span>
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
import { getProviderLabelFromMetadata } from '@/utils/provider'
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
  // 前台不展示节点昵称，统一使用 location
  probe_name: string
  location: string
  provider?: string
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

const results = ref<HomeResultRow[]>([])
const probesData = ref<Map<string, ProbeRecord>>(new Map())
const availableProbes = ref<ProbeRecord[]>([])

const filterState = ref({
  keyword: '',
  status: 'all' as 'all' | 'success' | 'failed' | 'timeout',
  loss: 'all' as 'all' | 'loss_gt_0',
  avg: 'all' as 'all' | 'avg_ge_100' | 'avg_ge_200',
})

const statusFilterItems = [
  { title: String($t('common.all')), value: 'all' },
  { title: String($t('common.success')), value: 'success' },
  { title: String($t('common.failed')), value: 'failed' },
  { title: String($t('common.timeout')), value: 'timeout' },
]

const lossFilterItems = [
  { title: String($t('common.all')), value: 'all' },
  { title: String($t('home.filters.lossGt0')), value: 'loss_gt_0' },
]

const avgFilterItems = [
  { title: String($t('common.all')), value: 'all' },
  { title: String($t('home.filters.avgGe100')), value: 'avg_ge_100' },
  { title: String($t('home.filters.avgGe200')), value: 'avg_ge_200' },
]

const filteredResults = computed(() => {
  const keyword = filterState.value.keyword.trim().toLowerCase()

  return results.value.filter((r) => {
    // keyword
    if (keyword) {
      const hay = [r.location, r.provider].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(keyword)) return false
    }

    // status
    if (filterState.value.status !== 'all') {
      const status = r.status || 'timeout'
      const validStatus: 'success' | 'failed' | 'timeout' = status === 'success' || status === 'failed' ? status : 'timeout'
      if (validStatus !== filterState.value.status) return false
    }

    // loss
    if (filterState.value.loss === 'loss_gt_0') {
      const loss = r.packet_loss ?? 0
      if (!(loss > 0)) return false
    }

    // avg
    if (filterState.value.avg === 'avg_ge_100') {
      const avg = r.avg_latency ?? -Infinity
      if (!(avg >= 100)) return false
    }
    if (filterState.value.avg === 'avg_ge_200') {
      const avg = r.avg_latency ?? -Infinity
      if (!(avg >= 200)) return false
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

function startSingleFromUI() {
  if (!canStart.value) return
  pageMode.value = 'single'
  void startSingle()
}

// 注意：UI 只保留一个“开始测试”按钮，按 testType 自动选择 single/continuous
function startContinuousFromUI() {
  if (!supportsContinuous.value) return
  if (!canStart.value) return
  pageMode.value = 'continuous'
  void startContinuous()
}

function startFromMode() {
  // Enter key behavior: Ping/TCP 走持续；Traceroute/HTTP 走单次
  if (testType.value === 'icmp_ping' || testType.value === 'tcp_ping') {
    startContinuousFromUI()
    return
  }
  startSingleFromUI()
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
const supportsContinuous = computed(() => testType.value === 'icmp_ping' || testType.value === 'tcp_ping')

const isStreamingRouteDetails = computed(() => testType.value === 'traceroute')

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

  // continuous 仅支持 Ping/TCP
  if (pageMode.value === 'continuous' && !supportsContinuous.value) {
    pageMode.value = 'single'
  }
}


function getLatencyMsFromResult(result: TaskResult): number | undefined {
  const summary = parseMaybeJSON(result.summary)
  const data = parseMaybeJSON(result.result_data)

  const candidates = [
    summary['avg_rtt_ms'],
    summary['avg_latency'],
    summary['avg_connect_time_ms'],
    data['avg_rtt_ms'],
    data['avg_latency'],
    data['avg_connect_time_ms'],
  ]

  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

function getMinLatencyMsFromResult(result: TaskResult): number | undefined {
  const summary = parseMaybeJSON(result.summary)
  const data = parseMaybeJSON(result.result_data)

  const candidates = [
    summary['min_rtt_ms'],
    summary['min_latency'],
    summary['min_connect_time_ms'],
    data['min_rtt_ms'],
    data['min_latency'],
    data['min_connect_time_ms'],
  ]

  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

function getMaxLatencyMsFromResult(result: TaskResult): number | undefined {
  const summary = parseMaybeJSON(result.summary)
  const data = parseMaybeJSON(result.result_data)

  const candidates = [
    summary['max_rtt_ms'],
    summary['max_latency'],
    summary['max_connect_time_ms'],
    data['max_rtt_ms'],
    data['max_latency'],
    data['max_connect_time_ms'],
  ]

  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
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
    const lastLatencies: number[] = []

    let status: string | undefined

    for (const it of items) {
      const latency = getLatencyMsFromResult(it)
      if (latency !== undefined) latencies.push(latency)

      const minL = getMinLatencyMsFromResult(it)
      if (minL !== undefined) mins.push(minL)

      const maxL = getMaxLatencyMsFromResult(it)
      if (maxL !== undefined) maxs.push(maxL)

      // 收集所有延迟值作为 last_latency 候选
      if (latency !== undefined) lastLatencies.push(latency)

      if (it.status === 'failed') status = 'failed'
      if (!status && it.status === 'success') status = 'success'
    }

    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : undefined
    const minLatency = mins.length ? Math.min(...mins) : undefined
    const maxLatency = maxs.length ? Math.max(...maxs) : undefined
    const lastLatency = lastLatencies.length ? lastLatencies[lastLatencies.length - 1] : undefined

    // 从 result_data 中计算准确的丢包率
    let calculatedPacketLoss: number | undefined = undefined

    // 优先使用 summary 中的 packet_loss_percent
    const last = items.length ? items[items.length - 1] : undefined
    const lastSummary = last ? parseMaybeJSON(last.summary) : {}
    const lastData = last ? parseMaybeJSON(last.result_data) : {}

    const summaryLoss = (lastSummary['packet_loss_percent'] as number) ||
                        (lastSummary['packet_loss'] as number) || undefined
    if (summaryLoss !== undefined) {
      calculatedPacketLoss = summaryLoss
    } else {
      // 从 result_data 手动计算
      if (testType.value === 'icmp_ping') {
        // ICMP Ping: (PacketsSent - PacketsReceived) / PacketsSent * 100
        const sent = (lastData['packets_sent'] as number) || 0
        const received = (lastData['packets_received'] as number) || 0
        if (sent > 0) {
          calculatedPacketLoss = ((sent - received) / sent) * 100
        }
      } else if (testType.value === 'tcp_ping') {
        // TCP Ping: FailedConnections / (SuccessfulConnections + FailedConnections) * 100
        const successful = (lastData['successful_connections'] as number) || 0
        const failed = (lastData['failed_connections'] as number) || 0
        const total = successful + failed
        if (total > 0) {
          calculatedPacketLoss = (failed / total) * 100
        }
      }
    }

    const resolvedIP =
      (lastData['resolved_ip'] as string | undefined) ||
      (lastSummary['resolved_ip'] as string | undefined) ||
      undefined

    const targetISP =
      (lastSummary['target_isp'] as string | undefined) ||
      (lastData['target_isp'] as string | undefined) ||
      undefined

    const targetASN =
      (lastSummary['target_asn'] as string | undefined) ||
      (lastData['target_asn'] as string | undefined) ||
      undefined

    const targetASName =
      (lastSummary['target_as_name'] as string | undefined) ||
      (lastData['target_as_name'] as string | undefined) ||
      undefined

    rows.push({
      probe_id: probeId,
      probe_name: probe?.location || String($t('common.unknown')),
      location: probe?.location || String($t('common.unknown')),
      provider: getProviderLabelFromMetadata(probe?.metadata) || '-',
      avg_latency: avgLatency,
      min_latency: minLatency,
      max_latency: maxLatency,
      last_latency: lastLatency,
      packet_loss: calculatedPacketLoss,
      send_count: items.length,
      status: status || 'unknown',
      resolved_ip: resolvedIP,
      target_isp: targetISP,
      target_asn: targetASN,
      target_as_name: targetASName,
    })
  })

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


function sparkColor(latency?: number, status?: string): string {
  if (status === 'failed') return '#F56C6C'
  if (latency === undefined || !Number.isFinite(latency)) return '#E6A23C'
  if (latency < 100) return '#67C23A'
  if (latency < 200) return '#E6A23C'
  return '#F56C6C'
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

  // 0~300ms 映射到 20%~100%
  let percent = 0.3
  if (status === 'failed') {
    percent = 1
  } else if (latency !== undefined && Number.isFinite(latency)) {
    const clamped = Math.max(0, Math.min(300, latency))
    percent = 0.2 + (clamped / 300) * 0.8
  }

  const fillW = Math.max(1, Math.floor(width * percent))
  const radius = height / 2

  ctx.fillStyle = sparkColor(latency, status)

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

  // 数组本身就是按时间顺序的延迟序列
  const latencies: (number | null)[] = packetArray

  drawPacketBars(canvas, latencies)
}

/**
 * 按包数分栏绘制柱状图：
 * - 每个包占一栏,高度表示延迟(0-300ms映射到0%-100%高度)
 * - 颜色: <100ms绿色, <200ms橙色, >=200ms红色, null灰色
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

  const barWidth = width / barCount
  const gap = Math.max(0.5, barWidth * 0.1) // 10%间隙

  latencies.forEach((latency, i) => {
    const x = i * barWidth
    const fillWidth = Math.max(1, barWidth - gap)

    let barHeight = 0
    let color = '#E0E0E0' // 灰色 (无数据)

    if (latency !== null && Number.isFinite(latency)) {
      // 延迟映射到高度：0ms 也给一定可见高度；越慢越接近满高
      const clamped = Math.max(0, Math.min(300, latency))
      const percent = 0.15 + (clamped / 300) * 0.85
      barHeight = Math.max(1, Math.floor(height * percent))

      // 颜色
      if (latency < 100) {
        color = '#67C23A' // 绿色
      } else if (latency < 200) {
        color = '#E6A23C' // 橙色
      } else {
        color = '#F56C6C' // 红色
      }
    } else {
      // 失败/超时/丢包: 显示红色满高度
      barHeight = height
      color = '#F56C6C' // 红色
    }

    ctx.fillStyle = color
    // 从底部向上绘制
    const y = height - barHeight
    ctx.fillRect(x, y, fillWidth, barHeight)
  })
}


function getLatencyClass(latency?: number): string {
  if (latency === undefined) return ''
  if (latency < 50) return 'good'
  if (latency < 150) return 'warn'
  return 'bad'
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
      const metadata = parseMaybeJSON(p.metadata)

      const latitude =
        typeof p.latitude === 'number'
          ? p.latitude
          : (metadata['latitude'] ? Number(metadata['latitude']) : null)
      const longitude =
        typeof p.longitude === 'number'
          ? p.longitude
          : (metadata['longitude'] ? Number(metadata['longitude']) : null)

      const next: ProbeRecord = {
        ...p,
        latitude: Number.isFinite(latitude) ? (latitude as number) : null,
        longitude: Number.isFinite(longitude) ? (longitude as number) : null,
      }

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
  currentTaskId.value = ''
  initialMapMarkers.value = null

  if (probesData.value.size === 0) {
    await loadAvailableProbes()
  }

  try {
    const params: Record<string, unknown> = { ip_version: ipVersion.value }

    if (modeValue === 'continuous' && supportsContinuous.value) {
      // continuous 模式统一固定 maxRuns 次（调度器每秒触发一次）
      params.count = maxRuns.value
    } else {
      params.count = 4
    }


    type TaskResponse = {
      task_id: string
    }

    const assignedProbes = testType.value === 'traceroute' ? selectedProbeIds.value : []

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

          // 从 rawTaskResults（现在是累积的）中提取所有包数据
          const allResults = rawTaskResults.value

          for (const r of allResults) {
            const probeId = r.probe_id
            if (!newAccumulatedData[probeId]) {
              newAccumulatedData[probeId] = []
            }
            const packetArray = newAccumulatedData[probeId]!

            const data = r.result_data as Record<string, unknown> | undefined
            if (!data) continue

            if (testType.value === 'icmp_ping') {
              const replies = (data['replies'] as Array<Record<string, unknown>>) || []
              for (const reply of replies) {
                const timeMs = reply['time_ms'] as number | undefined
                const valid = timeMs !== undefined && Number.isFinite(timeMs) && timeMs > 0
                // 直接 push 到数组，不使用 seq 作为 key，避免覆盖
                packetArray.push(valid ? timeMs : null)
              }
            } else if (testType.value === 'tcp_ping') {
              const attempts = (data['attempts'] as Array<Record<string, unknown>>) || []
              for (const attempt of attempts) {
                const timeMs = attempt['time_ms'] as number | undefined
                const status = attempt['status'] as string | undefined
                const valid = status !== 'failed' && timeMs !== undefined && Number.isFinite(timeMs) && timeMs > 0
                // 直接 push 到数组，不使用 seq 作为 key，避免覆盖
                packetArray.push(valid ? timeMs : null)
              }
            }
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
    taskStatus.value = 'failed'
    cleanupPolling()
  }
}

async function startSingle() {
  await startTest('single')
}

async function startContinuous() {
  // 不支持持续监控的类型（HTTP/Traceroute）直接忽略
  if (!supportsContinuous.value) return
  await startTest('continuous')
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

const initialMapMarkers = ref<ProbeMarker[] | null>(null)

const probeMarkers = computed<ProbeMarker[]>(() => {
  // 持续模式下：避免每秒刷新地图（WorldMap 重绘/重算开销较大）
  // 同时：Traceroute 也可能每秒刷新，因此同样固定地图标记避免卡顿
  if ((supportsContinuous.value || isStreamingRouteDetails.value) && initialMapMarkers.value) {
    return initialMapMarkers.value
  }

  const markers = results.value
    .map((r) => {
      const probe = probesData.value.get(r.probe_id)

      const latitude = probe?.latitude || 0
      const longitude = probe?.longitude || 0

      const status = r.status || 'timeout'
      const validStatus: 'success' | 'failed' | 'timeout' =
        status === 'success' || status === 'failed' ? status : 'timeout'

      return {
        probe_id: r.probe_id,
        name: r.location,
        location: r.location,
        latitude,
        longitude,
        latency: r.avg_latency,
        status: validStatus,
        packetLoss: r.packet_loss,
      } as ProbeMarker
    })
    .filter((marker) => marker.latitude !== 0 && marker.longitude !== 0)

  if ((supportsContinuous.value || isStreamingRouteDetails.value) && markers.length > 0 && !initialMapMarkers.value) {
    initialMapMarkers.value = markers
  }

  return markers
})

watch(
  () => results.value,
  async () => {
    await nextTick()
    for (const r of results.value) {
      drawSparkForProbe(r.probe_id)
    }
  },
  { deep: true }
)

// 监听累积数据变化，触发柱状图重绘
watch(
  () => accumulatedPacketData.value,
  async () => {
    await nextTick()
    for (const r of results.value) {
      drawSparkForProbe(r.probe_id)
    }
  },
  { deep: true }
)


onMounted(async () => {
  targetInput.value?.focus?.()

  // 默认模式：
  // - Ping/TCP 走持续（监控）
  // - Traceroute/HTTP 走单次
  pageMode.value = supportsContinuous.value ? 'continuous' : 'single'

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

.target-row .target-input {
  flex: 1;
  min-width: 0;
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


.target-input {
  flex: 1;
  min-width: 0;
}


.param-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-2);
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
  grid-template-columns: 1fr 160px 160px 160px;
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
</style>
