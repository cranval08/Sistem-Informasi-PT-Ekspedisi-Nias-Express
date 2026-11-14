import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RiwayatAudit } from "@/components/app/riwayat-audit";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { EmptyState } from "@/components/app/states";
import { BadgeNada, StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idValid } from "@/lib/aksi/hasil";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { hitungKapasitas, jumlahGram } from "@/lib/domain/manifes";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilKebijakanKapasitas } from "../../manifes/data";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Detail Armada" };

export default async function HalamanDetailArmada(props: PageProps<"/armada/[id]">) {
  const profil = await wajibAksesRute("armada");
  const { id: idMentah } = await props.params;
  const id = idValid(idMentah);
  if (!id) notFound();

  const supabase = await buatKlienServer();
  const { zonaWaktu } = await ambilPengaturan();
  const [{ data: a, error: galatArmada }, { data: riwayat, error: galatRiwayat }, { data: manifes, error: galatManifes }, { ambang }] = await Promise.all([
    supabase
      .from("data_armada")
      .select("plat_nomor, jenis_unit, kapasitas_ton, status, waktu_status_diubah, is_active, catatan, waktu_dibuat, supir:data_pengguna(nama_lengkap, nomor_telepon)")
      .eq("id_armada", id)
      .maybeSingle(),
    supabase
      .from("riwayat_status_armada")
      .select("id, status_sebelumnya, status_baru, waktu_perubahan, catatan, pengguna:data_pengguna(nama_lengkap)")
      .eq("id_armada", id)
      .order("waktu_perubahan", { ascending: false })
      .limit(50),
    supabase
      .from("manifes")
      .select(
        `id_manifes, rute, status_manifes, waktu_dibuat,
         supir:data_pengguna!manifes_id_supir_fkey(nama_lengkap),
         detail:manifes_detail!manifes_detail_id_manifes_fkey(aktif, transaksi:data_transaksi!manifes_detail_no_resi_fkey(total_berat_kg))`,
      )
      .eq("id_armada", id)
      .order("waktu_dibuat", { ascending: false })
      .limit(10),
    ambilKebijakanKapasitas(),
  ]);
  // Galat query bukan "tidak ditemukan": jangan disamarkan sebagai 404.
  if (galatArmada) throw new Error(`Armada gagal dimuat (${galatArmada.code ?? "tanpa kode"}).`);
  if (!a) notFound();
  const supir = relasiTunggal(a.supir);

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/armada">
            <ArrowLeft aria-hidden /> Kembali ke daftar armada
          </Link>
        </Button>
      </div>
      <PageHeader judul={`Armada ${a.plat_nomor}`} deskripsi="Detail unit, supir, dan riwayat perubahan status." />

      <Card>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Status">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge jenis="armada" nilai={a.status} />
              {!a.is_active && <BadgeNada nada="neutral" label="Nonaktif" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">sejak {formatTanggalWaktu(a.waktu_status_diubah, zonaWaktu)}</p>
          </Info>
          <Info label="Jenis unit">
            <span className="capitalize">{a.jenis_unit}</span>
          </Info>
          <Info label="Kapasitas">{formatAngka(a.kapasitas_ton)} ton</Info>
          <Info label="Supir">
            {supir ? (
              <>
                {supir.nama_lengkap}
                <p className="text-xs text-muted-foreground tabular-nums">{supir.nomor_telepon}</p>
              </>
            ) : (
              <span className="text-muted-foreground">Belum ditugaskan</span>
            )}
          </Info>
          {a.catatan && (
            <Info label="Catatan" className="sm:col-span-2 lg:col-span-4">
              {a.catatan}
            </Info>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Manifes & tonase yang ditugaskan</h2>
        <p className="text-sm text-muted-foreground">10 manifes terakhir. Muatan dihitung dari resi aktif pada masing-masing manifes.</p>
        {galatManifes ? (
          <EmptyState ikon={Warehouse} judul="Data manifes gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
        ) : !manifes?.length ? (
          <EmptyState ikon={Warehouse} judul="Belum ada manifes untuk armada ini" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {manifes.map((m) => {
              const kap = hitungKapasitas(
                jumlahGram((m.detail ?? []).filter((d) => d.aktif).map((d) => relasiTunggal(d.transaksi)?.total_berat_kg ?? 0)),
                a.kapasitas_ton,
                ambang,
              );
              return (
                <li key={m.id_manifes} className="grid gap-2 p-3 sm:grid-cols-[1fr_16rem] sm:items-center">
                  <div>
                    <Link href={`/manifes/${m.id_manifes}`} className="font-medium text-primary hover:underline">
                      {m.rute}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge jenis="manifes" nilai={m.status_manifes} />
                      {relasiTunggal(m.supir)?.nama_lengkap} · dibuat {formatTanggalWaktu(m.waktu_dibuat, zonaWaktu)}
                    </div>
                  </div>
                  <MeterKapasitas hasil={kap} ambang={ambang} ringkas />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Riwayat status</h2>
        {galatRiwayat ? (
          <EmptyState ikon={History} judul="Riwayat gagal dimuat" deskripsi="Muat ulang halaman untuk mencoba lagi." />
        ) : !riwayat?.length ? (
          <EmptyState ikon={History} judul="Belum ada riwayat status" />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Perubahan</TableHead>
                  <TableHead>Oleh</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riwayat.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatTanggalWaktu(r.waktu_perubahan, zonaWaktu)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.status_sebelumnya ? (
                          <>
                            <StatusBadge jenis="armada" nilai={r.status_sebelumnya} />
                            <span aria-hidden>→</span>
                            <span className="sr-only">menjadi</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Status awal:</span>
                        )}
                        <StatusBadge jenis="armada" nilai={r.status_baru} />
                      </div>
                    </TableCell>
                    <TableCell>{relasiTunggal(r.pengguna)?.nama_lengkap ?? "Sistem"}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{r.catatan ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {profil.peran === "pemilik" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Riwayat perubahan data</h2>
          <p className="text-sm text-muted-foreground">Perubahan plat, kapasitas, supir, dan keaktifan dari audit log.</p>
          <RiwayatAudit entitas="data_armada" entitasId={id} zonaWaktu={zonaWaktu} />
        </section>
      )}
    </>
  );
}

function Info({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div>{children}</div>
    </div>
  );
}

