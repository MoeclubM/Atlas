<template>
  <div class="probes-page">
    <v-card variant="outlined" class="main-card">
      <v-card-title class="page-header">
        <div class="header-left">
          <h2>{{ $t('probes.title') }}</h2>
          <p class="subtitle">{{ $t('probes.subtitle') }}</p>
        </div>

        <v-btn color="primary" :loading="probeStore.loading" @click="refresh">
          <v-icon icon="mdi-refresh" start />
          {{ $t('probes.refreshList') }}
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- 统计概览 -->
        <v-row class="stats-row" dense>
          <v-col cols="12" sm="4">
            <div class="stat-box online">
              <v-icon class="stat-icon" icon="mdi-check-circle" />
              <div class="stat-info">
                <div class="stat-value">{{ probeStore.onlineCount }}</div>
                <div class="stat-label">{{ $t('probes.online') }}</div>
              </div>
            </div>
          </v-col>

          <v-col cols="12" sm="4">
            <div class="stat-box offline">
              <v-icon class="stat-icon" icon="mdi-close-circle" />
              <div class="stat-info">
                <div class="stat-value">{{ probeStore.offlineProbes.length }}</div>
                <div class="stat-label">{{ $t('probes.offline') }}</div>
              </div>
            </div>
          </v-col>

          <v-col cols="12" sm="4">
            <div class="stat-box total">
              <v-icon class="stat-icon" icon="mdi-monitor" />
              <div class="stat-info">
                <div class="stat-value">{{ probeStore.probes.length }}</div>
                <div class="stat-label">{{ $t('probes.total') }}</div>
              </div>
            </div>
          </v-col>
        </v-row>

        <!-- 筛选工具栏 -->
        <div class="filter-bar">
          <v-text-field
            v-model="searchText"
            :label="$t('common.search')"
            :placeholder="$t('probes.searchPlaceholder')"
            prepend-inner-icon="mdi-magnify"
            clearable
            variant="outlined"
            density="compact"
            class="search-input"
          />

          <div class="filter-group">
            <v-select
              v-model="filterRegion"
              :label="$t('probes.allRegions')"
              :items="regionItems"
              clearable
              variant="outlined"
              density="compact"
              class="filter-select"
            />

            <v-select
              v-model="filterStatus"
              :label="$t('probes.allStatus')"
              :items="statusItems"
              item-title="title"
              item-value="value"
              clearable
              variant="outlined"
              density="compact"
              class="filter-select"
            />
          </div>
        </div>

        <v-progress-linear v-if="probeStore.loading" indeterminate class="mb-3" />

        <v-alert
          v-else-if="filteredProbes.length === 0"
          type="info"
          variant="tonal"
          density="compact"
        >
          {{ $t('common.none') }}
        </v-alert>

        <!-- 探针数据表格 -->
        <v-table v-else class="probe-table">
          <thead>
            <tr>
              <th style="min-width: 180px">{{ $t('probes.nodeName') }}</th>
              <th style="width: 180px">{{ $t('probes.ipAddress') }}</th>
              <th style="min-width: 200px">{{ $t('probes.geoLocation') }}</th>
              <th style="width: 150px">{{ $t('probes.region') }}</th>
              <th style="width: 120px">{{ $t('probes.status') }}</th>
              <th style="width: 110px">{{ $t('probes.version') }}</th>
              <th style="width: 190px">{{ $t('probes.lastActive') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in filteredProbes" :key="row.probe_id">
              <td>
                <div class="probe-name-cell">
                  <div class="status-dot" :class="row.status" />
                  <span class="name-text">{{ row.name }}</span>
                </div>
              </td>

              <td>
                <div class="ip-cell">
                  <span>{{ row.ip_address }}</span>
                  <v-tooltip :text="$t('probes.copyIp')" location="top">
                    <template #activator="{ props }">
                      <v-icon
                        v-bind="props"
                        class="copy-icon"
                        icon="mdi-content-copy"
                        size="18"
                        @click.stop="copyText(row.ip_address || '')"
                      />
                    </template>
                  </v-tooltip>
                </div>
              </td>

              <td>
                <div class="location-cell">
                  <v-icon icon="mdi-map-marker-outline" size="18" />
                  <span>{{ row.location }}</span>
                </div>
              </td>

              <td>
                <v-chip size="small" variant="tonal">{{ row.region }}</v-chip>
              </td>

              <td>
                <v-chip
                  size="small"
                  variant="tonal"
                  :color="row.status === 'online' ? 'success' : 'info'"
                >
                  {{ row.status === 'online' ? $t('probes.statusRunning') : $t('probes.statusOffline') }}
                </v-chip>
              </td>

              <td>{{ row.version }}</td>

              <td>
                <span class="time-text">
                  {{ row.last_heartbeat ? formatTime(row.last_heartbeat) : $t('probes.never') }}
                </span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProbeStore } from '@/stores/probe'
import { useUiStore } from '@/stores/ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { t: $t } = useI18n()

const probeStore = useProbeStore()
const ui = useUiStore()

const searchText = ref('')
const filterRegion = ref('')
const filterStatus = ref('')

const regionItems = computed(() => {
  const regionSet = new Set(probeStore.probes.map((p) => p.region).filter(Boolean))
  return Array.from(regionSet).sort()
})

const statusItems = computed(() => [
  { title: String($t('probes.statusOnline')), value: 'online' },
  { title: String($t('probes.statusOffline')), value: 'offline' },
])

const filteredProbes = computed(() => {
  return probeStore.probes.filter((probe) => {
    const searchLower = searchText.value.toLowerCase()
    if (
      searchText.value &&
      !probe.name.toLowerCase().includes(searchLower) &&
      !probe.location.toLowerCase().includes(searchLower) &&
      !(probe.ip_address || '').includes(searchLower)
    ) {
      return false
    }
    if (filterRegion.value && probe.region !== filterRegion.value) return false
    if (filterStatus.value && probe.status !== filterStatus.value) return false
    return true
  })
})

function refresh() {
  probeStore.fetchProbes()
  ui.notify(String($t('probes.refreshSuccess')), 'success')
}

function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

function copyText(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      ui.notify(String($t('probes.ipCopied')), 'success')
    })
    .catch(() => {
      ui.notify(String($t('probes.copyFailed')), 'error')
    })
}

onMounted(() => {
  probeStore.fetchProbes()
})
</script>

<style scoped>
.probes-page {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.main-card {
  border-radius: 12px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.header-left h2 {
  margin: 0;
  font-size: 24px;
  color: var(--text);
  font-weight: 600;
}

.subtitle {
  margin: 8px 0 0 0;
  font-size: 14px;
  color: var(--text-2);
}

.stats-row {
  margin-bottom: 24px;
}

.stat-box {
  padding: 24px;
  border-radius: 12px;
  color: white;
  display: flex;
  align-items: center;
  gap: 20px;
  transition: transform 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-box:hover {
  transform: translateY(-2px);
}

.stat-box.online {
  background: linear-gradient(135deg, #00b09b, #96c93d);
}

.stat-box.offline {
  background: linear-gradient(135deg, #ff5f6d, #ffc371);
}

.stat-box.total {
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.stat-icon {
  font-size: 48px;
  opacity: 0.9;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
  margin-top: 4px;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

.search-input {
  width: 320px;
}

.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-select {
  width: 160px;
}

.probe-table {
  border-radius: 8px;
  overflow: hidden;
}

.probe-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #dcdfe6;
}

.status-dot.online {
  background-color: #67c23a;
  box-shadow: 0 0 4px #67c23a;
}

.status-dot.offline {
  background-color: #f56c6c;
}

.name-text {
  font-weight: 600;
  color: #303133;
}

.ip-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: monospace;
}

.copy-icon {
  cursor: pointer;
  color: #909399;
  transition: color 0.2s;
}

.copy-icon:hover {
  color: #409eff;
}

.location-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
}

.time-text {
  color: #909399;
  font-size: 13px;
}
</style>
