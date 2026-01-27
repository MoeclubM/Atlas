import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import { i18n, setLocale, getInitialLocale } from './i18n'
import { vuetify } from './plugins/vuetify'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(router)
app.use(vuetify)

// 预加载当前语言包，避免首屏出现 key 或空文案
void setLocale(getInitialLocale())

app.mount('#app')
