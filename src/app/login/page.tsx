import type { Metadata } from "next";
import { Info, Truck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Masuk" };

// Bergantung pada searchParams; dirender per request.
export const instant = false;

const PESAN_ALASAN: Record<string, string> = {
  keluar: "Anda telah keluar dari aplikasi.",
  nonaktif: "Sesi diakhiri karena akun tidak aktif atau belum terdaftar. Hubungi Pemilik.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const alasan = typeof sp.alasan === "string" ? PESAN_ALASAN[sp.alasan] : undefined;
  const lanjut = typeof sp.lanjut === "string" ? sp.lanjut : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-card p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="size-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold">Nias Express</h1>
            <p className="text-sm text-muted-foreground">Sistem Operasional</p>
          </div>
        </div>

        {alasan && (
          <Alert>
            <Info aria-hidden />
            <AlertDescription>{alasan}</AlertDescription>
          </Alert>
        )}

        <FormLogin lanjut={lanjut} />

        <p className="text-center text-xs text-muted-foreground">
          Akun dibuat oleh Pemilik. Lupa password? Hubungi Pemilik untuk mengatur ulang.
        </p>
      </div>
    </main>
  );
}
