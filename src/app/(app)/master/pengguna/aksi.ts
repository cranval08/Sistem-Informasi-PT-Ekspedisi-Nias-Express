"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, idValid, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { LABEL_PERAN } from "@/lib/domain/peran";
import { dataForm, skemaAturPassword, skemaPenggunaBaru, skemaUbahPengguna } from "@/lib/domain/skema";
import { buatKlienAdmin } from "@/lib/supabase/admin";
import { buatKlienServer } from "@/lib/supabase/server";

const PESAN_KUNCI_SERVER =
  "Kunci server Supabase belum dikonfigurasi di server aplikasi, sehingga akun login tidak dapat dikelola. Hubungi pengelola sistem.";

// Durasi blokir login untuk akun nonaktif (±100 tahun) — lapisan tambahan
// selain peran_saya() = NULL yang sudah menolak seluruh akses data.
const BLOKIR = "876000h";

function klienAdmin() {
  try {
    return buatKlienAdmin();
  } catch {
    return null;
  }
}

/**
 * Buat akun baru: (1) akun Supabase Auth dibuat dengan secret key di
 * server, (2) profil didaftarkan lewat RPC dengan sesi Pemilik agar audit
 * log mencatat pembuatnya. Bila langkah 2 gagal, akun Auth dihapus lagi.
 */
export async function tambahPengguna(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const v = skemaPenggunaBaru.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);
  const { email, password, nama_lengkap, nomor_telepon, peran } = v.data;

  const supabase = await buatKlienServer();
  const [{ data: emailAda }, { data: telpAda }] = await Promise.all([
    supabase.from("data_pengguna").select("id_pengguna").eq("email", email).maybeSingle(),
    supabase.from("data_pengguna").select("nama_lengkap").eq("nomor_telepon", nomor_telepon).maybeSingle(),
  ]);
  if (emailAda) return gagal("Email sudah dipakai.", { email: "Email sudah dipakai pengguna lain." });
  if (telpAda) {
    return gagal("Nomor telepon sudah dipakai.", { nomor_telepon: `Nomor telepon sudah dipakai oleh ${telpAda.nama_lengkap}.` });
  }

  const admin = klienAdmin();
  if (!admin) return gagal(PESAN_KUNCI_SERVER);

  const { data: dibuat, error: galatAuth } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (galatAuth || !dibuat.user) {
    const terdaftar = galatAuth?.code === "email_exists" || /already|registered|exists/i.test(galatAuth?.message ?? "");
    if (terdaftar) {
      return gagal("Email sudah terdaftar di sistem login.", {
        email: "Email ini sudah memiliki akun login. Gunakan email lain atau hubungi pengelola sistem.",
      });
    }
    if (galatAuth?.code === "weak_password") return gagal("Password terlalu lemah.", { password: "Password terlalu lemah. Gunakan kombinasi huruf dan angka." });
    return gagal("Akun login gagal dibuat. Coba lagi beberapa saat lagi.");
  }

  const { error } = await supabase.rpc("daftarkan_pengguna", {
    p_id: dibuat.user.id,
    p_nama_lengkap: nama_lengkap,
    p_peran: peran,
    p_nomor_telepon: nomor_telepon,
    p_email: email,
  });
  if (error) {
    await admin.auth.admin.deleteUser(dibuat.user.id);
    return gagalDb(error);
  }
  refresh();
  return berhasil(`Akun ${nama_lengkap} (${LABEL_PERAN[peran]}) dibuat. Sampaikan password awal secara langsung kepada pengguna.`);
}

export async function ubahPengguna(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const id = idValid(formData.get("id_pengguna"));
  if (!id) return gagal("Data pengguna tidak valid. Muat ulang halaman.");
  const v = skemaUbahPengguna.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { data, error } = await supabase.from("data_pengguna").update(v.data).eq("id_pengguna", id).select("id_pengguna");
  if (error) return gagalDb(error);
  if (!data?.length) return gagal("Pengguna tidak ditemukan atau Anda tidak memiliki akses.");
  refresh();
  return berhasil(`Data ${v.data.nama_lengkap} diperbarui.`);
}

export async function ubahKeaktifanPengguna(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const id = idValid(formData.get("id_pengguna"));
  const aktif = formData.get("aktif");
  if (!id || (aktif !== "true" && aktif !== "false")) return gagal("Permintaan tidak valid. Muat ulang halaman.");
  const jadiAktif = aktif === "true";

  // Aturan (bukan akun sendiri, pemilik terakhir, supir yang masih bertugas)
  // ditegakkan trigger database.
  const supabase = await buatKlienServer();
  const { data, error } = await supabase
    .from("data_pengguna")
    .update({ is_active: jadiAktif })
    .eq("id_pengguna", id)
    .select("nama_lengkap");
  if (error) return gagalDb(error);
  if (!data?.length) return gagal("Pengguna tidak ditemukan atau Anda tidak memiliki akses.");
  refresh();

  const nama = data[0].nama_lengkap;
  const admin = klienAdmin();
  const { error: galatBlokir } = admin
    ? await admin.auth.admin.updateUserById(id, { ban_duration: jadiAktif ? "none" : BLOKIR })
    : { error: new Error("tanpa kunci") };
  if (galatBlokir) {
    return berhasil(
      jadiAktif
        ? `${nama} diaktifkan, tetapi blokir login di sistem autentikasi belum terbuka. Coba aktifkan ulang atau hubungi pengelola sistem.`
        : `${nama} dinonaktifkan dan tidak dapat mengakses data apa pun. (Blokir login tambahan di sistem autentikasi gagal diterapkan.)`,
    );
  }
  return berhasil(jadiAktif ? `${nama} diaktifkan kembali dan dapat login.` : `${nama} dinonaktifkan dan tidak dapat login.`);
}

export async function aturUlangPassword(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const id = idValid(formData.get("id_pengguna"));
  if (!id) return gagal("Data pengguna tidak valid. Muat ulang halaman.");
  const v = skemaAturPassword.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { data: p } = await supabase.from("data_pengguna").select("nama_lengkap").eq("id_pengguna", id).maybeSingle();
  if (!p) return gagal("Pengguna tidak ditemukan.");

  const admin = klienAdmin();
  if (!admin) return gagal(PESAN_KUNCI_SERVER);
  const { error } = await admin.auth.admin.updateUserById(id, { password: v.data.password });
  if (error) {
    if (error.code === "weak_password") return gagal("Password terlalu lemah.", { password: "Password terlalu lemah. Gunakan kombinasi huruf dan angka." });
    return gagal("Password gagal diatur ulang. Coba lagi beberapa saat lagi.");
  }
  // Nilai password tidak pernah dicatat; hanya aksinya.
  const { error: galatAudit } = await supabase.rpc("catat_aksi_akun", { p_id: id, p_aksi: "atur_ulang_password" });
  if (galatAudit) return berhasil(`Password ${p.nama_lengkap} diatur ulang, tetapi pencatatan audit gagal.`);
  return berhasil(`Password ${p.nama_lengkap} diatur ulang. Sampaikan password baru secara langsung kepada pengguna.`);
}
