import type { Metadata } from "next";
import { Route, TriangleAlert } from "lucide-react";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { hitungKapasitas, keGram, STATUS_MANIFES_AKTIF } from "@/lib/domain/manifes";
import { buatKlienServer } from "@/lib/supabase/server";
import { TombolBerangkat, TombolLaporKendala, TombolTiba } from "../manifes/aksi-manifes";
import { ambilKebijakanKapasitas } from "../manifes/data";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Perjalanan Saya" };

type Perjalanan = {
  id_manifes: string;
  plat_nomor: string;
  jenis_unit: string;
  kapasitas_ton: number;
  rute: string;
  status_manifes: string;
  waktu_dibuat: string;
  waktu_dimuat: string | null;
  waktu_berangkat: string | null;
  waktu_tiba: string | null;
  catatan: string | null;
  jumlah_resi: number;
  total_berat_kg: number;
  kendala_terbuka: number;
};

type Muatan = { no_resi: string; status_kirim: string; total_berat_kg: number; jumlah_baris: number; jumlah_koli: number };

/**
 * Halaman Supir (PRD §7.5). Data hanya dari RPC definer perjalanan_saya &
 * muatan_perjalanan — tanpa nominal, data pelanggan, atau laporan kas.
 */
export default async function HalamanPerjalanan() {
  await wajibAksesRute("perjalanan");
  const supabase = await buatKlienServer();
  const [{ zonaWaktu }, { ambang }, { data, error }] = await Promise.all([
    ambilPengaturan(),
    ambilKebijakanKapasitas(),
    supabase.rpc("perjalanan_saya"),
  ]);
  if (error) throw new Error(`Perjalanan gagal dimuat (${error.code ?? "tanpa kode"}).`);

  const semua = (data ?? []) as Perjalanan[];
  const aktif = semua.filter((p) => (STATUS_MANIFES_AKTIF as readonly string[]).includes(p.status_manifes));
  const riwayat = semua.filter((p) => p.status_manifes === "tiba");
  const muatan = await Promise.all(
    aktif.map(async (p) => {
      const { data: m, error: e } = await supabase.rpc("muatan_perjalanan", { p_id_manifes: p.id_manifes });
      if (e) throw new Error(`Muatan gagal dimuat (${e.code ?? "tanpa kode"}).`);
      return (m ?? []) as Muatan[];
    }),
  );

  return (
    <>
      <PageHeader judul="Perjalanan Saya" deskripsi="Penugasan armada, rute, muatan, dan pembaruan status perjalanan Anda." />

      {!aktif.length ? (
        <EmptyState
          ikon={Route}
          judul="Tidak ada perjalanan aktif"
          deskripsi="Manifes yang ditugaskan kepada Anda oleh Staf Gudang akan muncul di sini."
        />
      ) : (
        aktif.map((p, i) => (
          <Card key={p.id_manifes}>
            <CardHeader>
              <CardDescription>
                Armada {p.jenis_unit} · {formatAngka(p.kapasitas_ton)} ton
              </CardDescription>
              <CardTitle className="text-2xl tracking-wide">{p.plat_nomor}</CardTitle>
              <p className="text-sm">{p.rute}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge jenis="manifes" nilai={p.status_manifes} />
                {p.kendala_terbuka > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm text-danger">
                    <TriangleAlert className="size-4" aria-hidden /> {p.kendala_terbuka} kendala terbuka
                  </span>
                )}
              </div>
              <MeterKapasitas hasil={hitungKapasitas(keGram(p.total_berat_kg), p.kapasitas_ton, ambang)} ambang={ambang} />

              <div className="flex flex-wrap gap-2">
                {p.status_manifes === "dimuat" && <TombolBerangkat idManifes={p.id_manifes} plat={p.plat_nomor} />}
                {p.status_manifes === "berangkat" && <TombolTiba idManifes={p.id_manifes} />}
                <TombolLaporKendala idManifes={p.id_manifes} ukuran="lg" />
              </div>
              {p.status_manifes === "draft" && (
                <p className="text-sm text-muted-foreground">Menunggu Staf Gudang menyelesaikan pemuatan dan mengonfirmasi muat.</p>
              )}

              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Waktu label="Dibuat" nilai={p.waktu_dibuat} zona={zonaWaktu} />
                <Waktu label="Dimuat" nilai={p.waktu_dimuat} zona={zonaWaktu} />
                <Waktu label="Berangkat" nilai={p.waktu_berangkat} zona={zonaWaktu} />
                <Waktu label="Tiba" nilai={p.waktu_tiba} zona={zonaWaktu} />
              </dl>
              {p.catatan && <p className="text-sm whitespace-pre-line">{p.catatan}</p>}

              <div>
                <h3 className="mb-2 text-sm font-medium">Ringkasan muatan ({p.jumlah_resi} resi)</h3>
                {muatan[i].length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Resi</TableHead>
                          <TableHead className="text-right">Berat</TableHead>
                          <TableHead className="text-right">Barang</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {muatan[i].map((r) => (
                          <TableRow key={r.no_resi}>
                            <TableCell className="font-medium">{r.no_resi}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatAngka(r.total_berat_kg)} kg</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.jumlah_baris} jenis{Number(r.jumlah_koli) > 0 ? ` · ${formatAngka(r.jumlah_koli)} koli` : ""}
                            </TableCell>
                            <TableCell>
                              <StatusBadge jenis="kirim" nilai={r.status_kirim} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada resi dalam manifes ini.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {riwayat.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Perjalanan selesai terakhir</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {riwayat.map((p) => (
              <li key={p.id_manifes} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium">
                    {p.plat_nomor} · {p.rute}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tiba {formatTanggalWaktu(p.waktu_tiba, zonaWaktu)} · {p.jumlah_resi} resi · {formatAngka(p.total_berat_kg)} kg
                  </p>
                </div>
                <StatusBadge jenis="manifes" nilai={p.status_manifes} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Status diperbarui oleh petugas yang berwenang; aplikasi ini tidak memakai GPS. Nominal pembayaran dan data pelanggan tidak ditampilkan
        untuk peran Supir.
      </p>
    </>
  );
}

function Waktu({ label, nilai, zona }: { label: string; nilai: string | null; zona: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatTanggalWaktu(nilai, zona)}</dd>
    </div>
  );
}
