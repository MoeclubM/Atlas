import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

import type { SupportedLocale } from '@/i18n'

export function setDayjsLocale(locale: SupportedLocale) {
  if (locale === 'zh-CN') {
    dayjs.locale('zh-cn')
    return
  }
  dayjs.locale('en')
}
