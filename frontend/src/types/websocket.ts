// WebSocket事件类型扩展
export type WebSocketEventType = 'open' | 'message' | 'error' | 'close'

export interface WebSocketEventMap {
  open: Event
  message: MessageEvent
  error: Event
  close: CloseEvent
}

// WebSocket消息类型（与服务端协议对应）
export interface WSMessage {
  type: string
  data: unknown
  timestamp?: string
}

// 探针注册消息
export interface ProbeRegisterMessage extends WSMessage {
  type: 'probe_register'
  data: {
    probe_id: string
    name: string
    location: string
    region: string
    version: string
  }
}

// 任务分发消息
export interface TaskDispatchMessage extends WSMessage {
  type: 'task_dispatch'
  data: {
    execution_id: string
    task: {
      task_id: string
      task_type: string
      target: string
      parameters: unknown
    }
  }
}

// 结果上报消息
export interface ResultReportMessage extends WSMessage {
  type: 'result_report'
  data: {
    execution_id: string
    probe_id: string
    result: unknown
  }
}

// 探针心跳消息
export interface ProbeHeartbeatMessage extends WSMessage {
  type: 'probe_heartbeat'
  data: {
    probe_id: string
  }
}

// 任务状态更新消息
export interface TaskStatusMessage extends WSMessage {
  type: 'task_status'
  data: {
    task_id: string
    status: string
  }
}
