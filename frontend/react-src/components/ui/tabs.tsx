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
        'inline-flex h-11 w-full flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950',
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
        'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-slate-600 outline-none transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:bg-slate-100 dark:data-[state=active]:text-slate-950',
        className,
      )}
      {...props}
    />
  )
}

export const TabsContent = TabsPrimitive.Content
