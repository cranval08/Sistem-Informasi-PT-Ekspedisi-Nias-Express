import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { FilterTautan, paramTunggal } from "@/components/app/daftar";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { BadgeNada, StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { AksiBarisArmada, TombolTambahArmada, type BarisArmada, type PilihanSupir } from "./form-armada";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Daftar Armada" };

const PATH = "/armada";

export default async function HalamanArmada(props: PageProps<"/armada">) {
  const profil = await wajibAksesRute("armada");
  const bolehKelola = profil.peran === "pemilik";
  const sp = await props.searchParams;
  const tampil = paramTunggal(sp.tampil);

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();

  let kueri = supabase
    .from("data_armada")
    .select("id_armada, plat_nomor, jenis_unit, kapasitas_ton, id_supir, status, waktu_status_diubah, is_active, catatan, supir:data_pengguna(nama_lengkap)")
    .order("plat_nomor");
  if (tampil !== "semua") kueri = kueri.eq("is_active", tampil !== "nonaktif");
  const { data, error } = await kueri;

  let supir: PilihanSupir[] = [];
  if (bolehKelola) {
    const [{ data: daftarSupir }, { data: penugasan }] = await Promise.all([
      supabase.from("data_pengguna").select("id_pengguna, nama_lengkap").eq("peran", "supir").eq("is_active", true).order("nama_lengkap"),
      supabase.from("data_armada").select("id_armada, plat_nomor, id_supir").eq("is_active", true).not("id_supir", "is", null),
    ]);
    supir = (daftarSupir ?? []).map((s) => ({
      id: s.id_pengguna,
      nama: s.nama_lengkap,
      armada: (penugasan ?? []).filter((a) => a.id_supir === s.id_pengguna).map((a) => ({ id: a.id_armada, plat: a.plat_nomor })),
    }));
  }

  return (
    <>
      <PageHeader
        judul="Daftar Armada"
        deskripsi={
          bolehKelola
            ? "Kelola unit, kapasitas, supir, dan status armada."
            : "Data armada, kapasitas, dan status. Perubahan data armada dilakukan oleh Pemilik."
        }
        aksi={bolehKelola ? <TombolTambahArmada supir={supir} /> : undefined}
      />

      <FilterTautan
        path={PATH}
        param={{ tampil }}
        kunci="tampil"
        aktif={tampil}
        label="Filter keaktifan armada"
        pilihan={[
          { nilai: undefined, label: "Aktif" },
          { nilai: "nonaktif", label: "Nonaktif" },
          { nilai: "semua", label: "Semua" },
        ]}
      />

      {error ? (
        <EmptyState judul="Data armada gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
      ) : !data?.length ? (
        <EmptyState
          ikon={Truck}
          judul={tampil ? "Tidak ada armada pada filter ini" : "Belum ada armada"}
          deskripsi={bolehKelola ? "Tambahkan armada beserta kapasitas aktual masing-masing unit." : "Pemilik belum menambahkan data armada."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plat nomor</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-right">Kapasitas</TableHead>
                <TableHead>Supir</TableHead>
                <TableHead>Status</TableHead>
                {bolehKelola && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => {
                const namaSupir = relasiTunggal(a.supir)?.nama_lengkap;
                const baris: BarisArmada = {
                  id: a.id_armada,
                  plat: a.plat_nomor,
                  jenis: a.jenis_unit as BarisArmada["jenis"],
                  kapasitas: String(a.kapasitas_ton),
                  idSupir: a.id_supir,
                  status: a.status as BarisArmada["status"],
                  aktif: a.is_active,
                  catatan: a.catatan,
                };
                return (
                  <TableRow key={a.id_armada}>
                    <TableCell>
                      <Link href={`${PATH}/${a.id_armada}`} className="font-medium tracking-wide text-primary hover:underline">
                        {a.plat_nomor}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{a.jenis_unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAngka(a.kapasitas_ton)} ton</TableCell>
                    <TableCell>{namaSupir ?? <span className="text-muted-foreground">Belum ditugaskan</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge jenis="armada" nilai={a.status} />
                        {!a.is_active && <BadgeNada nada="neutral" label="Nonaktif" />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">sejak {formatTanggalWaktu(a.waktu_status_diubah, zonaWaktu)}</p>
                    </TableCell>
                    {bolehKelola && (
                      <TableCell>
                        <AksiBarisArmada a={baris} supir={supir} />
                      </TableCell>
                    )}
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
