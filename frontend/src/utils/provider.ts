import { parseMaybeJSON } from '@/utils/parse'

// 说明：
// - provider 是有限枚举（aliyun/tencent/aws/...），由 UI 层通过 i18n 翻译（如 admin.provider.*）
// - isp/asn 为动态网络数据，保持原样，不做翻译
export function normalizeProviderLabel(raw: string): string {
  return raw.trim()
}

export function getProviderLabelFromMetadata(metadataValue: unknown): string {
  const metadata = parseMaybeJSON(metadataValue)

  const provider = (metadata['provider'] as string) || ''
  if (provider) return normalizeProviderLabel(provider)

  const isp = (metadata['isp'] as string) || ''
  if (isp) return isp

  const asn = (metadata['asn'] as string) || ''
  if (asn) return asn

  return ''
}
