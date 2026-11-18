import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus, SearchX } from "lucide-react";
import { FilterTautan, FormPencarian, kataKunciAman, nomorHalaman, Paginasi, paramTunggal } from "@/components/app/daftar";
import { polaIlike } from "@/lib/domain/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { BadgeNada, StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatRupiah, formatTanggalWaktu, normalisasiTelepon, tanggalOperasional } from "@/lib/domain/format";
import { STATUS_KIRIM } from "@/lib/domain/status";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Daftar Transaksi" };

const PATH = "/transaksi";
const UKURAN = 20;

export default async function HalamanTransaksi(props: PageProps<"/transaksi">) {
  const profil = await wajibAksesRute("transaksi");
  const bolehBuat = profil.peran === "pemilik" || profil.peran === "admin_loket";
  const sp = await props.searchParams;
  const q = paramTunggal(sp.q);
  const kirim = paramTunggal(sp.kirim);
  const bayar = paramTunggal(sp.bayar);
  const periode = paramTunggal(sp.periode);
  const tampilBatal = paramTunggal(sp.batal);
  const halaman = nomorHalaman(sp.hal);

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();

  let kueri = supabase
    .from("data_transaksi")
    .select(
      `no_resi, waktu_transaksi, status_kirim, status_bayar, total_berat_kg, total_biaya, total_dibayar, status_void,
       pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama), penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama)`,
      { count: "exact" },
    )
    .order("waktu_transaksi", { ascending: false })
    .range((halaman - 1) * UKURAN, halaman * UKURAN - 1);

  if (tampilBatal !== "ya") kueri = kueri.eq("status_void", false);
  if (kirim && kirim in STATUS_KIRIM) kueri = kueri.eq("status_kirim", kirim);
  if (bayar === "lunas" || bayar === "belum_lunas") kueri = kueri.eq("status_bayar", bayar);
  if (periode === "hari_ini") kueri = kueri.eq("tanggal_transaksi", tanggalOperasional(zonaWaktu));
  if (periode === "7_hari") kueri = kueri.gte("tanggal_transaksi", tanggalOperasional(zonaWaktu, -6));

  // Cari resi, atau nama/telepon pengirim maupun penerima.
  const aman = kataKunciAman(q);
  if (aman) {
    const digit = aman.replace(/\D/g, "");
    const filterPel = [`nama.ilike."${polaIlike(aman)}"`];
    if (digit.length >= 3) filterPel.push(`telepon.like."%${normalisasiTelepon(digit)}%"`);
    const { data: pel } = await supabase.from("data_pelanggan").select("id_pelanggan").or(filterPel.join(",")).limit(100);
    const ids = (pel ?? []).map((p) => p.id_pelanggan);
    const filter = [`no_resi.ilike."${polaIlike(aman)}"`];
    if (ids.length) filter.push(`id_pengirim.in.(${ids.join(",")})`, `id_penerima.in.(${ids.join(",")})`);
    kueri = kueri.or(filter.join(","));
  }

  const { data, count, error } = await kueri;
  const param = { q, kirim, bayar, periode, batal: tampilBatal };

  return (
    <>
      <PageHeader
        judul="Daftar Transaksi"
        deskripsi="Cari berdasarkan nomor resi, nama, atau telepon pengirim/penerima."
        aksi={
          bolehBuat ? (
            <Button asChild size="lg">
              <Link href="/transaksi/baru">
                <Plus aria-hidden /> Buat Transaksi
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <FormPencarian path={PATH} q={q} placeholder="Nomor resi, nama, atau telepon…" pertahankan={{ kirim, bayar, periode, batal: tampilBatal }} />
        <div className="flex flex-wrap gap-2">
          <FilterTautan
            path={PATH}
            param={param}
            kunci="periode"
            aktif={periode}
            label="Filter periode"
            pilihan={[
              { nilai: undefined, label: "Semua tanggal" },
              { nilai: "hari_ini", label: "Hari ini" },
              { nilai: "7_hari", label: "7 hari" },
            ]}
          />
          <FilterTautan
            path={PATH}
            param={param}
            kunci="bayar"
            aktif={bayar}
            label="Filter status pembayaran"
            pilihan={[
              { nilai: undefined, label: "Semua bayar" },
              { nilai: "belum_lunas", label: "Belum lunas" },
              { nilai: "lunas", label: "Lunas" },
            ]}
          />
          <FilterTautan
            path={PATH}
            param={param}
            kunci="batal"
            aktif={tampilBatal}
            label="Tampilkan transaksi dibatalkan"
            pilihan={[
              { nilai: undefined, label: "Tanpa dibatalkan" },
              { nilai: "ya", label: "Termasuk dibatalkan" },
            ]}
          />
        </div>
        <FilterTautan
          path={PATH}
          param={param}
          kunci="kirim"
          aktif={kirim}
          label="Filter status pengiriman"
          pilihan={[{ nilai: undefined, label: "Semua status" }, ...Object.entries(STATUS_KIRIM).map(([k, v]) => ({ nilai: k, label: v.label }))]}
        />
      </div>

      {error ? (
        <EmptyState judul="Data transaksi gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        q || kirim || bayar || periode ? (
          <EmptyState ikon={SearchX} judul="Transaksi tidak ditemukan" deskripsi="Ubah kata kunci atau filter, lalu cari lagi." />
        ) : (
          <EmptyState
            ikon={ClipboardList}
            judul="Belum ada transaksi"
            deskripsi={bolehBuat ? "Transaksi pertama akan muncul di sini setelah disimpan." : "Transaksi dibuat oleh Admin Loket."}
          />
        )
      ) : (
        <div className="space-y-3">
          {/* Kartu di layar kecil, tabel di layar lebar */}
          <ul className="space-y-2 md:hidden">
            {data.map((t) => (
              <li key={t.no_resi}>
                <Link href={`${PATH}/${t.no_resi}`} className="block space-y-2 rounded-lg border bg-card p-3 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-primary">{t.no_resi}</p>
                      <p className="text-xs text-muted-foreground">{formatTanggalWaktu(t.waktu_transaksi, zonaWaktu)}</p>
                    </div>
                    <p className="font-semibold tabular-nums">{formatRupiah(t.total_biaya)}</p>
                  </div>
                  <p className="text-sm">
                    {relasiTunggal(t.pengirim)?.nama} → {relasiTunggal(t.penerima)?.nama}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.status_void ? (
                      <BadgeNada nada="danger" label="Dibatalkan" />
                    ) : (
                      <>
                        <StatusBadge jenis="bayar" nilai={t.status_bayar} />
                        <StatusBadge jenis="kirim" nilai={t.status_kirim} />
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor resi</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Pengirim → Penerima</TableHead>
                  <TableHead className="text-right">Berat</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead>Pengiriman</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((t) => (
                  <TableRow key={t.no_resi} className={t.status_void ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <Link href={`${PATH}/${t.no_resi}`} className="font-medium text-primary hover:underline">
                        {t.no_resi}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatTanggalWaktu(t.waktu_transaksi, zonaWaktu)}</TableCell>
                    <TableCell className="max-w-72 truncate">
                      {relasiTunggal(t.pengirim)?.nama} → {relasiTunggal(t.penerima)?.nama}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAngka(t.total_berat_kg)} kg</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(t.total_biaya)}</TableCell>
                    <TableCell>
                      {t.status_void ? <BadgeNada nada="danger" label="Dibatalkan" /> : <StatusBadge jenis="bayar" nilai={t.status_bayar} />}
                    </TableCell>
                    <TableCell>{!t.status_void && <StatusBadge jenis="kirim" nilai={t.status_kirim} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Paginasi path={PATH} param={param} halaman={halaman} ukuran={UKURAN} total={count ?? 0} />
        </div>
      )}
    </>
  );
}
