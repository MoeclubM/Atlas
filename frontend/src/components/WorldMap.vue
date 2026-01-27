<template>
  <div class="world-map">
    <div
      ref="mapContainer"
      class="map-container"
    />
    <div
      v-if="loading"
      class="map-loading"
    >
      <v-progress-circular indeterminate size="32" />
      <span>加载地图中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, computed } from 'vue'
import { useTheme } from 'vuetify'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// 修复 Leaflet 默认图标路径问题
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: iconShadow,
})

export interface ProbeMarker {
  probe_id: string
  name: string
  location: string
  latitude: number
  longitude: number
  latency?: number // 延迟（毫秒）
  status?: 'success' | 'failed' | 'timeout'
  packetLoss?: number
}

type MapMarkerGroup = {
  latitude: number
  longitude: number
  probes: ProbeMarker[]
  latency?: number
  status?: 'success' | 'failed' | 'timeout'
  packetLoss?: number
}

interface Props {
  probes: ProbeMarker[]
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: '500px',
})

const mapContainer = ref<HTMLDivElement>()
const loading = ref(true)
let map: L.Map | null = null
let tileLayer: L.TileLayer | null = null
const markers: L.CircleMarker[] = []

const theme = useTheme()

// 检测当前主题（需要可响应地随 Vuetify 主题切换而更新）
const isDark = computed(() => theme.global.current.value.dark)

// 根据延迟获取颜色
function getColorByLatency(latency?: number, status?: string): string {
  // 仅使用绿/黄/红，优先按连接状态判断
  if (status === 'failed' || status === 'timeout') {
    return '#F56C6C' // 红色 - 失败/超时
  }

  if (latency === undefined || latency === null || Number.isNaN(latency)) {
    return '#E6A23C' // 黄色 - 未知/无延迟数据
  }

  if (latency < 100) return '#67C23A' // 绿色
  if (latency < 200) return '#E6A23C' // 黄色
  return '#F56C6C' // 红色
}

// 更新地图瓦片图层
function updateTileLayer() {
  if (!map) return

  // 移除旧的瓦片图层
  if (tileLayer) {
    tileLayer.remove()
  }

  // 根据主题选择不同的瓦片图层
  const tileUrl = isDark.value
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution = isDark.value
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

  // 添加新的瓦片图层
  tileLayer = L.tileLayer(tileUrl, {
    attribution,
    maxZoom: 19,
  }).addTo(map)
}

// 初始化地图
function initMap() {
  if (!mapContainer.value) return

  // 创建地图实例
  map = L.map(mapContainer.value, {
    center: [20, 0], // 初始中心点
    zoom: 2,
    zoomControl: true,
  })

  // 添加瓦片图层
  updateTileLayer()

  // 地图加载完成
  map.whenReady(() => {
    loading.value = false
    updateMarkers()
  })
}

// 更新标记点
function updateMarkers() {
  if (!map) return

  // 清除旧标记
  markers.forEach((marker) => marker.remove())
  markers.length = 0

  // 合并同坐标的节点
  const groupMap = new Map<string, MapMarkerGroup>()
  for (const probe of props.probes) {
    if (!probe.latitude || !probe.longitude) continue

    const key = `${probe.latitude.toFixed(5)},${probe.longitude.toFixed(5)}`
    const existing = groupMap.get(key)
    if (existing) {
      existing.probes.push(probe)
      continue
    }

    groupMap.set(key, {
      latitude: probe.latitude,
      longitude: probe.longitude,
      probes: [probe],
      latency: probe.latency,
      status: probe.status,
      packetLoss: probe.packetLoss,
    })
  }

  const groups = Array.from(groupMap.values())

  // 添加新标记
  groups.forEach((group) => {
    const color = getColorByLatency(group.latency, group.status)

    const radius = Math.min(16, 10 + Math.max(0, group.probes.length - 1) * 2)

    // 创建圆形标记
    const marker = L.circleMarker([group.latitude, group.longitude], {
      radius,
      fillColor: color,
      color: 'white',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
    })

    // 创建弹出窗口内容（可展开查看同坐标所有节点）
    const title = group.probes.length === 1 ? group.probes[0].location : `${group.probes.length} 个节点`

    let popupHtml = `
      <div class="probe-popup">
        <h3 class="probe-name">${title}</h3>
    `

    if (group.latency !== undefined) {
      popupHtml += `
        <p class="probe-info">
          <strong>延迟:</strong> <span style="color: ${color}; font-weight: bold;">${group.latency.toFixed(2)} ms</span>
        </p>
      `
    }

    if (group.packetLoss !== undefined) {
      popupHtml += `
        <p class="probe-info">
          <strong>丢包率:</strong> ${group.packetLoss.toFixed(1)}%
        </p>
      `
    }

    if (group.status) {
      const statusText = {
        success: '成功',
        failed: '失败',
        timeout: '超时',
      }[group.status]
      popupHtml += `
        <p class="probe-info">
          <strong>状态:</strong> ${statusText}
        </p>
      `
    }

    if (group.probes.length > 1) {
      popupHtml += `
        <div class="probe-list">
          ${group.probes
            .map((p) => {
              const c = getColorByLatency(p.latency, p.status)
              const latency = p.latency !== undefined ? `${p.latency.toFixed(1)} ms` : '-'
              return `
                <div class="probe-list-item">
                  <span class="probe-dot" style="background:${c}"></span>
                  <span class="probe-list-latency">${latency}</span>
                </div>
              `
            })
            .join('')}
        </div>
      `
    }

    popupHtml += '</div>'

    marker.bindPopup(popupHtml)
    marker.addTo(map!)

    markers.push(marker)
  })

  // 自动调整视图以显示所有标记
  if (groups.length > 0) {
    const bounds = L.latLngBounds(groups.map((g) => [g.latitude, g.longitude]))

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 8,
      })
    }
  }
}

// 监听探针数据变化
watch(() => props.probes, updateMarkers, { deep: true })

// 监听主题变化
watch(isDark, () => {
  updateTileLayer()
})

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  markers.forEach((marker) => marker.remove())
  map?.remove()
})
</script>

<style scoped>
.world-map {
  position: relative;
  width: 100%;
}

.map-container {
  width: 100%;
  height: v-bind(height);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.map-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  padding: 20px 30px;
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow);
  border: 1px solid var(--border);
  z-index: 1000;
}

.map-loading span {
  font-size: 14px;
  color: var(--text-2);
}
</style>

<style>
/* 全局样式覆盖 Leaflet 弹出窗口 */
.leaflet-popup-content-wrapper {
  background: var(--surface) !important;
  color: var(--text) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px var(--shadow) !important;
}

.leaflet-popup-tip {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}

.leaflet-popup-close-button {
  color: var(--text-2) !important;
}

.leaflet-popup-close-button:hover {
  color: var(--text) !important;
}

/* 地图控件样式 */
.leaflet-control-zoom a {
  background: var(--surface) !important;
  color: var(--text) !important;
  border: 1px solid var(--border) !important;
}

.leaflet-control-zoom a:hover {
  background: var(--surface-2) !important;
}

.leaflet-control-attribution {
  background: var(--surface) !important;
  color: var(--text-2) !important;
  border-top: 1px solid var(--border) !important;
  font-size: 11px !important;
}

.leaflet-control-attribution a {
  color: var(--accent) !important;
}

.probe-popup {
  padding: 8px;
  min-width: 150px;
}

.probe-name {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.probe-info {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-2);
}

.probe-info strong {
  color: var(--text);
  font-weight: 600;
}

.probe-list {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}

.probe-list-item {
  display: grid;
  grid-template-columns: 10px 1fr;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}

.probe-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.probe-list-latency {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
</style>
