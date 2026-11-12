import { cn } from '@/lib/utils';

/**
 * Title of the chart card (1112-A1): the symbol, and beside it the name of the formation shown on the chart.
 * The setup number is not in the title; with more than one setup the overview tab picks it.
 */
export function CardTitle({ title, form, className, testId }: { title: string; form?: string; className?: string; testId?: string }) {
  return (
    <strong className={cn('flex min-w-0 items-center gap-1.5 truncate', className)} data-testid={testId}>
      <span className="truncate">{title}</span>
      {form && (
        <>
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          <span className="truncate text-primary" data-testid="chart-card-form">{form}</span>
        </>
      )}
    </strong>
  );
}
