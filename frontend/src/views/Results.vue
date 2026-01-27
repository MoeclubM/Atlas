<template>
  <div class="results-page">
    <v-card variant="outlined">
      <v-card-title class="page-header">
        <div>
          <h2>{{ $t('resultsPage.title') }}</h2>
          <p class="subtitle">{{ $t('resultsPage.subtitle') }}</p>
        </div>

        <v-btn variant="tonal" :loading="loading" @click="refresh">
          <v-icon icon="mdi-refresh" start />
          {{ $t('common.refresh') }}
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- 筛选栏 -->
        <div class="filter-bar">
          <v-select
            v-model="selectedTaskId"
            :items="taskItems"
            :label="$t('resultsPage.selectTask')"
            item-title="title"
            item-value="value"
            clearable
            variant="outlined"
            density="compact"
            style="width: 240px"
          />

          <v-select
            v-model="selectedProbeId"
            :items="probeItems"
            :label="$t('resultsPage.selectProbe')"
            item-title="title"
            item-value="value"
            clearable
            variant="outlined"
            density="compact"
            style="width: 240px"
          />

          <v-btn color="primary" @click="loadResults">
            {{ $t('resultsPage.query') }}
          </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <v-alert
          v-else-if="results.length === 0"
          type="info"
          variant="tonal"
          density="compact"
        >
          {{ $t('taskTable.empty') }}
        </v-alert>

        <!-- 结果列表 -->
        <v-table v-else>
          <thead>
            <tr>
              <th style="width: 200px">{{ $t('resultsPage.taskId') }}</th>
              <th style="width: 120px">{{ $t('resultsPage.type') }}</th>
              <th>{{ $t('resultsPage.target') }}</th>
              <th style="width: 200px">{{ $t('resultsPage.probeId') }}</th>
              <th style="width: 180px">{{ $t('resultsPage.time') }}</th>
              <th style="width: 120px">{{ $t('resultsPage.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in results" :key="`${row.task_id}-${row.probe_id}-${row.created_at}`">
              <td>{{ row.task_id }}</td>
              <td>
                <v-chip size="small" variant="tonal">
                  {{ getResultTypeName(row.test_type) }}
                </v-chip>
              </td>
              <td>{{ row.target }}</td>
              <td>{{ row.probe_id }}</td>
              <td>{{ formatTime(row.created_at) }}</td>
              <td>
                <v-btn
                  variant="text"
                  density="compact"
                  color="primary"
                  @click="showResultDetail(row)"
                >
                  {{ $t('resultsPage.viewDetail') }}
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <!-- 结果详情对话框 -->
    <v-dialog v-model="showDetailDialog" max-width="900">
      <v-card>
        <v-card-title>
          {{ dialogTitle }}
        </v-card-title>

        <v-card-text v-if="selectedResult">
          <v-tabs v-model="detailTab" density="compact">
            <v-tab value="raw">{{ $t('resultsPage.rawData') }}</v-tab>
            <v-tab value="viz">{{ $t('resultsPage.visualization') }}</v-tab>
          </v-tabs>

          <v-window v-model="detailTab" class="mt-3">
            <v-window-item value="raw">
              <pre class="result-box">{{ JSON.stringify(selectedResult.result_data, null, 2) }}</pre>
            </v-window-item>

            <v-window-item value="viz">
              <div class="result-visualization">
                <PingChart
                  v-if="selectedResult.test_type === 'icmp_ping' && isPingChartData(selectedResult.result_data)"
                  :data="selectedResult.result_data"
                />
                <div v-else class="no-chart">
                  <v-icon icon="mdi-alert-circle-outline" size="48" class="mb-2" />
                  <p>{{ $t('resultsPage.noChart') }}</p>
                </div>
              </div>
            </v-window-item>
          </v-window>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDetailDialog = false">{{ $t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/task'
import { useProbeStore } from '@/stores/probe'
import { resultApi } from '@/api'
import dayjs from 'dayjs'
import type { TestResult, TaskType } from '@/types'
import { useUiStore } from '@/stores/ui'
import PingChart from '@/components/PingChart.vue'

const ui = useUiStore()

type PingPacket = {
  time?: number
}

type PingChartData = {
  packets?: PingPacket[]
}

function isPingChartData(value: unknown): value is PingChartData {
  return typeof value === 'object' && value !== null
}

const taskStore = useTaskStore()
const probeStore = useProbeStore()
const { t: $t } = useI18n()

const loading = ref(false)
const results = ref<TestResult[]>([])
const selectedTaskId = ref('')
const selectedProbeId = ref('')
const showDetailDialog = ref(false)
const selectedResult = ref<TestResult | null>(null)
const detailTab = ref<'raw' | 'viz'>('raw')

const dialogTitle = computed(() => {
  const target = selectedResult.value?.target || '-'
  return `${String($t('resultsPage.title'))} - ${target}`
})

const taskItems = computed(() => {
  return taskStore.tasks.map((task) => ({
    title: `${task.task_type} - ${task.target}`,
    value: task.task_id,
  }))
})

const probeItems = computed(() => {
  return probeStore.probes.map((probe) => ({
    title: probe.name,
    value: probe.probe_id,
  }))
})

async function loadResults() {
  loading.value = true
  try {
    const response = await resultApi.list({
      task_id: selectedTaskId.value || undefined,
      probe_id: selectedProbeId.value || undefined,
      limit: 100,
    })
    results.value = response.results || []
  } finally {
    loading.value = false
  }
}

function refresh() {
  loadResults()
  ui.notify(String($t('tasks.refreshSuccess')), 'success')
}

function showResultDetail(result: TestResult) {
  selectedResult.value = result
  detailTab.value = 'raw'
  showDetailDialog.value = true
}

function getResultTypeName(type: TaskType): string {
  const names = $t('taskTable.typeNames') as unknown as Record<TaskType, string>
  return names[type] || type
}

function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

onMounted(async () => {
  await Promise.all([taskStore.fetchTasks(100), probeStore.fetchProbes()])
  await loadResults()
})
</script>

<style scoped>
.results-page {
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text);
}

.subtitle {
  margin: 5px 0 0 0;
  font-size: 14px;
  color: var(--text-2);
}

.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
}

.result-box {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  max-height: 500px;
  overflow: auto;
  font-size: 12px;
}

.result-visualization {
  padding: 12px 0;
}

.no-chart {
  text-align: center;
  padding: 60px 0;
  color: var(--text-2);
}
</style>
