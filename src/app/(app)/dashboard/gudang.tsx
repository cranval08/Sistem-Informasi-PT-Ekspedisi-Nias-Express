import Link from "next/link";
import { AlertTriangle, PackageCheck, PackageOpen, Plus, Truck } from "lucide-react";
import { KpiCard } from "@/components/app/kpi-card";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { hitungKapasitas, jumlahGram, STATUS_MANIFES_AKTIF } from "@/lib/domain/manifes";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilKebijakanKapasitas } from "../manifes/data";
import { WaktuData } from "./waktu-data";

const BATAS = 200;

/** Dashboard Staf Gudang (PRD §7.4). Tanpa nominal pembayaran. */
export async function DashboardGudang({ zonaWaktu }: { zonaWaktu: string }) {
  const supabase = await buatKlienServer();
  const [kandidatQ, manifesQ, tibaQ, { ambang }] = await Promise.all([
    supabase
      .from("data_transaksi")
      .select(
        `no_resi, waktu_transaksi, total_berat_kg, status_bayar, override_belum_lunas,
         penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama),
         md:manifes_detail!manifes_detail_no_resi_fkey(aktif)`,
      )
      .eq("status_kirim", "diterima_loket")
      .eq("status_void", false)
      .order("waktu_transaksi")
      .limit(BATAS),
    supabase
      .from("manifes")
      .select(
        `id_manifes, rute, status_manifes, waktu_dibuat,
         armada:data_armada!manifes_id_armada_fkey(plat_nomor, kapasitas_ton),
         supir:data_pengguna!manifes_id_supir_fkey(nama_lengkap),
         detail:manifes_detail!manifes_detail_id_manifes_fkey(aktif, transaksi:data_transaksi!manifes_detail_no_resi_fkey(total_berat_kg))`,
      )
      .in("status_manifes", STATUS_MANIFES_AKTIF)
      .order("waktu_dibuat", { ascending: false }),
    supabase
      .from("data_transaksi")
      .select("no_resi, updated_at, total_berat_kg, penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama)", { count: "exact" })
      .eq("status_kirim", "tiba")
      .eq("status_void", false)
      .order("updated_at")
      .limit(10),
    ambilKebijakanKapasitas(),
  ]);
  const galat = kandidatQ.error ?? manifesQ.error ?? tibaQ.error;
  if (galat) throw new Error(`Dashboard gagal dimuat (${galat.code ?? "tanpa kode"}).`);

  // Siap dimuat = Diterima Loket, lunas atau ber-override resmi, belum di manifes aktif.
  const siap = (kandidatQ.data ?? []).filter(
    (t) => (t.status_bayar === "lunas" || t.override_belum_lunas) && !(t.md ?? []).some((m: { aktif: boolean }) => m.aktif),
  );
  const tertahan = (kandidatQ.data ?? []).filter((t) => t.status_bayar !== "lunas" && !t.override_belum_lunas).length;
  const manifes = (manifesQ.data ?? []).map((m) => {
    const a = relasiTunggal(m.armada);
    const berat = (m.detail ?? []).filter((d) => d.aktif).map((d) => relasiTunggal(d.transaksi)?.total_berat_kg ?? 0);
    return { m, a, jumlah: berat.length, hasil: hitungKapasitas(jumlahGram(berat), a?.kapasitas_ton ?? 0, ambang) };
  });
  const peringatan = manifes.filter((x) => ["peringatan", "penuh", "melebihi"].includes(x.hasil.tingkat));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WaktuData zonaWaktu={zonaWaktu} />
        <Button asChild size="lg">
          <Link href="/manifes/baru">
            <Plus aria-hidden /> Buat Manifes
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Siap dimuat" nilai={formatAngka(siap.length, 0)} keterangan={tertahan ? `${tertahan} resi tertahan: belum lunas` : undefined} ikon={PackageOpen} />
        <KpiCard label="Manifes aktif" nilai={formatAngka(manifes.length, 0)} ikon={Truck} />
        <KpiCard label="Tiba, belum diambil" nilai={formatAngka(tibaQ.count ?? 0, 0)} ikon={PackageCheck} />
      </div>

      {peringatan.length > 0 && (
        <Alert variant={peringatan.some((p) => p.hasil.tingkat === "melebihi") ? "destructive" : "default"}>
          <AlertTriangle aria-hidden />
          <AlertTitle>Peringatan kapasitas</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {peringatan.map(({ m, a, hasil }) => (
                <li key={m.id_manifes}>
                  <Link href={`/manifes/${m.id_manifes}`} className="font-medium underline-offset-4 hover:underline">
                    {a?.plat_nomor ?? "—"}
                  </Link>{" "}
                  {hasil.tingkat === "melebihi" ? "melebihi kapasitas — muat & berangkat diblokir" : hasil.tingkat === "penuh" ? "tepat penuh" : "melewati ambang peringatan"} ({hasil.persen}%)
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Manifes aktif & total muatan per truk</CardTitle>
          <CardDescription>Draf, dimuat, dan berangkat</CardDescription>
        </CardHeader>
        <CardContent>
          {!manifes.length ? (
            <EmptyState ikon={Truck} judul="Tidak ada manifes aktif" deskripsi="Buat manifes untuk armada yang berstatus Siaga." className="py-8" />
          ) : (
            <ul className="divide-y rounded-lg border">
              {manifes.map(({ m, a, jumlah, hasil }) => (
                <li key={m.id_manifes} className="grid gap-2 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/manifes/${m.id_manifes}`} className="font-medium text-primary hover:underline">
                        {a?.plat_nomor ?? "—"}
                      </Link>
                      <StatusBadge jenis="manifes" nilai={m.status_manifes} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.rute} · {relasiTunggal(m.supir)?.nama_lengkap ?? "—"} · {jumlah} resi
                    </p>
                  </div>
                  <MeterKapasitas hasil={hasil} ambang={ambang} ringkas />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Barang siap dimuat</CardTitle>
            <CardDescription>Terlama lebih dulu; tambahkan dari halaman detail manifes Draf</CardDescription>
          </CardHeader>
          <CardContent>
            {!siap.length ? (
              <EmptyState ikon={PackageOpen} judul="Tidak ada barang siap dimuat" className="py-8" />
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {siap.slice(0, 10).map((t) => (
                  <li key={t.no_resi} className="flex items-center justify-between gap-2 p-2.5">
                    <span className="min-w-0">
                      <Link href={`/transaksi/${t.no_resi}`} className="font-medium text-primary hover:underline">
                        {t.no_resi}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {relasiTunggal(t.penerima)?.nama ?? "—"} · {formatTanggalWaktu(t.waktu_transaksi, zonaWaktu)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatAngka(t.total_berat_kg)} kg</span>
                  </li>
                ))}
                {siap.length > 10 && <li className="p-2.5 text-xs text-muted-foreground">dan {siap.length - 10} resi lainnya.</li>}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Perlu diproses di loket tujuan</CardTitle>
              <CardDescription>Barang tiba yang belum diambil penerima (terlama lebih dulu)</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengambilan">Pengambilan</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!tibaQ.data?.length ? (
              <EmptyState ikon={PackageCheck} judul="Tidak ada barang menunggu diambil" className="py-8" />
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {tibaQ.data.map((t) => (
                  <li key={t.no_resi}>
                    <Link href={`/pengambilan?resi=${t.no_resi}`} className="flex items-center justify-between gap-2 p-2.5 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="font-medium text-primary">{t.no_resi}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {relasiTunggal(t.penerima)?.nama ?? "—"} · tiba {formatTanggalWaktu(t.updated_at, zonaWaktu)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{formatAngka(t.total_berat_kg)} kg</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
