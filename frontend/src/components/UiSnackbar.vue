<template>
  <v-snackbar
    v-model="state.open"
    :color="color"
    location="top"
    timeout="2500"
    @update:model-value="(v) => (!v ? closeNotify() : undefined)"
  >
    {{ state.message }}
  </v-snackbar>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const state = ui.notifyState

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
