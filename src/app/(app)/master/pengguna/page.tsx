import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import { FilterTautan, paramTunggal } from "@/components/app/daftar";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { BadgeNada, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatTanggalWaktu } from "@/lib/domain/format";
import { isPeran, LABEL_PERAN, DAFTAR_PERAN } from "@/lib/domain/peran";
import { buatKlienServer } from "@/lib/supabase/server";
import { AksiBarisPengguna, TombolTambahPengguna } from "./form-pengguna";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Data Pengguna" };

const PATH = "/master/pengguna";

export default async function HalamanPengguna(props: PageProps<"/master/pengguna">) {
  const profil = await wajibAksesRute("masterPengguna");
  const sp = await props.searchParams;
  const peranFilter = paramTunggal(sp.peran);

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();
  let kueri = supabase
    .from("data_pengguna")
    .select("id_pengguna, nama_lengkap, email, nomor_telepon, peran, is_active, waktu_dibuat")
    .order("is_active", { ascending: false })
    .order("nama_lengkap");
  if (isPeran(peranFilter)) kueri = kueri.eq("peran", peranFilter);
  const { data, error } = await kueri;

  return (
    <>
      <PageHeader
        judul="Data Pengguna"
        deskripsi="Akun login staf beserta perannya. Hanya Pemilik yang dapat membuat dan mengelola akun."
        aksi={<TombolTambahPengguna />}
      />

      <FilterTautan
        path={PATH}
        param={{ peran: peranFilter }}
        kunci="peran"
        aktif={isPeran(peranFilter) ? peranFilter : undefined}
        label="Filter peran"
        pilihan={[{ nilai: undefined, label: "Semua" }, ...DAFTAR_PERAN.map((p) => ({ nilai: p, label: LABEL_PERAN[p] }))]}
      />

      {error ? (
        <EmptyState judul="Data pengguna gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        <EmptyState ikon={UserCog} judul="Tidak ada pengguna pada filter ini" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((u) => {
                if (!isPeran(u.peran)) return null;
                const diriSendiri = u.id_pengguna === profil.id;
                return (
                  <TableRow key={u.id_pengguna}>
                    <TableCell className="font-medium">
                      {u.nama_lengkap}
                      {diriSendiri && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Anda)</span>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="tabular-nums">{u.nomor_telepon}</TableCell>
                    <TableCell>
                      <BadgeNada nada="info" label={LABEL_PERAN[u.peran]} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge jenis="akun" nilai={u.is_active ? "aktif" : "nonaktif"} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatTanggalWaktu(u.waktu_dibuat, zonaWaktu)}</TableCell>
                    <TableCell>
                      <AksiBarisPengguna
                        p={{
                          id: u.id_pengguna,
                          nama: u.nama_lengkap,
                          email: u.email,
                          telepon: u.nomor_telepon,
                          peran: u.peran,
                          aktif: u.is_active,
                          diriSendiri,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
