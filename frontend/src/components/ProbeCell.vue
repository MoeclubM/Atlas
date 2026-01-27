<template>
  <div class="probe-cell">
    <div class="probe-line-1">{{ location }}</div>
    <div v-if="providerLabel" class="probe-line-2">{{ providerLabel }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  location: string
  provider?: string
}>()

const { t: $t, te: $te } = useI18n()

const providerLabel = computed(() => {
  const raw = (props.provider || '').trim()
  if (!raw) return ''

  const key = `admin.provider.${raw}`
  if ($te(key)) return String($t(key))
  return raw
})
</script>

<style scoped>
.probe-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.probe-line-1 {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.probe-line-2 {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
