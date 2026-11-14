import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Route, Settings, Truck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ModulBelumTersedia } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { LABEL_PERAN } from "@/lib/domain/peran";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profil = await wajibAksesRute("dashboard");
  const pengaturan = await ambilPengaturan();

  return (
    <>
      <PageHeader
        judul={`Selamat datang, ${profil.namaLengkap}`}
        deskripsi={`Masuk sebagai ${LABEL_PERAN[profil.peran]} · ${formatTanggalWaktu(new Date(), pengaturan.zonaWaktu)}`}
        aksi={
          profil.peran === "admin_loket" ? (
            <Button asChild size="lg">
              <Link href="/transaksi/baru">Buat Transaksi Baru</Link>
            </Button>
          ) : undefined
        }
      />
      {profil.peran === "pemilik" && <PengaturanPerluDilengkapi />}
      {profil.peran === "supir" ? (
        <ArmadaSaya />
      ) : (
        <ModulBelumTersedia
          fase={6}
          deskripsi="Ringkasan KPI, grafik, dan peringatan kapasitas akan tersedia setelah modul transaksi, pembayaran, dan manifes selesai. Angka akan diambil langsung dari database."
        />
      )}
    </>
  );
}

/** Konfigurasi bisnis yang belum diisi pemilik (PRD §19: jangan mengarang nilai). */
async function PengaturanPerluDilengkapi() {
  const supabase = await buatKlienServer();
  const [{ data: s }, { count: jumlahItem }, { count: jumlahArmada }] = await Promise.all([
    supabase.from("pengaturan").select("ambang_peringatan_kapasitas_persen, alamat, telepon").maybeSingle(),
    supabase.from("data_item").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("data_armada").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const kurang: { label: string; href: string }[] = [];
  if (s?.ambang_peringatan_kapasitas_persen == null) kurang.push({ label: "Ambang peringatan kapasitas truk (%)", href: "/pengaturan" });
  if (!s?.alamat || !s?.telepon) kurang.push({ label: "Alamat dan telepon perusahaan untuk resi", href: "/pengaturan" });
  if (!jumlahItem) kurang.push({ label: "Master jenis barang dan tarif", href: "/master/item" });
  if (!jumlahArmada) kurang.push({ label: "Data armada beserta kapasitas masing-masing", href: "/armada" });

  if (kurang.length === 0) return null;
  return (
    <Card className="border-warning/30 bg-warning-subtle/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <Settings className="size-4" aria-hidden /> Data yang perlu dilengkapi Pemilik
        </CardTitle>
        <CardDescription className="text-foreground/80">
          Nilai berikut tidak diisi otomatis oleh sistem dan harus ditentukan oleh perusahaan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {kurang.map((k) => (
            <li key={k.label}>
              <Link href={k.href} className="underline-offset-4 hover:underline">
                {k.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Perjalanan aktif Supir (RPC definer, tanpa data finansial). */
async function PerjalananAktif() {
  const supabase = await buatKlienServer();
  const { data, error } = await supabase.rpc("perjalanan_saya");
  if (error) return <EmptyState ikon={Route} judul="Data perjalanan gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />;
  type Ringkas = { id_manifes: string; plat_nomor: string; rute: string; status_manifes: string; jumlah_resi: number; total_berat_kg: number };
  const aktif = ((data ?? []) as Ringkas[]).filter((p) => ["draft", "dimuat", "berangkat"].includes(p.status_manifes));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="size-4" aria-hidden /> Perjalanan aktif
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {aktif.length ? (
          aktif.map((p) => (
            <div key={p.id_manifes} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {p.plat_nomor} · {p.rute}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.jumlah_resi} resi · {formatAngka(p.total_berat_kg)} kg
                </p>
              </div>
              <StatusBadge jenis="manifes" nilai={p.status_manifes} />
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">Tidak ada perjalanan aktif saat ini.</p>
        )}
        <Button asChild variant={aktif.length ? "default" : "outline"}>
          <Link href="/perjalanan">Buka Perjalanan Saya</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Supir: hanya armada yang ditugaskan kepadanya (dibatasi RLS). */
async function ArmadaSaya() {
  const supabase = await buatKlienServer();
  const { data: armada, error } = await supabase
    .from("data_armada")
    .select("id_armada, plat_nomor, jenis_unit, kapasitas_ton, status, waktu_status_diubah")
    .eq("is_active", true);

  if (error) {
    return <EmptyState ikon={Truck} judul="Data armada gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />;
  }
  if (!armada?.length) {
    return (
      <EmptyState
        ikon={Truck}
        judul="Belum ada armada yang ditugaskan kepada Anda"
        deskripsi="Hubungi Staf Gudang atau Pemilik bila Anda seharusnya memiliki penugasan."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {armada.map((a) => (
          <Card key={a.id_armada}>
            <CardHeader>
              <CardDescription>Armada yang ditugaskan</CardDescription>
              <CardTitle className="text-2xl tracking-wide">{a.plat_nomor}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge jenis="armada" nilai={a.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Jenis unit</span>
                <span className="capitalize">{a.jenis_unit}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Kapasitas</span>
                <span>{formatAngka(a.kapasitas_ton)} ton</span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Status terakhir diubah {formatTanggalWaktu(a.waktu_status_diubah)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <PerjalananAktif />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ClipboardList className="size-3.5" aria-hidden /> Nominal pembayaran dan laporan kas tidak ditampilkan untuk peran
        Supir.
      </p>
    </div>
  );
}
