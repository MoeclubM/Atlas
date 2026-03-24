import { parseMaybeJSON } from '@/lib/parse'
import { getProbeMetadataSummary, normalizeProbeCoordinates } from '@/lib/probe'

export type DisplayTaskStatus =
  | 'idle'
  | 'scheduling'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ProbeRecord = {
  id?: number
  probe_id: string
  name?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  capabilities?: unknown
  metadata?: unknown
  status?: string
  ip_address?: string
  region?: string
  upgrade_supported?: boolean
  upgrade_reason?: string
  deploy_mode?: string
  upgrade_channel?: string
  latest_upgrade?: AdminProbeUpgrade | null
}

export type TaskInfo = {
  task_id?: string
  task_type?: string
  mode?: string
  target?: string
  status?: string
  schedule?: unknown
  assigned_probes?: string
  created_at?: string
}

export type TaskResult = {
  result_id?: string
  probe_id: string
  target?: string
  test_type?: string
  summary?: unknown
  result_data?: unknown
  status?: string
  created_at?: string
}

export type AdminProbeUpgrade = {
  upgrade_id: string
  target_version: string
  status: string
  error_message?: string | null
}

export type AdminProbeRow = ProbeRecord & {
  version?: string
  provider_label?: string
  upgrade_supported?: boolean
  upgrade_reason?: string
  deploy_mode?: string
  upgrade_channel?: string
}

export type AdminConfig = {
  shared_secret: string
  blocked_networks: string
  ping_max_runs: number
  tcp_ping_max_runs: number
  traceroute_timeout_seconds: number
  mtr_timeout_seconds: number
}

export function normalizeProbe(probe: ProbeRecord): ProbeRecord {
  return normalizeProbeCoordinates(probe)
}

export function normalizeCapabilities(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      return []
    }
  }

  return []
}

export function probeSupportsTaskType(probe: ProbeRecord, taskTypeValue: string): boolean {
  const capabilities = normalizeCapabilities(probe.capabilities)
  if (capabilities.length === 0) {
    return true
  }

  return capabilities.includes('all') || capabilities.includes(taskTypeValue)
}

export function buildAdminProbeRow(probe: ProbeRecord): AdminProbeRow {
  const metadata = getProbeMetadataSummary(probe.metadata)
  const rawMetadata = parseMaybeJSON(probe.metadata)
  const metadataUpgradeSupported =
    rawMetadata['upgrade_supported'] === true || rawMetadata['upgrade_supported'] === 'true'

  return {
    ...normalizeProbe(probe),
    version: metadata.version || '',
    provider_label: metadata.providerLabel || '',
    upgrade_supported:
      typeof probe.upgrade_supported === 'boolean'
        ? probe.upgrade_supported
        : metadataUpgradeSupported,
    upgrade_reason:
      typeof probe.upgrade_reason === 'string'
        ? probe.upgrade_reason
        : typeof rawMetadata['upgrade_reason'] === 'string'
          ? rawMetadata['upgrade_reason']
          : '',
    deploy_mode:
      typeof probe.deploy_mode === 'string'
        ? probe.deploy_mode
        : typeof rawMetadata['deploy_mode'] === 'string'
          ? rawMetadata['deploy_mode']
          : '',
    upgrade_channel:
      typeof probe.upgrade_channel === 'string'
        ? probe.upgrade_channel
        : typeof rawMetadata['upgrade_channel'] === 'string'
          ? rawMetadata['upgrade_channel']
          : '',
    latest_upgrade: probe.latest_upgrade || null,
  }
}

export function parseAssignedProbes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      return []
    }
  }

  return []
}
