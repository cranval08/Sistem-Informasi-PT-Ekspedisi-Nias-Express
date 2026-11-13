import { AppShell } from "@/components/app/shell/app-shell";
import { ambilPengaturan, wajibLogin } from "@/lib/auth/sesi";
// Area internal selalu bergantung pada sesi pengguna (cookie), sehingga
// dirender per request di server; tidak ada shell statis yang berguna.
export const instant = false;

/**
 * Layout area internal. Pemeriksaan di sini hanya untuk merender shell;
 * setiap page.tsx tetap memanggil wajibAksesRute() karena layout tidak
 * dirender ulang saat navigasi sisi klien.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profil, pengaturan] = await Promise.all([wajibLogin(), ambilPengaturan()]);
  return (
    <AppShell
      pengguna={{ namaLengkap: profil.namaLengkap, email: profil.email, peran: profil.peran }}
      namaPerusahaan={pengaturan.namaPerusahaan}
      modeDemo={pengaturan.modeDemo}
    >
      {children}
    </AppShell>
  );
}
