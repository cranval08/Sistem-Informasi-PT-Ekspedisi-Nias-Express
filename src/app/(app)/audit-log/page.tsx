import type { Metadata } from "next";
import Link from "next/link";
import { History, Lock } from "lucide-react";
import { FilterRentang, nomorHalaman, Paginasi } from "@/components/app/daftar";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ambilPengaturan, wajibAksesRute } from "@/lib/auth/sesi";
import { LABEL_AKSI_AUDIT, LABEL_ENTITAS_AUDIT, ringkasPerubahan, tautanEntitas } from "@/lib/domain/audit";
import { formatAngka, formatTanggalWaktu } from "@/lib/domain/format";
import { labelRentang } from "@/lib/domain/laporan";
import { LABEL_PERAN, isPeran } from "@/lib/domain/peran";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";
import { ambilAudit, bacaFilterAudit, UKURAN_HALAMAN } from "../laporan/data";
import { KepalaLaporan, paramRentang } from "../laporan/kepala-laporan";

// Bergantung pada sesi: render per request, tanpa validasi navigasi instan (lihat (app)/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Audit Log" };

const PATH = "/audit-log";
const KELAS_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/** Audit log (PRD §7.15): hanya-baca, tidak dapat diubah siapa pun (trigger & RLS). */
export default async function HalamanAuditLog(props: PageProps<"/audit-log">) {
  await wajibAksesRute("auditLog");
  const [{ zonaWaktu }, sp] = await Promise.all([ambilPengaturan(), props.searchParams]);
  const f = bacaFilterAudit(sp, zonaWaktu);
  const halaman = nomorHalaman(sp.hal);
  const supabase = await buatKlienServer();
  const [{ baris, total }, penggunaQ] = await Promise.all([
    ambilAudit(f, zonaWaktu, halaman),
    supabase.from("data_pengguna").select("id_pengguna, nama_lengkap").order("nama_lengkap"),
  ]);
  if (penggunaQ.error) throw new Error(`Daftar pengguna gagal dimuat (${penggunaQ.error.code ?? "tanpa kode"}).`);
  const param = { ...paramRentang(f.rentang), aksi: f.aksi, entitas: f.entitas, pengguna: f.pengguna, q: f.q };
  const rentangParam = paramRentang(f.rentang);

  return (
    <>
      <KepalaLaporan
        judul="Audit Log"
        deskripsi="Jejak aksi penting: transaksi, pembayaran, manifes, override, perubahan master data, dan pengaturan. Waktu dari server."
        jenis="audit"
        param={param}
      />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden /> Catatan audit tidak dapat diubah atau dihapus oleh pengguna mana pun. Login/logout tidak dicatat.
      </p>

      <div className="space-y-3">
        <FilterRentang path={PATH} rentang={f.rentang} param={param} />
        <form action={PATH} method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          {Object.entries(rentangParam).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">Aksi</span>
            <select name="aksi" defaultValue={f.aksi ?? ""} className={KELAS_SELECT}>
              <option value="">Semua aksi</option>
              {Object.entries(LABEL_AKSI_AUDIT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">Entitas</span>
            <select name="entitas" defaultValue={f.entitas ?? ""} className={KELAS_SELECT}>
              <option value="">Semua entitas</option>
              {Object.entries(LABEL_ENTITAS_AUDIT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">Pengguna</span>
            <select name="pengguna" defaultValue={f.pengguna ?? ""} className={KELAS_SELECT}>
              <option value="">Semua pengguna</option>
              {(penggunaQ.data ?? []).map((p) => (
                <option key={p.id_pengguna} value={p.id_pengguna}>
                  {p.nama_lengkap}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="block">ID entitas (mis. nomor resi)</span>
            <Input name="q" defaultValue={f.q} placeholder="NX-20261114-0001" className="h-9" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" size="lg">
              Terapkan
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href={PATH}>Atur ulang</Link>
            </Button>
          </div>
        </form>
      </div>

      <p className="text-sm text-muted-foreground">
        {formatAngka(total, 0)} catatan · {labelRentang(f.rentang.dari, f.rentang.sampai)}
      </p>

      {!baris.length ? (
        <EmptyState ikon={History} judul="Tidak ada catatan audit pada filter ini" deskripsi="Ubah periode atau filter." />
      ) : (
        <div className="space-y-3">
          <ol className="divide-y rounded-lg border bg-card">
            {baris.map((log) => {
              const p = relasiTunggal(log.pengguna as { nama_lengkap: string; peran: string } | null);
              const perubahan = ringkasPerubahan(log.entitas, log.aksi, log.detail_perubahan);
              const tautan = tautanEntitas(log.entitas, log.entitas_id, log.detail_perubahan);
              return (
                <li key={log.id} className="space-y-1.5 p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p>
                      <span className="font-medium">{LABEL_AKSI_AUDIT[log.aksi] ?? log.aksi}</span>
                      <span className="text-muted-foreground"> · {LABEL_ENTITAS_AUDIT[log.entitas] ?? log.entitas}</span>
                      {log.entitas_id && (
                        <>
                          {" "}
                          {tautan ? (
                            <Link href={tautan} className="font-mono text-xs text-primary hover:underline">
                              {log.entitas_id}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">{log.entitas_id}</span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      #{log.id} · {formatTanggalWaktu(log.waktu, zonaWaktu)} · {p?.nama_lengkap ?? "Sistem"}
                      {p?.peran && isPeran(p.peran) ? ` (${LABEL_PERAN[p.peran]})` : ""}
                    </p>
                  </div>
                  {perubahan.length > 0 && (
                    <ul className="space-y-0.5 text-muted-foreground">
                      {perubahan.map((x) => (
                        <li key={x.label}>
                          <span className="text-foreground/80">{x.label}:</span>{" "}
                          {x.lama !== undefined ? (
                            <>
                              <del className="decoration-muted-foreground/60">{x.lama}</del> → <span className="text-foreground">{x.baru}</span>
                            </>
                          ) : (
                            <span className="text-foreground">{x.baru}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {log.alasan && <p className="text-muted-foreground">Alasan: {log.alasan}</p>}
                  {log.detail_perubahan != null && (
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Detail lengkap</summary>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                        {JSON.stringify(log.detail_perubahan, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
          <Paginasi path={PATH} param={param} halaman={halaman} ukuran={UKURAN_HALAMAN} total={total} />
        </div>
      )}
    </>
  );
}
