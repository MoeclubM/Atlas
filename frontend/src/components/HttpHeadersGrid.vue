<template>
  <div class="http-headers-grid">
    <div class="http-headers-card">
      <h4>{{ $t('results.requestHeaders') }}</h4>
      <div v-if="requestHeaders.length > 0" class="http-header-list">
        <div
          v-for="entry in requestHeaders"
          :key="`req-${keyPrefix}-${entry.name}`"
          class="http-header-item"
        >
          <span class="http-header-name">{{ entry.name }}</span>
          <span class="http-header-value">{{ entry.value }}</span>
        </div>
      </div>
      <div v-else class="http-header-empty">-</div>
    </div>

    <div class="http-headers-card">
      <h4>{{ $t('results.responseHeaders') }}</h4>
      <div v-if="responseHeaders.length > 0" class="http-header-list">
        <div
          v-for="entry in responseHeaders"
          :key="`resp-${keyPrefix}-${entry.name}`"
          class="http-header-item"
        >
          <span class="http-header-name">{{ entry.name }}</span>
          <span class="http-header-value">{{ entry.value }}</span>
        </div>
      </div>
      <div v-else class="http-header-empty">-</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getLatestHTTPRequestHeaderEntries, getLatestHTTPResponseHeaderEntries } from '@/utils/result'

const props = withDefaults(defineProps<{
  resultData?: unknown
  keyPrefix?: string
}>(), {
  resultData: undefined,
  keyPrefix: '',
})

const { t: $t } = useI18n()

const requestHeaders = computed(() => getLatestHTTPRequestHeaderEntries(props.resultData))
const responseHeaders = computed(() => getLatestHTTPResponseHeaderEntries(props.resultData))
</script>

<style scoped>
.http-headers-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.http-headers-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  padding: 12px;
}

.http-headers-card h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.http-header-list {
  display: grid;
  gap: 8px;
}

.http-header-item {
  display: grid;
  gap: 4px;
}

.http-header-name {
  font-size: 12px;
  color: var(--text);
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;
}

.http-header-value {
  font-size: 12px;
  color: var(--text-2);
  word-break: break-all;
}

.http-header-empty {
  color: var(--text-2);
  font-size: 13px;
}

@media (max-width: 900px) {
  .http-headers-grid {
    grid-template-columns: 1fr;
  }
}
</style>
