import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

/**
 * Data tidak ditemukan (notFound() dari halaman detail: resi, manifes,
 * armada yang tidak ada). Tampil di dalam shell aplikasi; status HTTP 404.
 */
export default function DataTidakDitemukan() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <EmptyState
        ikon={SearchX}
        judul="Data tidak ditemukan"
        deskripsi="Nomor resi, manifes, atau armada yang Anda cari tidak ada. Periksa kembali nomornya atau cari dari daftar."
        aksi={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Kembali ke Dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
