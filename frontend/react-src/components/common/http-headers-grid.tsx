import { getLatestHTTPRequestHeaderEntries, getLatestHTTPResponseHeaderEntries } from '@/lib/result'

export function HttpHeadersGrid({ resultData }: { resultData: unknown }) {
  const requestHeaders = getLatestHTTPRequestHeaderEntries(resultData)
  const responseHeaders = getLatestHTTPResponseHeaderEntries(resultData)

  if (!requestHeaders.length && !responseHeaders.length) {
    return null
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HeaderCard title="Request Headers" entries={requestHeaders} />
      <HeaderCard title="Response Headers" entries={responseHeaders} />
    </div>
  )
}

function HeaderCard({
  title,
  entries,
}: {
  title: string
  entries: Array<{ name: string; value: string }>
}) {
  return (
    <div className="rounded-sm border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--text-3)]">{title}</div>
      {entries.length ? (
        <div className="space-y-2">
          {entries.map(entry => (
            <div
              key={`${title}-${entry.name}`}
              className="rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            >
              <div className="text-xs font-semibold text-[var(--text-2)]">
                {entry.name}
              </div>
              <div className="mt-1 break-all text-sm">{entry.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[var(--text-2)]">-</div>
      )}
    </div>
  )
}
