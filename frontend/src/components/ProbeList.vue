<template>
  <div class="probe-list">
    <v-skeleton-loader
      v-if="probeStore.loading"
      type="list-item-two-line"
    />

    <v-alert
      v-else-if="displayProbes.length === 0"
      type="info"
      variant="tonal"
      density="compact"
    >
      {{ $t('probeList.empty') }}
    </v-alert>

    <div v-else class="probe-items">
      <div v-for="probe in displayProbes" :key="probe.probe_id" class="probe-item">
        <div class="probe-header">
          <div class="probe-name">
            <div class="status-indicator online" />
            <span class="name-text">{{ probe.name }}</span>
          </div>

          <v-chip size="small" color="success" variant="tonal">
            {{ $t('probes.statusRunning') }}
          </v-chip>
        </div>

        <div class="probe-details">
          <div class="detail-item">
            <v-icon class="detail-icon" icon="mdi-map-marker-outline" />
            <div class="detail-content">
              <span class="detail-label">{{ $t('probes.location') }}</span>
              <span class="detail-value">{{ probe.location }}</span>
            </div>
          </div>

          <div class="detail-item">
            <v-icon class="detail-icon" icon="mdi-map-outline" />
            <div class="detail-content">
              <span class="detail-label">{{ $t('probes.region') }}</span>
              <span class="detail-value">{{ probe.region }}</span>
            </div>
          </div>

          <div class="detail-item">
            <v-icon class="detail-icon" icon="mdi-ip" />
            <div class="detail-content">
              <span class="detail-label">{{ $t('probes.ip') }}</span>
              <span class="detail-value ip-address">{{ probe.ip_address }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <v-btn
      v-if="props.limit && probeStore.onlineProbes.length > props.limit"
      variant="text"
      color="primary"
      block
      class="view-more-btn"
      @click="router.push('/probes')"
    >
      {{ $t('probeList.viewAll', { count: probeStore.onlineProbes.length }) }} →
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProbeStore } from '@/stores/probe'

const props = defineProps<{
  limit?: number
}>()

const router = useRouter()
const probeStore = useProbeStore()
const { t: $t } = useI18n()

const displayProbes = computed(() => {
  const probes = probeStore.onlineProbes
  if (props.limit) {
    return probes.slice(0, props.limit)
  }
  return probes
})
</script>

<style scoped>
.probe-list {
  min-height: 100px;
}

.probe-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.probe-item {
  padding: 16px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.probe-item:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}

.probe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.probe-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #dcdfe6;
}

.status-indicator.online {
  background-color: #67c23a;
  box-shadow: 0 0 6px #67c23a;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.name-text {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.probe-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-icon {
  font-size: 16px;
  color: #909399;
  flex-shrink: 0;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.detail-label {
  font-size: 11px;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ip-address {
  font-family: 'Consolas', 'Monaco', monospace;
}

.view-more-btn {
  margin-top: 12px;
  padding: 8px;
  font-weight: 500;
}
</style>
