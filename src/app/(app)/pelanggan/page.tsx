import type { Metadata } from "next";
import { SearchX, Users } from "lucide-react";
import { FilterTautan, FormPencarian, kataKunciAman, nomorHalaman, Paginasi, paramTunggal } from "@/components/app/daftar";
import { polaIlike } from "@/lib/domain/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatTanggalWaktu, normalisasiTelepon } from "@/lib/domain/format";
import { buatKlienServer } from "@/lib/supabase/server";
import { AksiBarisPelanggan, TombolTambahPelanggan } from "./form-pelanggan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Daftar Pelanggan" };

const PATH = "/pelanggan";
const UKURAN = 20;

export default async function HalamanPelanggan(props: PageProps<"/pelanggan">) {
  await wajibAksesRute("pelanggan");
  const sp = await props.searchParams;
  const q = paramTunggal(sp.q);
  const status = paramTunggal(sp.status); // undefined = aktif
  const halaman = nomorHalaman(sp.hal);

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();

  let kueri = supabase
    .from("data_pelanggan")
    .select("id_pelanggan, nama, telepon, is_active, waktu_dibuat", { count: "exact" })
    .order("nama")
    .order("id_pelanggan")
    .range((halaman - 1) * UKURAN, halaman * UKURAN - 1);
  if (status !== "semua") kueri = kueri.eq("is_active", status !== "nonaktif");

  const aman = kataKunciAman(q);
  if (aman) {
    const digit = aman.replace(/\D/g, "");
    const filter = [`nama.ilike."${polaIlike(aman)}"`];
    if (digit.length >= 3) filter.push(`telepon.like."%${normalisasiTelepon(digit)}%"`);
    kueri = kueri.or(filter.join(","));
  }

  const { data, count, error } = await kueri;
  const param = { q, status };

  return (
    <>
      <PageHeader
        judul="Daftar Pelanggan"
        deskripsi="Data pengirim dan penerima. Nomor telepon unik untuk mencegah pelanggan ganda."
        aksi={<TombolTambahPelanggan />}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FormPencarian path={PATH} q={q} placeholder="Cari nama atau nomor telepon…" pertahankan={{ status }} />
        <FilterTautan
          path={PATH}
          param={param}
          kunci="status"
          aktif={status}
          label="Filter status pelanggan"
          pilihan={[
            { nilai: undefined, label: "Aktif" },
            { nilai: "nonaktif", label: "Nonaktif" },
            { nilai: "semua", label: "Semua" },
          ]}
        />
      </div>

      {error ? (
        <EmptyState judul="Data pelanggan gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        q ? (
          <EmptyState
            ikon={SearchX}
            judul="Pelanggan tidak ditemukan"
            deskripsi={`Tidak ada pelanggan yang cocok dengan "${q}". Periksa ejaan atau cari dengan nomor telepon.`}
          />
        ) : (
          <EmptyState
            ikon={Users}
            judul="Belum ada pelanggan"
            deskripsi="Tambahkan pelanggan baru atau pelanggan akan ditambahkan saat membuat transaksi."
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pertama dicatat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.id_pelanggan}>
                    <TableCell className="font-medium">{p.nama}</TableCell>
                    <TableCell className="tabular-nums">{p.telepon}</TableCell>
                    <TableCell>
                      <StatusBadge jenis="akun" nilai={p.is_active ? "aktif" : "nonaktif"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatTanggalWaktu(p.waktu_dibuat, zonaWaktu)}</TableCell>
                    <TableCell>
                      <AksiBarisPelanggan p={{ id: p.id_pelanggan, nama: p.nama, telepon: p.telepon, aktif: p.is_active }} />
                    </TableCell>
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
