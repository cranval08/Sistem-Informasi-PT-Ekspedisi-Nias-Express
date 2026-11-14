import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, PackageSearch, ShieldAlert, TriangleAlert } from "lucide-react";
import { MeterKapasitas } from "@/components/app/meter-kapasitas";
import { PageHeader } from "@/components/app/page-header";
import { RiwayatAudit } from "@/components/app/riwayat-audit";
import { EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idValid } from "@/lib/aksi/hasil";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { hitungKapasitas, JENIS_KENDALA, jumlahGram, type JenisKendala } from "@/lib/domain/manifes";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import {
  FormTambahResi,
  TombolBatalManifes,
  TombolBerangkat,
  TombolKonfirmasiMuat,
  TombolLaporKendala,
  TombolLepasResi,
  TombolPindahResi,
  TombolSelesaikanKendala,
  TombolTiba,
  type KandidatResi,
} from "../aksi-manifes";
import { ambilKebijakanKapasitas, ambilManifes } from "../data";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Detail Manifes" };

const BATAS_KANDIDAT = 200;

export default async function HalamanDetailManifes(props: PageProps<"/manifes/[id]">) {
  const profil = await wajibAksesRute("manifes");
  const { id: idMentah } = await props.params;
  const id = idValid(idMentah);
  if (!id) notFound();

  const m = await ambilManifes(id);
  if (!m) notFound();
  const [{ zonaWaktu }, kebijakan] = await Promise.all([ambilPengaturan(), ambilKebijakanKapasitas()]);
  const supabase = await buatKlienServer();

  const draf = m.status === "draft";
  const sebelumBerangkat = draf || m.status === "dimuat";
  const kap = hitungKapasitas(jumlahGram(m.resi.map((r) => r.berat)), m.armada.kapasitasTon, kebijakan.ambang);
  const bolehOverride = profil.peran === "pemilik" && kebijakan.overrideKapasitas;

  // Resi siap dimuat (Diterima Loket, belum di manifes aktif) & manifes Draf lain untuk pemindahan.
  const [kandidatQ, tujuanQ] = await Promise.all([
    draf
      ? supabase
          .from("data_transaksi")
          .select(
            `no_resi, total_berat_kg, status_bayar, override_belum_lunas,
             pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama),
             penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama),
             md:manifes_detail!manifes_detail_no_resi_fkey(aktif)`,
          )
          .eq("status_kirim", "diterima_loket")
          .eq("status_void", false)
          .order("waktu_transaksi")
          .limit(BATAS_KANDIDAT)
      : Promise.resolve({ data: null, error: null }),
    sebelumBerangkat
      ? supabase
          .from("manifes")
          .select("id_manifes, rute, armada:data_armada!manifes_id_armada_fkey(plat_nomor)")
          .eq("status_manifes", "draft")
          .neq("id_manifes", id)
          .order("waktu_dibuat", { ascending: false })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (kandidatQ.error || tujuanQ.error) throw new Error("Data resi siap dimuat gagal dimuat.");

  const kandidat: KandidatResi[] = (kandidatQ.data ?? [])
    .filter((t) => !(t.md ?? []).some((d) => d.aktif))
    .map((t) => ({
      noResi: t.no_resi,
      berat: String(t.total_berat_kg),
      pengirim: relasiTunggal(t.pengirim)?.nama ?? "—",
      penerima: relasiTunggal(t.penerima)?.nama ?? "—",
      bolehDimuat: t.status_bayar === "lunas" || t.override_belum_lunas,
      override: t.status_bayar !== "lunas" && t.override_belum_lunas,
    }));
  const tujuan = (tujuanQ.data ?? []).map((x) => ({ id: x.id_manifes, label: `${relasiTunggal(x.armada)?.plat_nomor ?? "—"} · ${x.rute}` }));
  const kendalaTerbuka = m.kendala.filter((k) => k.status === "terbuka").length;

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/manifes">
            <ArrowLeft aria-hidden /> Kembali ke daftar manifes
          </Link>
        </Button>
      </div>
      <PageHeader
        judul={`Manifes ${m.armada.plat}`}
        deskripsi={m.rute}
        aksi={
          <>
            {sebelumBerangkat && <TombolBatalManifes idManifes={m.id} dimuat={!draf} />}
            {draf && (
              <TombolKonfirmasiMuat idManifes={m.id} melebihi={kap.diblokir} bolehOverride={bolehOverride} jumlahResi={m.resi.length} />
            )}
            {m.status === "dimuat" && <TombolBerangkat idManifes={m.id} plat={m.armada.plat} />}
            {m.status === "berangkat" && <TombolTiba idManifes={m.id} />}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge jenis="manifes" nilai={m.status} />
        {kendalaTerbuka > 0 && (
          <span className="inline-flex items-center gap-1 text-sm text-danger">
            <TriangleAlert className="size-4" aria-hidden /> {kendalaTerbuka} kendala terbuka
          </span>
        )}
      </div>

      {m.status === "dibatalkan" && (
        <Alert variant="destructive">
          <Ban aria-hidden />
          <AlertTitle>Manifes dibatalkan</AlertTitle>
          <AlertDescription>Alasan: {m.alasanBatal}</AlertDescription>
        </Alert>
      )}
      {draf && kap.diblokir && (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden />
          <AlertTitle>Muatan melebihi kapasitas</AlertTitle>
          <AlertDescription>
            {bolehOverride
              ? "Konfirmasi muat diblokir. Sebagai Pemilik Anda dapat melakukan override dengan alasan tertulis, atau lepas/pindahkan resi ke armada lain."
              : profil.peran === "pemilik"
                ? "Konfirmasi muat diblokir. Kebijakan perusahaan di Pengaturan tidak mengizinkan override kapasitas — lepas atau pindahkan resi ke armada lain."
                : "Konfirmasi muat diblokir. Lepas atau pindahkan resi ke armada lain; hanya Pemilik yang dapat melakukan override bila kebijakan mengizinkan."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Muatan & kapasitas</CardTitle>
            <CardDescription>
              {m.resi.length} resi · kapasitas {formatAngka(m.armada.kapasitasTon)} ton (dari master armada)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <MeterKapasitas hasil={kap} ambang={kebijakan.ambang} />
            {m.override && (
              <p className="rounded-lg border border-warning/30 bg-warning-subtle/60 p-2.5 text-sm">
                <span className="font-medium">Override kapasitas</span> oleh {m.override.oleh}: {m.override.alasan}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 text-sm">
            <Info label="Armada">
              <Link href={`/armada/${m.armada.id}`} className="font-medium text-primary hover:underline">
                {m.armada.plat}
              </Link>
              <span className="ml-2 inline-block align-middle">
                <StatusBadge jenis="armada" nilai={m.armada.status} />
              </span>
            </Info>
            <Info label="Supir">
              {m.supir.nama_lengkap}
              {m.supir.nomor_telepon && <span className="block text-xs text-muted-foreground tabular-nums">{m.supir.nomor_telepon}</span>}
            </Info>
            <Info label="Waktu">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Dibuat</dt>
                <dd>
                  {formatTanggalWaktu(m.waktu.dibuat, zonaWaktu)} · {m.pembuat}
                </dd>
                <dt className="text-muted-foreground">Dimuat</dt>
                <dd>{formatTanggalWaktu(m.waktu.dimuat, zonaWaktu)}</dd>
                <dt className="text-muted-foreground">Berangkat</dt>
                <dd>{formatTanggalWaktu(m.waktu.berangkat, zonaWaktu)}</dd>
                <dt className="text-muted-foreground">Tiba</dt>
                <dd>{formatTanggalWaktu(m.waktu.tiba, zonaWaktu)}</dd>
              </dl>
            </Info>
            {m.catatan && <Info label="Catatan">{m.catatan}</Info>}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Resi dalam manifes</h2>
        {!m.resi.length ? (
          <EmptyState ikon={PackageSearch} judul="Belum ada resi" deskripsi={draf ? "Pilih resi siap dimuat di bawah." : undefined} />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor resi</TableHead>
                  <TableHead>Pengirim → Penerima</TableHead>
                  <TableHead className="text-right">Berat</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead>Pengiriman</TableHead>
                  {sebelumBerangkat && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.resi.map((r) => (
                  <TableRow key={r.noResi}>
                    <TableCell>
                      <Link href={`/transaksi/${r.noResi}`} className="font-medium text-primary hover:underline">
                        {r.noResi}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 truncate">
                      {r.pengirim} → {r.penerima}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAngka(r.berat)} kg</TableCell>
                    <TableCell>
                      <StatusBadge jenis="bayar" nilai={r.statusBayar} />
                      {r.override && r.statusBayar !== "lunas" && <p className="mt-1 text-xs text-warning">Override belum lunas</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge jenis="kirim" nilai={r.statusKirim} />
                    </TableCell>
                    {sebelumBerangkat && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {draf && <TombolLepasResi idManifes={m.id} noResi={r.noResi} />}
                          <TombolPindahResi noResi={r.noResi} tujuan={tujuan} />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {sebelumBerangkat && !tujuan.length && m.resi.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Untuk memindahkan resi ke armada cadangan, buat dulu manifes Draf untuk armada tersebut.
          </p>
        )}
      </section>

      {draf && (
        <Card>
          <CardHeader>
            <CardTitle>Tambah resi siap dimuat</CardTitle>
            <CardDescription>
              Resi berstatus Diterima Loket yang belum ada di manifes aktif. Resi belum lunas tidak dapat dimuat tanpa override resmi Pemilik.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kandidat.length ? (
              <FormTambahResi
                idManifes={m.id}
                kandidat={kandidat}
                muatanGram={kap.muatanGram}
                kapasitasTon={m.armada.kapasitasTon}
                ambang={kebijakan.ambang}
              />
            ) : (
              <EmptyState ikon={PackageSearch} judul="Tidak ada resi yang menunggu dimuat" className="py-6" />
            )}
            {(kandidatQ.data?.length ?? 0) >= BATAS_KANDIDAT && (
              <p className="mt-2 text-xs text-muted-foreground">Menampilkan {BATAS_KANDIDAT} resi terlama.</p>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Kendala perjalanan</h2>
          {(sebelumBerangkat || m.status === "berangkat") && <TombolLaporKendala idManifes={m.id} />}
        </div>
        {!m.kendala.length ? (
          <p className="text-sm text-muted-foreground">Tidak ada laporan kendala.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {m.kendala.map((k) => (
              <li key={k.id} className="flex items-start justify-between gap-3 p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{JENIS_KENDALA[k.jenis as JenisKendala] ?? k.jenis}</span>
                    <StatusBadge jenis="kendala" nilai={k.status} />
                  </div>
                  <p className="whitespace-pre-line">{k.deskripsi}</p>
                  <p className="text-xs text-muted-foreground">
                    Dilaporkan {formatTanggalWaktu(k.waktu, zonaWaktu)} oleh {k.pelapor}
                    {k.selesaiPada && ` · selesai ${formatTanggalWaktu(k.selesaiPada, zonaWaktu)} oleh ${k.penyelesai ?? "—"}`}
                  </p>
                </div>
                {k.status === "terbuka" && <TombolSelesaikanKendala idKendala={k.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {profil.peran === "pemilik" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Riwayat aktivitas manifes</h2>
          <RiwayatAudit entitas="manifes" entitasId={m.id} zonaWaktu={zonaWaktu} />
        </section>
      )}
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div>{children}</div>
    </div>
  );
}
