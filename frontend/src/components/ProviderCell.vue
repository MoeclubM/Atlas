<template>
  <div class="provider-cell">
    <div class="provider-line-1">
      {{ targetAsn || '-' }}
    </div>
    <div class="provider-line-2">
      {{ line2 || '-' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  targetAsn?: string
  targetAsName?: string
  targetIsp?: string
}>()

const line2 = computed(() => {
  return [props.targetAsName, props.targetIsp].filter(Boolean).join(' / ')
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
