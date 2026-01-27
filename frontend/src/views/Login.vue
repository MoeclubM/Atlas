<template>
  <v-container class="login-page" fluid>
    <v-row class="fill-height" align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card class="login-card">
          <v-card-title class="text-h6 text-center">
            {{ $t('login.title') }}
          </v-card-title>

          <v-card-text>
            <v-alert v-if="error" type="error" class="mb-3">
              {{ error }}
            </v-alert>

            <v-form @submit.prevent="handleLogin">
              <v-text-field
                v-model="password"
                type="password"
                :label="$t('login.password')"
                :placeholder="$t('login.passwordPlaceholder')"
                autocomplete="current-password"
                @keyup.enter="handleLogin"
              />

              <v-btn
                type="submit"
                color="primary"
                block
              >
                {{ $t('login.login') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

const { t: $t } = useI18n()

const router = useRouter()
const ui = useUiStore()
const password = ref('')
const error = ref('')

async function handleLogin() {
  if (!password.value) {
    error.value = String($t('login.passwordRequired'))
    return
  }

  try {
    // 调用登录API
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    })

    const data = await response.json()

    if (data.success && data.token) {
      localStorage.setItem('admin_token', data.token)
      ui.notify(String($t('login.loginSuccess')), 'success')
      router.push('/admin')
    } else {
      error.value = data.error || String($t('login.wrongPassword'))
    }
  } catch (err) {
    error.value = String($t('login.loginFailed'))
  }
}
</script>

<style scoped>
.login-page {
  background: var(--bg);
}

.login-card {
  width: 100%;
}
</style>
