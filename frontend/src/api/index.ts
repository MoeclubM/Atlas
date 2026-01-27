import request from '@/utils/request'
import type {
  Task,
  Probe,
  Execution,
  TestResult,
  TasksResponse,
  ProbesResponse,
  ExecutionsResponse,
  ResultsResponse,
} from '@/types'

// 任务相关API
export const taskApi = {
  // 创建任务
  create(data: Partial<Task>) {
    return request<Task>({ url: '/tasks', method: 'POST', data })
  },

  // 获取任务列表
  list(params?: { limit?: number; offset?: number; status?: string }) {
    return request<TasksResponse>({ url: '/tasks', method: 'GET', params })
  },

  // 获取任务详情
  get(id: string) {
    return request<Task>({ url: `/tasks/${id}`, method: 'GET' })
  },

  // 取消任务
  cancel(id: string) {
    return request<void>({ url: `/tasks/${id}`, method: 'DELETE' })
  },
}

// 探针相关API
export const probeApi = {
  // 获取探针列表
  list() {
    return request<ProbesResponse>({ url: '/probes', method: 'GET' })
  },

  // 获取探针详情
  get(id: string) {
    return request<Probe>({ url: `/probes/${id}`, method: 'GET' })
  },
}

// 执行记录相关API
export const executionApi = {
  // 获取执行记录列表
  list(taskId?: string, probeId?: string) {
    return request<ExecutionsResponse>({
      url: '/executions',
      method: 'GET',
      params: { task_id: taskId, probe_id: probeId },
    })
  },

  // 获取执行记录详情
  get(id: string) {
    return request<Execution>({ url: `/executions/${id}`, method: 'GET' })
  },
}

// 结果相关API
export const resultApi = {
  // 获取结果列表
  list(params?: {
    task_id?: string
    probe_id?: string
    limit?: number
    offset?: number
  }) {
    return request<ResultsResponse>({ url: '/results', method: 'GET', params })
  },

  // 获取结果详情
  get(id: string) {
    return request<TestResult>({ url: `/results/${id}`, method: 'GET' })
  },
}

// 健康检查API
export const healthApi = {
  check() {
    return request<{ status: string; version: string }>({ url: '/health', method: 'GET' })
  },
}
