import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { md3 } from 'vuetify/blueprints'

// Icons: use MDI font (simpler than tree-shaking @mdi/js initially)
import '@mdi/font/css/materialdesignicons.css'

export const vuetify = createVuetify({
  blueprint: md3,
  defaults: {
    VBtn: {
      variant: 'flat',
      density: 'comfortable',
      rounded: 'md',
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'md',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'md',
    },
    VCard: {
      variant: 'outlined',
      rounded: 'lg',
    },
    VAlert: {
      variant: 'tonal',
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#2563eb',
          secondary: '#f0f0f0',
          surface: '#ffffff',
          background: '#f7f7f7',
          error: '#dc2626',
          success: '#16a34a',
          warning: '#d97706',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#60a5fa',
          secondary: '#121821',
          surface: '#0f1318',
          background: '#0b0d10',
          error: '#f87171',
          success: '#22c55e',
          warning: '#f59e0b',
        },
      },
    },
  },
})
