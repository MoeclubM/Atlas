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
    <div className="rounded-sm border border-stone-300 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900">
      <div className="mb-3 text-xs uppercase tracking-[0.08em] text-stone-400">{title}</div>
      {entries.length ? (
        <div className="space-y-2">
          {entries.map(entry => (
            <div
              key={`${title}-${entry.name}`}
              className="rounded-sm border border-stone-300 bg-[var(--surface)] px-3 py-2 dark:border-stone-700 dark:bg-[var(--surface)]"
            >
              <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                {entry.name}
              </div>
              <div className="mt-1 break-all text-sm">{entry.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-stone-500 dark:text-stone-400">-</div>
      )}
    </div>
  )
}
