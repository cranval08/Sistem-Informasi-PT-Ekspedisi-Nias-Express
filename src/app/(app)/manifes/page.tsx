import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SearchX, Warehouse } from "lucide-react";
import { FilterTautan, FormPencarian, kataKunciAman, nomorHalaman, Paginasi, paramTunggal } from "@/components/app/daftar";
import { polaIlike } from "@/lib/domain/format";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatTanggalWaktu } from "@/lib/domain/format";
import { hitungKapasitas, jumlahGram, STATUS_MANIFES_AKTIF } from "@/lib/domain/manifes";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilKebijakanKapasitas } from "./data";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Daftar Manifes" };

const PATH = "/manifes";
const UKURAN = 20;

const FILTER_STATUS: Record<string, readonly string[]> = {
  aktif: STATUS_MANIFES_AKTIF,
  tiba: ["tiba"],
  dibatalkan: ["dibatalkan"],
};

export default async function HalamanManifes(props: PageProps<"/manifes">) {
  await wajibAksesRute("manifes");
  const sp = await props.searchParams;
  const q = paramTunggal(sp.q);
  const status = paramTunggal(sp.status);
  const halaman = nomorHalaman(sp.hal);
  // Bawaan: perjalanan aktif. "semua" menampilkan seluruh status.
  const filter = status === "semua" ? null : (FILTER_STATUS[status ?? "aktif"] ?? FILTER_STATUS.aktif);

  const supabase = await buatKlienServer();
  const [{ zonaWaktu }, { ambang }] = await Promise.all([ambilPengaturan(), ambilKebijakanKapasitas()]);

  let kueri = supabase
    .from("manifes")
    .select(
      `id_manifes, rute, status_manifes, waktu_dibuat, waktu_berangkat, waktu_tiba, override_kapasitas,
       armada:data_armada!manifes_id_armada_fkey(plat_nomor, kapasitas_ton),
       supir:data_pengguna!manifes_id_supir_fkey(nama_lengkap),
       detail:manifes_detail!manifes_detail_id_manifes_fkey(aktif, transaksi:data_transaksi!manifes_detail_no_resi_fkey(total_berat_kg))`,
      { count: "exact" },
    )
    .order("waktu_dibuat", { ascending: false })
    .range((halaman - 1) * UKURAN, halaman * UKURAN - 1);
  if (filter) kueri = kueri.in("status_manifes", filter);

  // Cari rute atau plat nomor.
  const aman = kataKunciAman(q);
  if (aman) {
    const { data: armada } = await supabase.from("data_armada").select("id_armada").ilike("plat_nomor", polaIlike(aman)).limit(50);
    const ids = (armada ?? []).map((a) => a.id_armada);
    const f = [`rute.ilike."${polaIlike(aman)}"`];
    if (ids.length) f.push(`id_armada.in.(${ids.join(",")})`);
    kueri = kueri.or(f.join(","));
  }

  const { data, count, error } = await kueri;
  const param = { q, status };

  return (
    <>
      <PageHeader
        judul="Daftar Manifes"
        deskripsi="Perjalanan armada beserta muatan, kapasitas, dan statusnya."
        aksi={
          <Button asChild size="lg">
            <Link href="/manifes/baru">
              <Plus aria-hidden /> Buat Manifes
            </Link>
          </Button>
        }
      />

      <div className="space-y-3">
        <FormPencarian path={PATH} q={q} placeholder="Rute atau plat nomor…" pertahankan={{ status }} />
        <FilterTautan
          path={PATH}
          param={param}
          kunci="status"
          aktif={status}
          label="Filter status manifes"
          pilihan={[
            { nilai: undefined, label: "Aktif" },
            { nilai: "tiba", label: "Selesai (tiba)" },
            { nilai: "dibatalkan", label: "Dibatalkan" },
            { nilai: "semua", label: "Semua" },
          ]}
        />
      </div>

      {error ? (
        <EmptyState judul="Data manifes gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        q ? (
          <EmptyState ikon={SearchX} judul="Manifes tidak ditemukan" deskripsi="Ubah kata kunci atau filter, lalu cari lagi." />
        ) : (
          <EmptyState
            ikon={Warehouse}
            judul={status && status !== "semua" ? "Tidak ada manifes pada filter ini" : "Belum ada manifes aktif"}
            deskripsi="Buat manifes untuk memuat resi yang sudah lunas ke armada yang tersedia."
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Armada</TableHead>
                  <TableHead>Rute</TableHead>
                  <TableHead>Supir</TableHead>
                  <TableHead className="text-right">Resi</TableHead>
                  <TableHead className="min-w-52">Muatan / kapasitas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((m) => {
                  const armada = relasiTunggal(m.armada);
                  const aktif = (m.detail ?? []).filter((d) => d.aktif);
                  const muatan = jumlahGram(aktif.map((d) => relasiTunggal(d.transaksi)?.total_berat_kg ?? 0));
                  const kap = hitungKapasitas(muatan, armada?.kapasitas_ton ?? 0, ambang);
                  return (
                    <TableRow key={m.id_manifes}>
                      <TableCell>
                        <Link href={`${PATH}/${m.id_manifes}`} className="font-medium tracking-wide text-primary hover:underline">
                          {armada?.plat_nomor ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{m.rute}</TableCell>
                      <TableCell>{relasiTunggal(m.supir)?.nama_lengkap ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{aktif.length}</TableCell>
                      <TableCell>
                        <MeterKapasitas hasil={kap} ambang={ambang} ringkas />
                      </TableCell>
                      <TableCell>
                        <StatusBadge jenis="manifes" nilai={m.status_manifes} />
                        {m.override_kapasitas && <p className="mt-1 text-xs text-warning">Override kapasitas</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatTanggalWaktu(m.waktu_dibuat, zonaWaktu)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Paginasi path={PATH} param={param} halaman={halaman} ukuran={UKURAN} total={count ?? 0} />
        </div>
      )}
    </>
  );
}
