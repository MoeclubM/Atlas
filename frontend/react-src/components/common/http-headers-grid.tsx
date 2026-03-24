import {
  getLatestHTTPRequestHeaderEntries,
  getLatestHTTPResponseHeaderEntries,
} from '@/lib/result'

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
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-400">{title}</div>
      {entries.length ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={`${title}-${entry.name}`}
              className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-800/70 dark:bg-slate-950/70"
            >
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {entry.name}
              </div>
              <div className="mt-1 break-all text-sm">{entry.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500 dark:text-slate-400">-</div>
      )}
    </div>
  )
}
