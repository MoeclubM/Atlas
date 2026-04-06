import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_TOKEN_KEY,
  getAdminToken,
  getInitialLocale,
  getInitialTheme,
  LOCALE_KEY,
  normalizeLocale,
  readStorage,
  removeStorage,
  THEME_KEY,
  writeStorage,
} from '@/lib/storage'
import { clearAdminToken, isAuthenticated, persistAdminToken } from '@/lib/auth'
import { getFiniteCoordinate, hasValidCoordinates } from '@/lib/coordinate'
import { parseMaybeJSON } from '@/lib/parse'
import {
  buildAdminProbeRow,
  normalizeCapabilities,
  normalizeProbe,
  parseAssignedProbes,
  probeSupportsTaskType,
} from '@/lib/domain'
import {
  getProbeMetadataSummary,
  getProbeProviderLabel,
  getProbeSystemSupportSummary,
  normalizeProbeCoordinates,
} from '@/lib/probe'
import {
  formatLatencyMs,
  formatLossPercent,
  getLossTextClass,
  getResultStatusText,
  getResultStatusVariant,
} from '@/lib/result-presentation'
import { useAppStore } from '@/state/app-store'

describe('storage and auth', () => {
  it('reads, writes and removes storage values', () => {
    writeStorage('demo', 'value')
    expect(readStorage('demo')).toBe('value')
    removeStorage('demo')
    expect(readStorage('demo')).toBeNull()
  })

  it('normalizes locale and derives initial locale from storage or navigator', () => {
    expect(normalizeLocale('en')).toBe('en-US')
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('ja-JP')).toBe('zh-CN')

    writeStorage(LOCALE_KEY, 'en-US')
    expect(getInitialLocale()).toBe('en-US')

    removeStorage(LOCALE_KEY)
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    })
    expect(getInitialLocale()).toBe('en-US')
  })

  it('derives initial theme from storage or media query', () => {
    writeStorage(THEME_KEY, 'dark')
    expect(getInitialTheme()).toBe('dark')

    removeStorage(THEME_KEY)
    const matchMedia = vi.spyOn(window, 'matchMedia')
    matchMedia.mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
    expect(getInitialTheme()).toBe('dark')
  })

  it('persists and clears admin token', () => {
    expect(isAuthenticated()).toBe(false)
    persistAdminToken('token-1')
    expect(isAuthenticated()).toBe(true)
    expect(getAdminToken()).toBe('token-1')
    clearAdminToken()
    expect(readStorage(ADMIN_TOKEN_KEY)).toBeNull()
  })
})

describe('parse and coordinate helpers', () => {
  it('parses maybe-json values safely', () => {
    expect(parseMaybeJSON(null)).toEqual({})
    expect(parseMaybeJSON('{"a":1}')).toEqual({ a: 1 })
    expect(parseMaybeJSON('not-json')).toEqual({})
    expect(parseMaybeJSON({ b: 2 })).toEqual({ b: 2 })
  })

  it('normalizes coordinates and validates ranges', () => {
    expect(getFiniteCoordinate(1.2)).toBe(1.2)
    expect(getFiniteCoordinate('3.4')).toBe(3.4)
    expect(getFiniteCoordinate('x')).toBeNull()
    expect(hasValidCoordinates(10, 20)).toBe(true)
    expect(hasValidCoordinates(91, 20)).toBe(false)
    expect(hasValidCoordinates(10, undefined)).toBe(false)
  })
})

describe('probe and domain helpers', () => {
  it('extracts probe metadata summary and coordinates', () => {
    const summary = getProbeMetadataSummary(
      JSON.stringify({
        version: 'v1.0.0',
        provider: 'ISP-A',
        asn: 'AS64500',
        city: 'Tokyo',
        country: 'JP',
        latitude: '35.6',
        longitude: 139.7,
      })
    )

    expect(summary).toEqual({
      version: 'v1.0.0',
      providerLabel: 'ISP-A / AS64500',
      city: 'Tokyo',
      country: 'JP',
      latitude: 35.6,
      longitude: 139.7,
    })
    expect(getProbeProviderLabel({ isp: 'ISP-B', asn: 'AS64501' })).toBe('ISP-B / AS64501')

    expect(
      normalizeProbeCoordinates({
        probe_id: 'p1',
        latitude: null,
        longitude: undefined,
        metadata: { latitude: '1.1', longitude: '2.2' },
      })
    ).toMatchObject({ latitude: 1.1, longitude: 2.2 })

    expect(
      getProbeSystemSupportSummary(
        {
          reported: true,
          platform: 'linux/amd64',
          raw_icmp_ipv4: true,
          raw_icmp_ipv6: false,
          icmp_ping: true,
          tcp_ping: true,
          http_test: true,
          traceroute: true,
          mtr: true,
          bird_route: false,
          bird_route_reason: 'bird control socket not found',
        },
        null
      )
    ).toMatchObject({
      reported: true,
      platform: 'linux/amd64',
      rawICMPIPv4: true,
      rawICMPIPv6: false,
      birdRoute: false,
      birdRouteReason: 'bird control socket not found',
    })
  })

  it('normalizes probe capabilities and admin probe rows', () => {
    expect(normalizeCapabilities(['mtr', 1, 'icmp_ping'])).toEqual(['mtr', 'icmp_ping'])
    expect(normalizeCapabilities('["all","http_test"]')).toEqual(['all', 'http_test'])
    expect(normalizeCapabilities('oops')).toEqual([])

    const probe = normalizeProbe({
      probe_id: 'probe-1',
      latitude: undefined,
      longitude: undefined,
      capabilities: '["mtr"]',
      upgrade_supported: true,
      upgrade_reason: 'ok',
      deploy_mode: 'systemd',
      upgrade_channel: 'stable',
      system_support: {
        reported: true,
        platform: 'linux/amd64',
        raw_icmp_ipv4: true,
        raw_icmp_ipv6: true,
        icmp_ping: true,
        tcp_ping: true,
        http_test: true,
        traceroute: true,
        mtr: true,
        bird_route: true,
      },
      metadata: JSON.stringify({
        version: 'v2.0.0',
        provider: 'Cloud-A',
        latitude: '30',
        longitude: '120',
      }),
    })

    expect(probe.latitude).toBe(30)
    expect(probeSupportsTaskType(probe, 'mtr')).toBe(true)
    expect(probeSupportsTaskType(probe, 'icmp_ping')).toBe(false)

    const row = buildAdminProbeRow({
      ...probe,
      latest_upgrade: {
        upgrade_id: 'up-1',
        target_version: 'v2.0.1',
        status: 'accepted',
      },
    })

    expect(row).toMatchObject({
      version: 'v2.0.0',
      provider_label: 'Cloud-A',
      upgrade_supported: true,
      upgrade_reason: 'ok',
      deploy_mode: 'systemd',
      upgrade_channel: 'stable',
      system_support: {
        reported: true,
        platform: 'linux/amd64',
        rawICMPIPv4: true,
        rawICMPIPv6: true,
        icmpPing: true,
        tcpPing: true,
        httpTest: true,
        traceroute: true,
        mtr: true,
        birdRoute: true,
      },
    })
    expect(parseAssignedProbes('["p1","p2"]')).toEqual(['p1', 'p2'])
    expect(parseAssignedProbes('bad')).toEqual([])
  })
})

describe('result presentation and app store', () => {
  it('formats values and resolves status text / variant', () => {
    const t = (key: string) => key
    expect(formatLossPercent(1.234)).toBe('1.2%')
    expect(formatLossPercent()).toBe('-')
    expect(formatLatencyMs(12.34, t)).toBe('12.3 common.ms')
    expect(formatLatencyMs(undefined, t)).toBe('-')
    expect(getLossTextClass(0)).toContain('emerald')
    expect(getLossTextClass(4)).toContain('amber')
    expect(getLossTextClass(20)).toContain('rose')
    expect(getResultStatusVariant('running')).toBe('info')
    expect(getResultStatusVariant('failed')).toBe('danger')
    expect(getResultStatusText('success', t)).toBe('common.success')
    expect(getResultStatusText('pending', t)).toBe('common.pending')
    expect(getResultStatusText(undefined, t)).toBe('common.unknown')
  })

  it('updates zustand app store state and resolves confirms', async () => {
    useAppStore.getState().setTheme('dark')
    useAppStore.getState().setLocale('en-US')
    useAppStore.getState().notify('Saved', 'success')

    expect(useAppStore.getState().theme).toBe('dark')
    expect(useAppStore.getState().locale).toBe('en-US')
    expect(useAppStore.getState().toasts).toHaveLength(1)

    const decision = useAppStore.getState().confirmAction('Delete?', { title: 'Confirm' })
    expect(useAppStore.getState().confirm.open).toBe(true)
    useAppStore.getState().resolveConfirm(true)
    await expect(decision).resolves.toBe(true)

    const toastId = useAppStore.getState().toasts[0]?.id
    if (toastId) {
      useAppStore.getState().dismissToast(toastId)
    }
    expect(useAppStore.getState().toasts).toHaveLength(0)
  })
})
