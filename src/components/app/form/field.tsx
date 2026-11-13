// Tanpa "use client": dipakai dari komponen server maupun klien.
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + input + pesan bantuan/galat dengan atribut aksesibilitas. */
export function Field({
  id,
  label,
  galat,
  bantuan,
  wajib,
  className,
  children,
}: {
  id: string;
  label: string;
  galat?: string;
  bantuan?: ReactNode;
  wajib?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {wajib && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {galat ? (
        <p id={`${id}-galat`} className="text-sm text-danger">
          {galat}
        </p>
      ) : bantuan ? (
        <p id={`${id}-bantuan`} className="text-xs text-muted-foreground">
          {bantuan}
        </p>
      ) : null}
    </div>
  );
}

/** Atribut aria untuk input yang terhubung ke <Field>. */
export function ariaField(id: string, galat?: string, adaBantuan?: boolean) {
  return {
    id,
    "aria-invalid": galat ? true : undefined,
    "aria-describedby": galat ? `${id}-galat` : adaBantuan ? `${id}-bantuan` : undefined,
  } as const;
}

/** Checkbox native bergaya konsisten (nilai "on" bila dicentang). */
export function KotakCentang({
  id,
  name,
  label,
  keterangan,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  keterangan?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {keterangan && <span className="block text-xs text-muted-foreground">{keterangan}</span>}
      </span>
    </label>
  );
}

/** Textarea bergaya sama dengan <Input>. */
export function AreaTeks(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        props.className,
      )}
    />
  );
}
