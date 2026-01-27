export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000
  private isManualClose = false
  private listeners: Map<string, Set<(data?: unknown) => void>> = new Map()

  constructor(url: string) {
    this.url = url
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.isManualClose = false

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = (event) => {
        this.reconnectAttempts = 0
        this.emit('open', event)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.emit('message', data)
        } catch {
          this.emit('message', event.data)
        }
      }

      this.ws.onerror = (event) => {
        this.emit('error', event)
      }

      this.ws.onclose = (event) => {
        this.emit('close', event)

        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          this.reconnect()
        }
      }
    } catch (error) {
      this.emit('error', error)
    }
  }

  private reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)
  }

  send(data: string | object): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data)
    this.ws.send(message)
  }

  close(): void {
    this.isManualClose = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  on(event: string, callback: (data?: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: (data?: unknown) => void): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  private emit(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach((callback) => callback(data))
    }
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// 全局WebSocket客户端实例
let wsClient: WebSocketClient | null = null

export function useWebSocket() {
  const connect = (url?: string) => {
    const wsUrl = url || `ws://${window.location.host}/ws`
    if (!wsClient) {
      wsClient = new WebSocketClient(wsUrl)
    }
    wsClient.connect()
    return wsClient
  }

  const disconnect = () => {
    if (wsClient) {
      wsClient.close()
      wsClient = null
    }
  }

  const getClient = () => wsClient

  return {
    connect,
    disconnect,
    getClient,
  }
}
