<template>
  <v-snackbar
    v-model="state.open"
    :color="color"
    location="top"
    timeout="2500"
    @update:model-value="(v) => (!v ? closeNotify() : undefined)"
  >
    {{ displayMessage }}
  </v-snackbar>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const state = ui.notifyState

const { t: $t, te: $te } = useI18n()

const displayMessage = computed(() => {
  const msg = state.message
  if (msg && $te(msg)) return String($t(msg))
  return msg
})

const color = computed(() => {
  const type = state.type
  if (type === 'success') return 'success'
  if (type === 'error') return 'error'
  if (type === 'warning') return 'warning'
  return 'info'
})

function closeNotify() {
  ui.closeNotify()
}
</script>
