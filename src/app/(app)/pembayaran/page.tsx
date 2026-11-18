import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Wallet } from "lucide-react";
import {
  FilterRentang,
  FilterTautan,
  FormPencarian,
  kataKunciAman,
  nomorHalaman,
  Paginasi,
  paramTunggal,
  rentangDariParam,
} from "@/components/app/daftar";
import { polaIlike } from "@/lib/domain/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { BadgeNada } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { bolehBatalkanPembayaran } from "@/lib/domain/pembayaran";
import { awalHariIso, formatRupiah, formatTanggal, formatTanggalWaktu, normalisasiTelepon, tambahHari } from "@/lib/domain/format";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { TombolBatalPembayaran, TombolCatatPembayaran } from "./form-pembayaran";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Daftar Pembayaran" };

const PATH = "/pembayaran";
const UKURAN = 25;

export default async function HalamanPembayaran(props: PageProps<"/pembayaran">) {
  const profil = await wajibAksesRute("pembayaran");
  const pemilik = profil.peran === "pemilik";
  const bolehAksi = pemilik || profil.peran === "admin_loket";
  const sp = await props.searchParams;
  const { zonaWaktu } = await ambilPengaturan();
  const rentang = rentangDariParam(sp, zonaWaktu, "7_hari");
  const q = paramTunggal(sp.q);
  const status = paramTunggal(sp.status);
  const halaman = nomorHalaman(sp.hal);

  const supabase = await buatKlienServer();
  let kueri = supabase
    .from("pembayaran")
    .select(
      `id_pembayaran, no_resi, waktu_bayar, jumlah_bayar, status_pembayaran_record, catatan, catatan_koreksi, id_pengguna_pencatat,
       pencatat:data_pengguna!pembayaran_id_pengguna_pencatat_fkey(nama_lengkap),
       transaksi:data_transaksi(pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama))`,
      { count: "exact" },
    )
    .gte("waktu_bayar", awalHariIso(rentang.dari, zonaWaktu))
    .lt("waktu_bayar", awalHariIso(tambahHari(rentang.sampai, 1), zonaWaktu))
    .order("waktu_bayar", { ascending: false })
    .range((halaman - 1) * UKURAN, halaman * UKURAN - 1);
  if (status !== "semua") kueri = kueri.eq("status_pembayaran_record", status === "dibatalkan" ? "dibatalkan" : "valid");

  // Cari nomor resi, atau pembayaran milik transaksi dengan pengirim/penerima yang cocok.
  const aman = kataKunciAman(q);
  if (aman) {
    const digit = aman.replace(/\D/g, "");
    const filterPel = [`nama.ilike."${polaIlike(aman)}"`];
    if (digit.length >= 3) filterPel.push(`telepon.like."%${normalisasiTelepon(digit)}%"`);
    const { data: pel } = await supabase.from("data_pelanggan").select("id_pelanggan").or(filterPel.join(",")).limit(100);
    const ids = (pel ?? []).map((p) => p.id_pelanggan);
    let resi: string[] = [];
    if (ids.length) {
      const { data: t } = await supabase
        .from("data_transaksi")
        .select("no_resi")
        .or(`id_pengirim.in.(${ids.join(",")}),id_penerima.in.(${ids.join(",")})`)
        .limit(300);
      resi = (t ?? []).map((x) => x.no_resi);
    }
    const filter = [`no_resi.ilike."${polaIlike(aman)}"`];
    if (resi.length) filter.push(`no_resi.in.(${resi.join(",")})`);
    kueri = kueri.or(filter.join(","));
  }

  const { data, count, error } = await kueri;
  const param = { q, status, dari: rentang.periode === "khusus" ? rentang.dari : undefined, sampai: rentang.periode === "khusus" ? rentang.sampai : undefined, periode: rentang.periode === "khusus" ? undefined : rentang.periode };
  const judulRentang = rentang.dari === rentang.sampai ? formatTanggal(rentang.dari + "T12:00:00Z", zonaWaktu) : `${formatTanggal(rentang.dari + "T12:00:00Z", zonaWaktu)} – ${formatTanggal(rentang.sampai + "T12:00:00Z", zonaWaktu)}`;

  return (
    <>
      <PageHeader
        judul="Daftar Pembayaran"
        deskripsi="Riwayat pembayaran per resi. Pembayaran yang salah dibatalkan dengan alasan, tidak dihapus."
        aksi={<TombolCatatPembayaran />}
      />

      <div className="space-y-3">
        <FilterRentang path={PATH} rentang={rentang} param={{ q, status }} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <FormPencarian path={PATH} q={q} placeholder="Nomor resi atau nama/telepon pelanggan…" pertahankan={{ status, dari: param.dari, sampai: param.sampai, periode: param.periode }} />
          <FilterTautan
            path={PATH}
            param={param}
            kunci="status"
            aktif={status}
            label="Filter status pembayaran"
            pilihan={[
              { nilai: undefined, label: "Valid" },
              { nilai: "dibatalkan", label: "Dibatalkan" },
              { nilai: "semua", label: "Semua" },
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">Periode: {judulRentang} (waktu {zonaWaktu})</p>
      </div>

      {error ? (
        <EmptyState judul="Data pembayaran gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        q ? (
          <EmptyState ikon={SearchX} judul="Pembayaran tidak ditemukan" deskripsi="Ubah kata kunci atau periode, lalu cari lagi." />
        ) : (
          <EmptyState ikon={Wallet} judul="Belum ada pembayaran pada periode ini" deskripsi="Pembayaran tercatat saat transaksi dibuat atau lewat tombol Catat Pembayaran." />
        )
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu bayar</TableHead>
                  <TableHead>Nomor resi</TableHead>
                  <TableHead>Pengirim</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Pencatat</TableHead>
                  <TableHead>Status</TableHead>
                  {bolehAksi && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((b) => {
                  const batal = b.status_pembayaran_record === "dibatalkan";
                  const t = relasiTunggal(b.transaksi);
                  return (
                    <TableRow key={b.id_pembayaran} className={batal ? "text-muted-foreground" : undefined}>
                      <TableCell className="whitespace-nowrap">{formatTanggalWaktu(b.waktu_bayar, zonaWaktu)}</TableCell>
                      <TableCell>
                        <Link href={`/transaksi/${b.no_resi}`} className="font-medium text-primary hover:underline">
                          {b.no_resi}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{relasiTunggal(t?.pengirim)?.nama ?? "—"}</TableCell>
                      <TableCell className={batal ? "text-right tabular-nums line-through" : "text-right font-medium tabular-nums"}>
                        {formatRupiah(b.jumlah_bayar)}
                      </TableCell>
                      <TableCell>{relasiTunggal(b.pencatat)?.nama_lengkap ?? "—"}</TableCell>
                      <TableCell>
                        {batal ? (
                          <div className="space-y-1">
                            <BadgeNada nada="neutral" label="Dibatalkan" />
                            {b.catatan_koreksi && <p className="max-w-56 text-xs whitespace-normal">{b.catatan_koreksi}</p>}
                          </div>
                        ) : (
                          <BadgeNada nada="success" label="Valid" />
                        )}
                      </TableCell>
                      {bolehAksi && (
                        <TableCell className="text-right">
                          {bolehBatalkanPembayaran(profil, b, zonaWaktu) && (
                            <TombolBatalPembayaran idPembayaran={b.id_pembayaran} ringkasan={`${formatRupiah(b.jumlah_bayar)} untuk ${b.no_resi}`} />
                          )}
                        </TableCell>
                      )}
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
