<template>
  <v-layout class="main-layout">
    <v-app-bar height="60" color="primary" flat>
      <v-app-bar-title class="logo" @click="router.push('/')">
        <v-icon icon="mdi-map-marker" class="mr-2" />
        <span class="logo-text">Atlas</span>
      </v-app-bar-title>

      <v-spacer />

      <v-chip size="small" variant="tonal" :color="onlineCount > 0 ? 'success' : 'error'">
        <v-icon icon="mdi-connection" start />
        {{ $t('nav.onlineProbes') }}: {{ onlineCount }}
      </v-chip>
    </v-app-bar>

    <v-navigation-drawer width="220" color="#001529">
      <v-list nav density="compact">
        <v-list-item :title="$t('nav.dashboard')" prepend-icon="mdi-chart-box" to="/dashboard" />
        <v-list-item :title="$t('nav.tasks')" prepend-icon="mdi-format-list-bulleted" to="/tasks" />
        <v-list-item :title="$t('nav.probes')" prepend-icon="mdi-connection" to="/probes" />
        <v-list-item :title="$t('nav.results')" prepend-icon="mdi-chart-line" to="/results" />
      </v-list>
    </v-navigation-drawer>

    <v-main class="main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useProbeStore } from '@/stores/probe'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const router = useRouter()
const probeStore = useProbeStore()

const onlineCount = computed(() => probeStore.onlineCount)

let timer: number | undefined

onMounted(() => {
  probeStore.fetchProbes()
  // 每 30 秒刷新探针状态
  timer = window.setInterval(() => {
    probeStore.fetchProbes()
  }, 30000)
})

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

.logo {
  cursor: pointer;
  user-select: none;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
}

.main {
  background-color: #f0f2f5;
  padding: 20px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
