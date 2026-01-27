<template>
  <div class="task-table">
    <v-skeleton-loader
      v-if="taskStore.loading"
      type="table"
    />

    <v-alert
      v-else-if="displayTasks.length === 0"
      type="info"
      variant="tonal"
      density="compact"
    >
      {{ $t('taskTable.empty') }}
    </v-alert>

    <v-table v-else>
      <thead>
        <tr>
          <th style="width: 120px">{{ $t('taskTable.type') }}</th>
          <th>{{ $t('taskTable.target') }}</th>
          <th style="width: 110px">{{ $t('taskTable.status') }}</th>
          <th style="width: 110px">{{ $t('taskTable.mode') }}</th>
          <th style="width: 180px">{{ $t('taskTable.createdAt') }}</th>
          <th style="width: 120px">{{ $t('taskTable.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in displayTasks" :key="row.task_id">
          <td>
            <v-chip size="small" variant="tonal">
              {{ getTaskTypeName(row.task_type) }}
            </v-chip>
          </td>
          <td>{{ row.target }}</td>
          <td>
            <v-chip size="small" variant="tonal" :color="getStatusColor(row.status)">
              {{ getStatusName(row.status) }}
            </v-chip>
          </td>
          <td>{{ row.mode === 'single' ? $t('taskTable.single') : $t('taskTable.continuous') }}</td>
          <td>{{ formatTime(row.created_at) }}</td>
          <td>
            <v-btn
              variant="text"
              density="compact"
              color="primary"
              @click="viewResult(row)"
            >
              {{ $t('taskTable.viewResult') }}
            </v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-btn
      v-if="props.limit && taskStore.tasks.length > props.limit"
      variant="text"
      color="primary"
      block
      class="more-btn"
      @click="router.push('/tasks')"
    >
      {{ $t('taskTable.more') }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/task'
import dayjs from 'dayjs'
import type { TaskType, TaskStatus, Task } from '@/types'

const props = defineProps<{
  limit?: number
}>()

const router = useRouter()
const taskStore = useTaskStore()
const { t: $t } = useI18n()

const displayTasks = computed(() => {
  const tasks = taskStore.tasks
  if (props.limit) {
    return tasks.slice(0, props.limit)
  }
  return tasks
})

function getTaskTypeName(type: TaskType): string {
  const names = $t('taskTable.typeNames') as unknown as Record<TaskType, string>
  return names[type] || type
}

function getStatusName(status: TaskStatus): string {
  const names = $t('taskTable.statusNames') as unknown as Record<TaskStatus, string>
  return names[status] || status
}

type ChipColor = 'primary' | 'success' | 'warning' | 'info' | 'error'

function getStatusColor(status: TaskStatus): ChipColor {
  const types: Record<TaskStatus, ChipColor> = {
    pending: 'info',
    running: 'primary',
    completed: 'success',
    failed: 'error',
    cancelled: 'warning',
  }
  return types[status] || 'info'
}

function formatTime(time: string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

function viewResult(task: Task) {
  if (task.mode === 'single') {
    router.push(`/results/single/${task.task_id}`)
  } else {
    router.push(`/results/continuous/${task.task_id}`)
  }
}
</script>

<style scoped>
.task-table {
  min-height: 150px;
}

.more-btn {
  margin-top: 10px;
}
</style>
