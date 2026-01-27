<template>
  <v-app>
    <TopBar />
    <router-view />
    <UiSnackbar />
    <UiConfirmDialog />
  </v-app>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import TopBar from '@/components/TopBar.vue'
import UiSnackbar from '@/components/UiSnackbar.vue'
import UiConfirmDialog from '@/components/UiConfirmDialog.vue'
import { setDayjsLocale } from '@/utils/dayjs-locale'

type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'atlas_theme'

const route = useRoute()
const { locale, t: $t } = useI18n()
const theme = useTheme()

function syncTitle() {
  const metaTitle = (route.meta.title as string | undefined) || 'Atlas'
  const title = metaTitle.includes('.') ? String($t(metaTitle)) : metaTitle
  document.title = `${title} - Atlas`
}

function detectPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.dataset.theme = mode

  // 同步 Vuetify 主题
  theme.global.name.value = mode

  try {
    window.localStorage.setItem(THEME_KEY, mode)
  } catch {
    // ignore
  }
}

watch(
  () => locale.value,
  (next) => {
    setDayjsLocale(next as 'zh-CN' | 'en-US')
    syncTitle()
  },
  { immediate: true }
)

watch(
  () => route.fullPath,
  () => {
    syncTitle()
  }
)

onMounted(() => {
  let saved: ThemeMode | null = null
  try {
    const raw = window.localStorage.getItem(THEME_KEY)
    if (raw === 'light' || raw === 'dark') saved = raw
  } catch {
    // ignore
  }

  applyTheme(saved ?? detectPreferredTheme())
})
</script>

<style>
:root {
  --bg: #f7f7f7;
  --surface: #ffffff;
  --surface-2: #f0f0f0;
  --text: #0f0f10;
  --text-2: rgba(15, 15, 16, 0.7);
  --border: rgba(15, 15, 16, 0.14);
  --shadow: rgba(0, 0, 0, 0.08);

  --accent: #2563eb;
  --good: #16a34a;
  --warn: #d97706;
  --bad: #dc2626;
}

html.dark {
  --bg: #0b0d10;
  --surface: #0f1318;
  --surface-2: #121821;
  --text: #f3f4f6;
  --text-2: rgba(243, 244, 246, 0.68);
  --border: rgba(243, 244, 246, 0.16);
  --shadow: rgba(0, 0, 0, 0.45);

  --accent: #60a5fa;
  --good: #22c55e;
  --warn: #f59e0b;
  --bad: #f87171;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif;
  background: var(--bg);
  color: var(--text);
}

a {
  color: inherit;
  text-decoration: none;
}
</style>
