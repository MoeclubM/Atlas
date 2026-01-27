<template>
  <header class="topbar" v-if="showTopBar" data-testid="topbar">
    <div class="topbar-inner">
      <div class="brand" @click="router.push('/')">
        <span class="brand-text">Atlas</span>
      </div>

      <div class="actions">
        <!-- 主题切换按钮 -->
        <v-btn
          icon
          @click="toggleTheme"
          :title="isDark ? $t('home.themeLight') : $t('home.themeDark')"
          variant="text"
          size="small"
        >
          <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </v-btn>

        <!-- 语言选择器（按钮 + 菜单） -->
        <v-menu>
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              variant="text"
              size="small"
              class="locale-btn"
              :title="$t('common.locale.select')"
            >
              <v-icon>mdi-translate</v-icon>
              <span class="locale-label">{{ currentLocaleLabel }}</span>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </v-btn>
          </template>

          <v-list density="compact">
            <v-list-item
              v-for="it in localeItems"
              :key="it.value"
              @click="onChangeLocale(it.value)"
            >
              <v-list-item-title>{{ it.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'

import type { SupportedLocale } from '@/i18n'
import { setLocale as applyLocale, getInitialLocale } from '@/i18n'

const route = useRoute()
const router = useRouter()
const { t: $t, locale: i18nLocale } = useI18n()
const theme = useTheme()

const showTopBar = computed(() => route.path !== '/login')

const locale = ref<SupportedLocale>(getInitialLocale())
const isDark = computed(() => theme.global.name.value === 'dark')

const THEME_KEY = 'atlas_theme'

function toggleTheme() {
  const next = isDark.value ? 'light' : 'dark'
  theme.global.name.value = next

  // 同步 HTML class
  const root = document.documentElement
  root.classList.toggle('dark', next === 'dark')
  root.dataset.theme = next

  try {
    window.localStorage.setItem(THEME_KEY, next)
  } catch {
    // ignore
  }
}

const localeItems = computed(() => [
  { label: String($t('common.locale.zh')), value: 'zh-CN' as SupportedLocale },
  { label: String($t('common.locale.en')), value: 'en-US' as SupportedLocale },
])

const currentLocaleLabel = computed(() => {
  return localeItems.value.find((it) => it.value === locale.value)?.label || ''
})

watch(
  () => i18nLocale.value,
  (v) => {
    locale.value = v as SupportedLocale
  },
  { immediate: true }
)

async function onChangeLocale(next: SupportedLocale) {
  await applyLocale(next)
}
</script>

<style scoped>
.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.topbar-inner {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.brand-text {
  font-size: 18px;
  font-weight: 700;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.locale-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.locale-label {
  font-size: 13px;
  color: var(--text-2);
}

@media (max-width: 720px) {
  .locale-label {
    display: none;
  }

  .actions {
    gap: 8px;
  }
}
</style>
