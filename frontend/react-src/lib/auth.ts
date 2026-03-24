import { ADMIN_TOKEN_KEY, getAdminToken, removeStorage, writeStorage } from '@/lib/storage'

export function isAuthenticated() {
  return Boolean(getAdminToken())
}

export function persistAdminToken(token: string) {
  writeStorage(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
  removeStorage(ADMIN_TOKEN_KEY)
}
