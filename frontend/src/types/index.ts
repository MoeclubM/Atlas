// 任务类型
export type TaskType = 'icmp_ping' | 'tcp_ping' | 'http_test' | 'mtr' | 'traceroute' | 'bird_route'

// 任务模式
export type TaskMode = 'single' | 'continuous'

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

// 探针状态
export type ProbeStatus = 'online' | 'offline'

// 测试参数
export interface TaskParameters {
  count?: number
  interval?: number
  timeout?: number
  port?: number
  size?: number
  ip_version?: 'auto' | 'ipv4' | 'ipv6'
}

// 任务信息
export interface Task {
  task_id: string
  task_type: TaskType
  mode: TaskMode
  target: string
  parameters: TaskParameters
  assigned_probes: string[]
  priority: number
  status: TaskStatus
  created_at: string
  updated_at: string
  ip_version?: 'auto' | 'ipv4' | 'ipv6'
}

// 探针信息
export interface Probe {
  probe_id: string
  name: string
  location: string
  region: string
  latitude?: number
  longitude?: number
  status: ProbeStatus
  ip_address?: string
  version?: string
  last_heartbeat?: string
}

// 执行记录
export interface Execution {
  execution_id: string
  task_id: string
  probe_id: string
  status: TaskStatus
  started_at: string
  completed_at?: string
  result?: unknown
  error?: string
}

// 测试结果
export interface TestResult {
  execution_id: string
  probe_id: string
  task_id: string
  test_type: TaskType
  target: string
  result_data: unknown
  summary: unknown
  status: string
  created_at: string
}

// API响应
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// 任务列表响应
export interface TasksResponse {
  tasks: Task[]
  total: number
  page: number
  page_size: number
}

// 探针列表响应
export interface ProbesResponse {
  probes: Probe[]
  total: number
}

// 执行记录响应
export interface ExecutionsResponse {
  executions: Execution[]
  total: number
}

// 结果列表响应
export interface ResultsResponse {
  results: TestResult[]
  total: number
}
