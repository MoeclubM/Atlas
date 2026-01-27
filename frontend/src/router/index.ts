import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { i18n } from '@/i18n'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/test',
  },
  {
    path: '/test',
    name: 'Test',
    component: () => import('@/views/Home.vue'),
    meta: { title: 'route.continuousTest' },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/Admin.vue'),
    meta: { title: 'route.admin' },
  },
  {
    path: '/results/single/:id',
    name: 'SingleResult',
    component: () => import('@/views/SingleTestResult.vue'),
    meta: { title: 'route.singleResult' },
  },
  {
    path: '/results/continuous/:id',
    name: 'ContinuousResult',
    component: () => import('@/views/ContinuousTestResult.vue'),
    meta: { title: 'route.continuousResult' },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: 'route.login' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  // title 支持传 i18n key（例如 route.singleTest）
  const metaTitle = (to.meta.title as string | undefined) || 'Atlas'
  const title = metaTitle.includes('.') ? String((i18n.global as any).t(metaTitle)) : metaTitle
  document.title = `${title} - Atlas`

  next()
})

export default router
