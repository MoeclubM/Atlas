import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/cn'

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-11 w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 p-1 dark:border-slate-800 dark:bg-slate-950/70',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-500 outline-none transition data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:bg-sky-500 dark:data-[state=active]:text-slate-950',
        className,
      )}
      {...props}
    />
  )
}

export const TabsContent = TabsPrimitive.Content
