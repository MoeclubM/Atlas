import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task, TaskStatus } from '@/types'
import { taskApi } from '@/api'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const currentTask = ref<Task | null>(null)

  const pendingTasks = computed(() => tasks.value.filter((t) => t.status === 'pending'))
  const runningTasks = computed(() => tasks.value.filter((t) => t.status === 'running'))
  const completedTasks = computed(() => tasks.value.filter((t) => t.status === 'completed'))

  async function fetchTasks(limit = 50) {
    loading.value = true
    try {
      const response = await taskApi.list({ limit })
      tasks.value = response.tasks || []
    } finally {
      loading.value = false
    }
  }

  async function createTask(data: Partial<Task>) {
    const response = await taskApi.create(data)
    await fetchTasks()
    return response
  }

  async function fetchTask(id: string) {
    currentTask.value = await taskApi.get(id)
    return currentTask.value
  }

  async function cancelTask(id: string) {
    await taskApi.cancel(id)
    await fetchTasks()
  }

  function updateTaskStatus(taskId: string, status: TaskStatus) {
    const task = tasks.value.find((t) => t.task_id === taskId)
    if (task) {
      task.status = status
      task.updated_at = new Date().toISOString()
    }
  }

  function getTaskById(id: string): Task | undefined {
    return tasks.value.find((t) => t.task_id === id)
  }

  function getTasksByType(type: string): Task[] {
    return tasks.value.filter((t) => t.task_type === type)
  }

  return {
    tasks,
    loading,
    currentTask,
    pendingTasks,
    runningTasks,
    completedTasks,
    fetchTasks,
    createTask,
    fetchTask,
    cancelTask,
    updateTaskStatus,
    getTaskById,
    getTasksByType,
  }
})
