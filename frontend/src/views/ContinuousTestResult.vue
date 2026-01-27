<template>
  <div class="continuous-test-result">
    <div class="page-header">
      <v-btn variant="text" @click="router.back()">{{ $t('common.back') }}</v-btn>
      <div class="page-title">{{ $t('continuous.title') }} - {{ taskId }}</div>

      <v-chip
        size="small"
        variant="tonal"
        :color="taskInfo?.status === 'running' ? 'success' : 'secondary'"
      >
        {{ taskInfo?.status === 'running'
          ? $t('continuous.monitoring')
          : (taskInfo?.status === 'cancelled' ? $t('common.stopped') : $t('common.stopped')) }}
      </v-chip>

      <v-spacer />

      <v-btn
        v-if="taskInfo?.status === 'running'"
        color="error"
        variant="tonal"
        size="small"
        @click="stopTask"
      >
        {{ $t('continuous.stopMonitor') }}
      </v-btn>
    </div>

    <v-card class="result-card" variant="outlined">
      <v-card-title class="card-header">
        <span>{{ $t('taskTable.target') }}: {{ target }}</span>
      </v-card-title>
      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <div class="result-table">
          <v-alert
            v-if="probeStats.length === 0 && !loading"
            type="info"
            variant="tonal"
            density="compact"
          >
            {{ $t('continuous.noData') }}
          </v-alert>

          <div v-else style="overflow-x: auto">
            <v-table density="compact">
              <thead>
                <tr>
                  <th style="width: 220px">{{ $t('home.probeLabel') }}</th>
                  <th style="width: 160px">{{ $t('results.resolvedIP') }}</th>
                  <th style="width: 180px">{{ $t('results.targetISP') }}</th>
                  <th style="width: 100px; text-align: center">{{ $t('results.loss') }}</th>
                  <th style="width: 80px; text-align: center">{{ $t('continuous.count') }}</th>
                  <th style="width: 100px; text-align: center">{{ $t('continuous.last') }}</th>
                  <th style="width: 100px; text-align: center">{{ $t('results.avg') }}</th>
                  <th style="width: 100px; text-align: center">{{ $t('results.min') }}</th>
                  <th style="width: 100px; text-align: center">{{ $t('results.max') }}</th>
                  <th style="width: 100px; text-align: center">{{ $t('continuous.stdev') }}</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="probe in probeStats" :key="probe.probe_id">
                  <td>
                    <ProbeCell :location="probe.location" :provider="probe.provider" />
                  </td>
                  <td>{{ probe.resolved_ip || '-' }}</td>
                  <td>
                    <ProviderCell
                      :target_asn="probe.target_asn"
                      :target_as_name="probe.target_as_name"
                      :target_isp="probe.target_isp"
                    />
                  </td>
                  <td style="text-align: center">
                    <v-chip size="small" variant="tonal" :color="getLossColor(probe.packet_loss)">
                      {{ probe.packet_loss?.toFixed(1) }}%
                    </v-chip>
                  </td>
                  <td style="text-align: center">{{ probe.test_count }}</td>
                  <td style="text-align: center">
                    <v-chip
                      v-if="probe.last_latency"
                      size="small"
                      variant="tonal"
                      :color="getLatencyColor(probe.last_latency)"
                    >
                      {{ probe.last_latency.toFixed(2) }}
                    </v-chip>
                    <span v-else>-</span>
                  </td>
                  <td style="text-align: center">
                    <span v-if="probe.avg_latency" :class="getAvgClass(probe.avg_latency)">
                      {{ probe.avg_latency.toFixed(2) }}
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td style="text-align: center">
                    <span v-if="probe.min_latency !== undefined && probe.min_latency !== Infinity">
                      {{ probe.min_latency.toFixed(2) }}
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td style="text-align: center">
                    <span v-if="probe.max_latency !== undefined && probe.max_latency !== -Infinity">
                      {{ probe.max_latency.toFixed(2) }}
                    </span>
                    <span v-else>-</span>
                  </td>
                  <td style="text-align: center">
                    <span v-if="probe.stdev !== undefined">{{ probe.stdev.toFixed(2) }}</span>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-card
      class="result-card"
      variant="outlined"
      style="margin-top: 20px"
    >
      <v-card-title class="card-header">
        <span>{{ $t('continuous.latencyChart') }}</span>
      </v-card-title>
      <v-card-text>
        <div ref="chartContainer" class="chart-container" />
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import api from '@/utils/request'
import ProviderCell from '@/components/ProviderCell.vue'
import ProbeCell from '@/components/ProbeCell.vue'

const { t: $t } = useI18n()
const ui = useUiStore()

const route = useRoute()
const router = useRouter()
const taskId = route.params.id as string

const loading = ref(true)
type TaskInfo = {
  status?: string
  target?: string
}

const taskInfo = ref<TaskInfo | null>(null)
const target = ref('')
const chartContainer = ref<HTMLDivElement>()
let chart: ECharts | null = null
let updateTimer: number | null = null

type ProbeView = {
  probe_id: string
  name?: string
  location?: string
  metadata?: unknown
  city?: string
  country?: string
  provider?: string
}

type ResultRow = {
  probe_id: string
  created_at: string
  summary?: unknown
  result_data?: unknown
  probe?: ProbeView
}

type ProbeStatsRow = {
  probe_id: string
  probe_name: string
  provider: string
  location: string
  city: string
  country: string
  test_count: number
  last_latency?: number
  avg_latency?: number
  min_latency?: number
  max_latency?: number
  packet_loss?: number
  stdev?: number

  // 目标解析 IP（域名时为探针解析到的 IP；输入为 IP 时等于输入）
  resolved_ip?: string
  // 目标解析 IP 的 ISP（后端尚未返回时可为空）
  target_isp?: string
  target_asn?: string
  target_as_name?: string
}

const probeStats = ref<ProbeStatsRow[]>([])

function getLatencyColor(latency?: number): string {
  if (latency === undefined) return 'info'
  if (latency < 100) return 'success'
  if (latency < 200) return 'warning'
  return 'error'
}

function getLossColor(loss?: number): string {
  if (loss === undefined) return 'info'
  if (loss === 0) return 'success'
  if (loss < 10) return 'warning'
  return 'error'
}

function getAvgClass(latency: number): string {
  if (latency < 100) return 'latency-good'
  if (latency < 200) return 'latency-normal'
  return 'latency-bad'
}

// 初始化图表
function initChart() {
  if (!chartContainer.value) return

  chart = echarts.init(chartContainer.value)

  const option = {
    title: {
      text: String($t('continuous.latencyChart')),
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
    },
    legend: {
      data: [],
      top: 30,
      type: 'scroll',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: String($t('continuous.latencyMs')),
      axisLabel: {
        formatter: `{value} ${String($t('common.ms'))}`,
      },
    },
    series: [],
  }

  chart.setOption(option)

  // 响应式调整
  window.addEventListener('resize', handleResize)
}

function handleResize() {
  chart?.resize()
}

// 更新图表数据
function updateChart(results: ResultRow[]) {
  if (!chart) return

  // 按探针分组
  const probeMap = new Map<string, ResultRow[]>()

  results.forEach((result) => {
    const probeId = result.probe_id
    if (!probeMap.has(probeId)) {
      probeMap.set(probeId, [])
    }
    probeMap.get(probeId)!.push(result)
  })

  // 构建图表系列
  const series: echarts.SeriesOption[] = []
  const legendData: string[] = []

  probeMap.forEach((data, probeId) => {
    const probeName = data[0]?.probe?.name || probeId

    // 按时间排序
    data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // 构建数据点
    const seriesData = data.map((r) => {
      const summary = (r.summary || {}) as Record<string, unknown>
      const latency = (summary['avg_rtt_ms'] as number) || (summary['avg_latency'] as number) || 0
      return [new Date(r.created_at).getTime(), latency]
    })

    series.push({
      name: probeName,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      data: seriesData,
    })

    legendData.push(probeName)
  })

  chart.setOption({
    legend: {
      data: legendData,
    },
    series: series,
  })
}

// 更新节点统计
function updateProbeStats(results: ResultRow[]) {
  const statsMap = new Map<string, ProbeStatsRow>()

  // 按探针分组收集所有延迟值
  const probeLatenciesMap = new Map<string, number[]>()

  results.forEach((result) => {
    const probeId = result.probe_id
    const summary = (result.summary || {}) as Record<string, unknown>
    const latency = (summary['avg_rtt_ms'] as number) || (summary['avg_latency'] as number)
    if (!probeLatenciesMap.has(probeId)) {
      probeLatenciesMap.set(probeId, [])
    }

    if (latency !== undefined) {
      probeLatenciesMap.get(probeId)!.push(latency)
    }
  })

  // 计算统计数据
  probeLatenciesMap.forEach((latencies, probeId) => {
    const first = results.find((r) => r.probe_id === probeId)
    const probe = first?.probe
    const parsedSummary = ((first?.summary || {}) as Record<string, unknown>)

    const packetLoss = (parsedSummary['packet_loss_percent'] as number) || 0
    const lastLatency = latencies[latencies.length - 1]
    const minLatency = Math.min(...latencies)
    const maxLatency = Math.max(...latencies)
    const avgLatency = latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length

    // 计算标准差
    const variance = latencies.reduce((sum: number, val: number) => sum + Math.pow(val - avgLatency, 2), 0) / latencies.length
    const stdev = Math.sqrt(variance)

    const parsedData = ((first?.result_data || {}) as Record<string, unknown>)
    const resolvedIP = (parsedData['resolved_ip'] as string) || (parsedSummary['resolved_ip'] as string) || undefined
    const targetISP = (parsedSummary['target_isp'] as string) || (parsedData['target_isp'] as string) || undefined
    const targetASN = (parsedSummary['target_asn'] as string) || (parsedData['target_asn'] as string) || undefined
    const targetASName = (parsedSummary['target_as_name'] as string) || (parsedData['target_as_name'] as string) || undefined

    statsMap.set(probeId, {
      probe_id: probeId,
      probe_name: probe?.name || String($t('common.unknown')),
      provider: probe?.provider || probe?.name || 'Unknown',
      location: probe?.location || 'Unknown',
      city: probe?.city || probe?.location || 'Unknown',
      country: probe?.country || '',
      test_count: latencies.length,
      last_latency: lastLatency,
      avg_latency: avgLatency,
      min_latency: minLatency,
      max_latency: maxLatency,
      packet_loss: packetLoss,
      stdev: stdev,
      resolved_ip: resolvedIP,
      target_isp: targetISP,
      target_asn: targetASN,
      target_as_name: targetASName,
    } satisfies ProbeStatsRow)
  })

  probeStats.value = Array.from(statsMap.values())
}

async function loadData() {
  try {
    // 获取任务信息
    type TaskResponse = {
      task: TaskInfo
    }
    const taskRes = await api.get<TaskResponse>(`/tasks/${taskId}`)
    taskInfo.value = taskRes.task
    target.value = taskRes.task?.target || ''

    // 获取测试结果
    type ResultsResponse = {
      results: ResultRow[]
    }
    const resultsRes = await api.get<ResultsResponse>('/results', {
      params: { task_id: taskId },
    })

    // 合并探针信息（解析 metadata，补充 country/city/provider 等）
    type ProbesResponse = {
      probes: ProbeView[]
    }
    const probesRes = await api.get<ProbesResponse>('/probes')
    const probesMap = new Map<string, ProbeView>(
      (probesRes.probes || []).map((p: ProbeView) => {
        let metadata: Record<string, unknown> = {}
        try {
          metadata = typeof p.metadata === 'string'
            ? (JSON.parse(p.metadata) as Record<string, unknown>)
            : ((p.metadata || {}) as Record<string, unknown>)
        } catch (e) {
          console.error('Failed to parse probe metadata:', e)
        }

        return [
          p.probe_id,
          {
            ...p,
            city: (metadata['city'] as string) || (metadata['location_city'] as string) || '',
            country:
              (metadata['country'] as string) ||
              (metadata['country_code'] as string) ||
              (metadata['countryCode'] as string) ||
              '',
            provider: (metadata['provider'] as string) || (metadata['isp'] as string) || '',
          },
        ]
      })
    )

    const results = (resultsRes.results || []).map((r: ResultRow) => ({
      ...r,
      summary: typeof r.summary === 'string' ? (JSON.parse(r.summary) as Record<string, unknown>) : r.summary,
      probe: probesMap.get(r.probe_id),
    }))

    updateChart(results)
    updateProbeStats(results)
  } catch (error: unknown) {
    console.error('加载数据失败:', error)
    ui.notify(String($t('errors.loadDataFailed')), 'error')
  } finally {
    loading.value = false
  }
}

async function stopTask() {
  try {
    const confirmed = await ui.confirm(String($t('continuous.stopConfirm')), {
      title: String($t('common.hint')),
    })
    if (!confirmed) return

    await api.delete(`/tasks/${taskId}`)
    ui.notify(String($t('continuous.taskStopped')), 'success')
    if (taskInfo.value) {
      taskInfo.value.status = 'cancelled'
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('停止任务失败:', error)
      ui.notify(String($t('errors.stopTaskFailed')), 'error')
    }
  }
}

// 定期刷新数据
function startAutoRefresh() {
  updateTimer = window.setInterval(() => {
    if (taskInfo.value?.status === 'running') {
      loadData()
    }
  }, 5000) // 每5秒刷新一次
}

onMounted(() => {
  initChart()
  loadData()
  startAutoRefresh()
})

onBeforeUnmount(() => {
  if (updateTimer) {
    clearInterval(updateTimer)
  }
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<style scoped>
.continuous-test-result {
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
  font-weight: bold;
}

.chart-container {
  width: 100%;
  height: 400px;
}

/* 保留原来的颜色逻辑（用于平均值 class） */
.latency-good {
  color: #67c23a;
  font-weight: bold;
}

.latency-normal {
  color: #e6a23c;
}

.latency-bad {
  color: #f56c6c;
  font-weight: bold;
}
</style>
