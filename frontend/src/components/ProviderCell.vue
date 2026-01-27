<template>
  <div class="provider-cell">
    <div class="provider-line-1">{{ target_asn || '-' }}</div>
    <div class="provider-line-2">
      {{ line2 || '-' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  target_asn?: string
  target_as_name?: string
  target_isp?: string
}>()

const line2 = computed(() => {
  return [props.target_as_name, props.target_isp].filter(Boolean).join(' / ')
})
</script>

<style scoped>
.provider-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.provider-line-1 {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.provider-line-2 {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
