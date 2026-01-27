<template>
  <div class="dashboard">
    <v-row dense>
      <!-- 统计卡片 -->
      <v-col v-for="stat in statistics" :key="stat.key" cols="12" sm="6" md="3">
        <v-card class="stat-card" variant="outlined">
          <v-card-text>
            <div class="stat-content">
              <div class="stat-icon" :style="{ background: stat.color }">
                <v-icon :icon="stat.icon" :class="stat.key === 'running' ? 'spin' : ''" size="30" />
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ stat.value }}</div>
                <div class="stat-label">{{ stat.label }}</div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row dense class="mt-5">
      <!-- 快速创建任务 -->
      <v-col cols="12" md="6">
        <v-card class="action-card" variant="outlined">
          <v-card-title class="card-header">
            <v-icon icon="mdi-flash" />
            <span>{{ $t('dashboard.quickCreate') }}</span>
          </v-card-title>
          <v-card-text>
            <QuickTaskForm @created="handleTaskCreated" />
          </v-card-text>
        </v-card>
      </v-col>

      <!-- 在线探针 -->
      <v-col cols="12" md="6">
        <v-card class="probe-card" variant="outlined">
          <v-card-title class="card-header">
            <v-icon icon="mdi-connection" />
            <span>{{ $t('dashboard.onlineProbes') }}</span>
            <v-spacer />
            <v-btn
              color="primary"
              size="small"
              variant="tonal"
              :loading="probeStore.loading"
              @click="probeStore.fetchProbes"
            >
              <v-icon icon="mdi-refresh" start />
              {{ $t('common.refresh') }}
            </v-btn>
          </v-card-title>
          <v-card-text>
            <ProbeList :limit="5" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row dense class="mt-5">
      <!-- 最近任务 -->
      <v-col cols="12">
        <v-card class="task-card" variant="outlined">
          <v-card-title class="card-header">
            <v-icon icon="mdi-format-list-bulleted" />
            <span>{{ $t('dashboard.recentTasks') }}</span>
            <v-spacer />
            <v-btn color="primary" size="small" variant="tonal" @click="router.push('/tasks')">
              {{ $t('dashboard.viewAll') }}
            </v-btn>
          </v-card-title>
          <v-card-text>
            <TaskTable :limit="10" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProbeStore } from '@/stores/probe'
import { useTaskStore } from '@/stores/task'
import QuickTaskForm from '@/components/QuickTaskForm.vue'
import ProbeList from '@/components/ProbeList.vue'
import TaskTable from '@/components/TaskTable.vue'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const { t: $t } = useI18n()
const probeStore = useProbeStore()
const taskStore = useTaskStore()
const ui = useUiStore()

const statistics = computed(() => [
  {
    key: 'online',
    label: $t('dashboard.onlineProbes'),
    value: probeStore.onlineCount,
    icon: 'mdi-connection',
    color: '#333',
  },
  {
    key: 'total',
    label: $t('dashboard.totalTasks'),
    value: taskStore.tasks.length,
    icon: 'mdi-monitor',
    color: '#666',
  },
  {
    key: 'completed',
    label: $t('dashboard.completed'),
    value: taskStore.completedTasks.length,
    icon: 'mdi-check-circle',
    color: '#333',
  },
  {
    key: 'running',
    label: $t('dashboard.running'),
    value: taskStore.runningTasks.length,
    icon: 'mdi-loading',
    color: '#666',
  },
])

function handleTaskCreated(taskId?: string) {
  ui.notify(String($t('dashboard.taskCreated')), 'success')
  taskStore.fetchTasks()

  if (taskId) {
    // 自动跳转到任务详情页
    router.push(`/tasks/${taskId}`)
  }
}

onMounted(() => {
  taskStore.fetchTasks(20)
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stat-card {
  border-radius: 8px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--text);
}

.stat-label {
  font-size: 14px;
  color: var(--text-2);
  margin-top: 5px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.action-card,
.probe-card,
.task-card {
  border-radius: 8px;
}

.spin {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
