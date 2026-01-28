<template>
  <div class="tasks-page">
    <v-card variant="outlined">
      <v-card-title class="page-header">
        <div>
          <h2>{{ $t('tasks.title') }}</h2>
          <p class="subtitle">{{ $t('tasks.subtitle') }}</p>
        </div>

        <v-btn color="primary" @click="showCreateDialog = true">
          <v-icon icon="mdi-plus" start />
          {{ $t('tasks.createTask') }}
        </v-btn>
      </v-card-title>

      <v-card-text>
        <div class="filter-bar">
          <v-text-field
            v-model="searchText"
            :label="$t('tasks.searchTarget')"
            variant="outlined"
            density="compact"
            clearable
            style="width: 220px"
          />

          <v-select
            v-model="filterStatus"
            :label="$t('tasks.statusFilter')"
            :items="statusItems"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            clearable
            style="width: 180px"
          />

          <v-select
            v-model="filterType"
            :label="$t('tasks.typeFilter')"
            :items="typeItems"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            clearable
            style="width: 180px"
          />

          <v-btn variant="tonal" @click="refreshTasks">
            <v-icon icon="mdi-refresh" start />
            {{ $t('common.refresh') }}
          </v-btn>
        </div>

        <!-- 任务表格 -->
        <TaskTable :limit="undefined" />
      </v-card-text>
    </v-card>

    <v-dialog v-model="showCreateDialog" max-width="560">
      <v-card>
        <v-card-title>{{ $t('tasks.createDialogTitle') }}</v-card-title>
        <v-card-text>
          <QuickTaskForm @created="handleTaskCreated" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateDialog = false">{{ $t('common.cancel') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/task'
import TaskTable from '@/components/TaskTable.vue'
import QuickTaskForm from '@/components/QuickTaskForm.vue'
import { useUiStore } from '@/stores/ui'
import type { TaskStatus, TaskType } from '@/types'

const ui = useUiStore()
const { t: $t } = useI18n()

const taskStore = useTaskStore()
const showCreateDialog = ref(false)
const searchText = ref('')
const filterStatus = ref('')
const filterType = ref('')

const statusItems = computed(() => [
  { title: String($t('taskTable.statusNames.pending')), value: 'pending' as TaskStatus },
  { title: String($t('taskTable.statusNames.running')), value: 'running' as TaskStatus },
  { title: String($t('taskTable.statusNames.completed')), value: 'completed' as TaskStatus },
  { title: String($t('taskTable.statusNames.failed')), value: 'failed' as TaskStatus },
])

const typeItems = computed(() => [
  { title: String($t('taskTable.typeNames.icmp_ping')), value: 'icmp_ping' as TaskType },
  { title: String($t('taskTable.typeNames.tcp_ping')), value: 'tcp_ping' as TaskType },
  { title: String($t('taskTable.typeNames.traceroute')), value: 'traceroute' as TaskType },
])

function refreshTasks() {
  taskStore.fetchTasks()
  ui.notify(String($t('tasks.refreshSuccess')), 'success')
}

function handleTaskCreated() {
  showCreateDialog.value = false
  refreshTasks()
}

onMounted(() => {
  taskStore.fetchTasks(100)
})
</script>

<style scoped>
.tasks-page {
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
</style>
