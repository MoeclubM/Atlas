<template>
  <v-dialog
    v-model="state.open"
    max-width="420"
    persistent
  >
    <v-card>
      <v-card-title v-if="state.title">{{ state.title }}</v-card-title>
      <v-card-text>{{ state.message }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" @click="onConfirm">{{ $t('common.confirm') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const { t: $t } = useI18n()
const ui = useUiStore()
const state = ui.confirmState

function onCancel() {
  ui.closeConfirm(false)
}

function onConfirm() {
  ui.closeConfirm(true)
}
</script>
