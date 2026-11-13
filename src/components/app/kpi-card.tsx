import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  nilai,
  keterangan,
  ikon: Ikon,
  className,
}: {
  label: string;
  nilai: string;
  keterangan?: string;
  ikon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{nilai}</p>
          {keterangan && <p className="text-xs text-muted-foreground">{keterangan}</p>}
        </div>
        {Ikon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Ikon className="size-4.5" aria-hidden />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
