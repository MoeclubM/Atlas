import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getAdminToken } from '@/lib/storage'
import { useAppStore } from '@/state/app-store'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export interface RequestClient {
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

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAdminToken()
    if (token) {
      const headers = (config.headers ??= new AxiosHeaders())
      headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  },
  (error: unknown) => Promise.reject(error),
)

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error: unknown) => {
    const err = error as { response?: { data?: { error?: string } }; message?: string }
    const message = err.response?.data?.error || err.message || 'errors.requestFailed'
    useAppStore.getState().notify(message, 'error')
    return Promise.reject(error)
  },
)

const client = ((config: AxiosRequestConfig) => {
  return axiosInstance.request(config) as Promise<unknown>
}) as RequestClient

client.request = <T = unknown>(config: AxiosRequestConfig): Promise<T> =>
  axiosInstance.request(config) as Promise<T>
client.get = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  axiosInstance.get(url, config) as Promise<T>
client.post = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  axiosInstance.post(url, data, config) as Promise<T>
client.put = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  axiosInstance.put(url, data, config) as Promise<T>
client.delete = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  axiosInstance.delete(url, config) as Promise<T>
client.patch = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  axiosInstance.patch(url, data, config) as Promise<T>

export default client
