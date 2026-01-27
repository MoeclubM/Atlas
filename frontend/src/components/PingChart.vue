<template>
  <div
    ref="chartRef"
    class="ping-chart"
    style="width: 100%; height: 400px"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as echarts from 'echarts'

type PingPacket = {
  time?: number
}

type PingChartData = {
  packets?: PingPacket[]
}

const props = defineProps<{
  data: PingChartData
}>()

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)

  // 解析 Ping 结果数据
  const packets = props.data?.packets || []
  const times = packets.map((p) => p.time)
  const xData = packets.map((_, i: number) => `第${i + 1}次`)

  const option = {
    title: {
      text: 'ICMP Ping 延迟',
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const first = (params as Array<{ name?: string; value?: number }> | undefined)?.[0]
        const name = first?.name ?? ''
        const value = first?.value ?? 0
        return `${name}<br/>延迟: ${value} ms`
      },
    },
    xAxis: {
      type: 'category',
      data: xData,
      name: '发包次数',
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      axisLabel: {
        formatter: '{value} ms',
      },
    },
    series: [
      {
        name: '延迟',
        type: 'line',
        data: times,
        smooth: true,
        itemStyle: {
          color: '#409eff',
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.05)' },
          ]),
        },
      },
    ],
    grid: {
      left: '60px',
      right: '20px',
      bottom: '40px',
      top: '60px',
    },
  }

  chartInstance.setOption(option)
}

onMounted(() => {
  initChart()
})

watch(
  () => props.data,
  () => {
    if (chartInstance) {
      chartInstance.dispose()
    }
    initChart()
  },
  { deep: true }
)
</script>

<style scoped>
.ping-chart {
  min-height: 400px;
}
</style>
