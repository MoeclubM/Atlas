import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useUiStore } from '@/stores/ui'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

// 响应拦截器会把 AxiosResponse<T> unwrap 成 T，所以这里需要自定义返回类型。
interface RequestClient {
  <T = unknown>(config: AxiosRequestConfig): Promise<T>

  request<T = unknown>(config: AxiosRequestConfig): Promise<T>
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
}

const axiosInstance = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem('admin_token')
  } catch {
    return null
  }
}

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAdminToken()
    if (token) {
      const headers = (config.headers ??= new AxiosHeaders())
      headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  },
  (error: unknown) => {
    return Promise.reject(error)
  }
)

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error: unknown) => {
    const err = error as { response?: { data?: { error?: string } }; message?: string }
    const message = err.response?.data?.error || err.message || 'errors.requestFailed'

    try {
      // Pinia stores can be used outside components once Pinia is installed on the app.
      const ui = useUiStore()
      ui.notify(message, 'error')
    } catch {
      // ignore
    }

    return Promise.reject(error)
  }
)

const client = ((config: AxiosRequestConfig) => {
  return axiosInstance.request(config) as unknown as Promise<unknown>
}) as unknown as RequestClient

client.request = <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.request(config) as unknown as Promise<T>
}
client.get = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.get(url, config) as unknown as Promise<T>
}
client.post = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.post(url, data, config) as unknown as Promise<T>
}
client.put = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.put(url, data, config) as unknown as Promise<T>
}
client.delete = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.delete(url, config) as unknown as Promise<T>
}
client.patch = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.patch(url, data, config) as unknown as Promise<T>
}

export default client
