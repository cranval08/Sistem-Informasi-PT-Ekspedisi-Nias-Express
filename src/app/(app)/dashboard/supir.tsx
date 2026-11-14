import Link from "next/link";
import { ClipboardList, Route, Truck } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";

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
export async function ArmadaSaya() {
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
