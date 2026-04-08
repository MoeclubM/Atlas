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
    <div className="overflow-x-auto rounded-sm border border-[var(--border)] bg-[var(--surface)]">
      <table className={cn('w-full border-collapse text-sm', minWidthClassName, className)}>
        {children}
      </table>
    </div>
  )
}

export function DenseTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--surface-2)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-2)]">
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
      className={cn('whitespace-nowrap px-3 py-2.5 font-semibold', getAlignClass(align), className)}
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
        'border-t border-[var(--border)] px-3 py-2.5 align-top',
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
        <div className="truncate font-semibold text-[var(--text)]">{location}</div>
        <div className="truncate text-xs text-[var(--text-2)]">{provider || '-'}</div>
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
      {secondary ? <div className="truncate text-xs text-[var(--text-2)]">{secondary}</div> : null}
    </div>
  )
}

export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
      {children}
    </div>
  )
}

function getAlignClass(align: 'left' | 'center' | 'right') {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}
