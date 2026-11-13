"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { buatKlienServer } from "@/lib/supabase/server";

const skemaLogin = z.object({
  email: z.email({ error: "Masukkan alamat email yang valid, contoh: nama@perusahaan.com." }),
  password: z.string().min(1, { error: "Password wajib diisi." }),
  lanjut: z.string().optional(),
});

export type StatusLogin = {
  pesan?: string;
  galat?: Partial<Record<"email" | "password", string>>;
  email?: string;
};

/** Hanya izinkan redirect ke path internal (cegah open redirect). */
function tujuanAman(lanjut: string | undefined) {
  if (!lanjut || !lanjut.startsWith("/") || lanjut.startsWith("//") || lanjut.startsWith("/\\")) return "/dashboard";
  return lanjut;
}

export async function masuk(_: StatusLogin, formData: FormData): Promise<StatusLogin> {
  const hasil = skemaLogin.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    lanjut: formData.get("lanjut") ? String(formData.get("lanjut")) : undefined,
  });
  if (!hasil.success) {
    const galat: StatusLogin["galat"] = {};
    for (const isu of hasil.error.issues) {
      const kunci = isu.path[0];
      if (kunci === "email" || kunci === "password") galat[kunci] ??= isu.message;
    }
    return { galat, email: String(formData.get("email") ?? "") };
  }

  const { email, password, lanjut } = hasil.data;
  const supabase = await buatKlienServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const terlaluSering = error.status === 429;
    return {
      email,
      pesan: terlaluSering
        ? "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi."
        : "Email atau password salah. Periksa kembali lalu coba lagi.",
    };
  }

  // Akun Auth valid, tetapi harus terdaftar & aktif di data_pengguna.
  const { data: peran } = await supabase.rpc("peran_saya");
  if (!peran) {
    await supabase.auth.signOut();
    return {
      email,
      pesan: "Akun Anda tidak aktif atau belum terdaftar sebagai pengguna. Hubungi Pemilik untuk mengaktifkannya.",
    };
  }

  redirect(tujuanAman(lanjut));
}

export async function keluar() {
  const supabase = await buatKlienServer();
  await supabase.auth.signOut();
  redirect("/login?alasan=keluar");
}
