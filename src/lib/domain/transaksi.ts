/**
 * Perhitungan biaya transaksi untuk pratinjau langsung di form. Database
 * (`buat_transaksi`) tetap menghitung ulang dan menjadi sumber kebenaran;
 * rumus di sini harus identik:
 *   jumlah   = kg: berat · ton: round(berat / 1000, 3) · koli: jumlah koli
 *   subtotal = round(jumlah × tarif)
 * Semua angka desimal diolah sebagai bilangan bulat "mili" (×1000) agar
 * bebas galat floating point.
 */
export type Satuan = "kg" | "ton" | "koli";

/** "12,5" / "12.5" → 12500; null bila kosong, bukan angka, ≤ 0, atau > 3 desimal. */
export function keMili(input: string): number | null {
  const s = input.trim().replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const mili = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0") || 0);
  if (!Number.isSafeInteger(mili) || mili <= 0) return null;
  return mili;
}

/** Bilangan bulat koli > 0, selain itu null. */
export function keKoli(input: string): number | null {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

/** Desimal string tanpa galat floating (12500 → "12.5"). */
export function miliKeTeks(mili: number): string {
  const bulat = Math.trunc(mili / 1000);
  const sisa = mili % 1000;
  return sisa === 0 ? String(bulat) : `${bulat}.${String(sisa).padStart(3, "0").replace(/0+$/, "")}`;
}

/** Jumlah dalam satuan tarif, dalam mili. */
export function jumlahMili(satuan: Satuan, beratMili: number, koli: number | null): number | null {
  switch (satuan) {
    case "kg":
      return beratMili;
    case "ton":
      return Math.round(beratMili / 1000); // round(berat_kg / 1000, 3)
    case "koli":
      return koli === null ? null : koli * 1000;
  }
}

/** round(jumlah × tarif) dengan jumlah dalam mili; pembulatan setengah ke atas (sama dengan Postgres untuk nilai positif). */
export function subtotal(jumlahMiliNilai: number, tarif: number): number {
  return Number((BigInt(jumlahMiliNilai) * BigInt(tarif) + BigInt(500)) / BigInt(1000));
}

export type BarisHitung = { satuan: Satuan; tarif: number; berat: string; koli: string };
export type HasilBaris = { beratMili: number | null; jumlahMili: number | null; subtotal: number | null };

export function hitungBaris(b: BarisHitung): HasilBaris {
  const beratMili = keMili(b.berat);
  const koli = b.satuan === "koli" ? keKoli(b.koli) : null;
  const j = beratMili === null ? null : jumlahMili(b.satuan, beratMili, koli);
  return { beratMili, jumlahMili: j, subtotal: j === null || j <= 0 ? null : subtotal(j, b.tarif) };
}

export function hitungTotal(baris: BarisHitung[]) {
  let beratMili = 0;
  let biaya = 0;
  let lengkap = baris.length > 0;
  for (const b of baris) {
    const h = hitungBaris(b);
    if (h.beratMili === null || h.subtotal === null) {
      lengkap = false;
      continue;
    }
    beratMili += h.beratMili;
    biaya += h.subtotal;
  }
  return { beratMili, biaya, lengkap };
}
