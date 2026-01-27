import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Probe } from '@/types'
import { probeApi } from '@/api'

export const useProbeStore = defineStore('probe', () => {
  const probes = ref<Probe[]>([])
  const loading = ref(false)
  const lastUpdateTime = ref<Date | null>(null)

  const onlineProbes = computed(() => probes.value.filter((p) => p.status === 'online'))
  const offlineProbes = computed(() => probes.value.filter((p) => p.status === 'offline'))
  const onlineCount = computed(() => onlineProbes.value.length)

  async function fetchProbes() {
    loading.value = true
    try {
      const response = await probeApi.list()
      probes.value = response.probes || []
      lastUpdateTime.value = new Date()
    } finally {
      loading.value = false
    }
  }

  function getProbeById(id: string): Probe | undefined {
    return probes.value.find((p) => p.probe_id === id)
  }

  function getProbesByRegion(region: string): Probe[] {
    return probes.value.filter((p) => p.region === region)
  }

  function updateProbeStatus(probeId: string, status: 'online' | 'offline') {
    const probe = probes.value.find((p) => p.probe_id === probeId)
    if (probe) {
      probe.status = status
      probe.last_heartbeat = new Date().toISOString()
    }
  }

  return {
    probes,
    loading,
    lastUpdateTime,
    onlineProbes,
    offlineProbes,
    onlineCount,
    fetchProbes,
    getProbeById,
    getProbesByRegion,
    updateProbeStatus,
  }
})
