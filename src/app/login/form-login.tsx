"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { masuk, type StatusLogin } from "@/lib/auth/aksi";

export function FormLogin({ lanjut }: { lanjut?: string }) {
  const [status, aksi, sedangProses] = useActionState<StatusLogin, FormData>(masuk, {});

  return (
    <form action={aksi} className="space-y-4" noValidate>
      {lanjut && <input type="hidden" name="lanjut" value={lanjut} />}

      {status.pesan && (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden />
          <AlertDescription>{status.pesan}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={status.email}
          aria-invalid={!!status.galat?.email}
          aria-describedby={status.galat?.email ? "email-galat" : undefined}
          required
        />
        {status.galat?.email && (
          <p id="email-galat" className="text-sm text-danger">
            {status.galat.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!status.galat?.password}
          aria-describedby={status.galat?.password ? "password-galat" : undefined}
          required
        />
        {status.galat?.password && (
          <p id="password-galat" className="text-sm text-danger">
            {status.galat.password}
          </p>
        )}
      </div>

      <Button type="submit" className="h-10 w-full" disabled={sedangProses}>
        {sedangProses ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Memproses…
          </>
        ) : (
          "Masuk"
        )}
      </Button>
    </form>
  );
}
