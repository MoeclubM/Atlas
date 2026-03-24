import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type DenseTableProps = {
  children: ReactNode
  className?: string
  minWidthClassName?: string
}

type DenseHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'center' | 'right'
}

type DenseCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'center' | 'right'
  mono?: boolean
}

type ProbeSummaryCellProps = {
  location: string
  provider?: string
  badge?: ReactNode
}

type TargetNetworkCellProps = {
  isp?: string
  asn?: string
  asName?: string
}

export function DenseTable({
  children,
  className,
  minWidthClassName = 'min-w-[1100px]',
}: DenseTableProps) {
  return (
    <div className="overflow-x-auto rounded-sm border border-stone-300 bg-[var(--surface)] dark:border-stone-700 dark:bg-[var(--surface)]">
      <table className={cn('w-full border-collapse text-sm', minWidthClassName, className)}>
        {children}
      </table>
    </div>
  )
}

export function DenseTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-stone-100 text-[11px] uppercase tracking-[0.08em] text-stone-500 dark:bg-stone-900 dark:text-stone-400">
      {children}
    </thead>
  )
}

export function DenseHeaderCell({
  className,
  align = 'left',
  children,
  ...props
}: DenseHeaderCellProps) {
  return (
    <th
      className={cn('whitespace-nowrap px-4 py-3 font-semibold', getAlignClass(align), className)}
      {...props}
    >
      {children}
    </th>
  )
}

export function DenseCell({
  className,
  align = 'left',
  mono = false,
  children,
  ...props
}: DenseCellProps) {
  return (
    <td
      className={cn(
        'border-t border-stone-200 px-4 py-3 align-top dark:border-stone-700',
        getAlignClass(align),
        mono ? 'font-mono text-[13px]' : '',
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}

export function ProbeSummaryCell({ location, provider, badge }: ProbeSummaryCellProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-semibold text-stone-900 dark:text-stone-100">{location}</div>
        <div className="truncate text-xs text-stone-500 dark:text-stone-400">{provider || '-'}</div>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
  )
}

export function TargetNetworkCell({ isp, asn, asName }: TargetNetworkCellProps) {
  const secondary = [asn, asName].filter(Boolean).join(' ')

  return (
    <div className="min-w-0">
      <div className="truncate">{isp || '-'}</div>
      {secondary ? (
        <div className="truncate text-xs text-stone-500 dark:text-stone-400">{secondary}</div>
      ) : null}
    </div>
  )
}

export function DetailBlock({
  title,
  children,
  testId,
}: {
  title: string
  children: ReactNode
  testId?: string
}) {
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</div>
      {children}
    </div>
  )
}

function getAlignClass(align: 'left' | 'center' | 'right') {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}
