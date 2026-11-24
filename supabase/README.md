# Supabase — SIGAP PMII FEBI

Project ref: `krqpvnmuchnbpfmijqzh`  
Project URL: https://krqpvnmuchnbpfmijqzh.supabase.co  
Region: Southeast Asia (Singapore)

## Komponen database yang sudah dipasang

- Supabase Auth dan profil pengguna; pendaftaran email baru otomatis dikonfirmasi oleh trigger database sehingga tidak perlu klik tautan verifikasi.
- Antrean persetujuan akun dengan RPC aman: Ketua Rayon, Sekretaris Umum, Bendahara Umum, Kepala Bidang, dan Admin Sistem dapat menyetujui/menolak pendaftar.
- Struktur organisasi PMII FEBI dalam `org_units`.
- Periode kepengurusan dan penugasan role, termasuk `sekretaris_bidang` yang sejajar dengan `kepala_bidang`.
- `member_roster` untuk mencatat nama anggota tanpa akun login, dengan cakupan akses berdasarkan jabatan dan unit.
- Kriteria penilaian berbobot, evaluasi, dan skor untuk anggota terdaftar maupun anggota nominal.
- Cetak rapor individu berisi profil singkat, skor tiap indikator, nilai akhir, catatan evaluasi, kendala, dan rekomendasi.
- Laporan kegiatan.
- Audit log untuk perubahan penting.
- Row Level Security (RLS) pada seluruh tabel di schema `public`.
- Fungsi otorisasi terpisah pada schema `private`.

Role aplikasi: `admin`, `ketua_rayon`, `sekretaris_umum`, `bendahara_umum`, `kepala_bidang`, `sekretaris_bidang`, `koordinator_biro`, `anggota`.

## Bootstrap admin pertama

1. Buka website SIGAP dan daftar dengan email admin yang akan digunakan. Verifikasi email tidak diperlukan.
2. Buka Supabase Dashboard → SQL Editor.
3. Buka file `bootstrap_first_admin.sql`, ganti `GANTI_DENGAN_EMAIL_ADMIN@CONTOH.COM` dengan email yang didaftarkan, lalu jalankan.
4. Masuk kembali ke website. Akun tersebut kini menjadi Admin Sistem.
5. Buat periode kepengurusan dari Panel Admin, lalu tetapkan role Ketua Rayon, Sekretaris Umum, Bendahara Umum, Kepala Bidang, Sekretaris Bidang, dan Koordinator Biro. Pemegang role pimpinan sesuai aturan akan mendapat menu Persetujuan akun; Kepala Bidang dan Sekretaris Bidang dapat mengelola daftar nominal dan penilaian di bidangnya.

Bootstrap admin hanya perlu dilakukan satu kali. Jangan memberikan akses SQL Editor atau secret key kepada pengguna biasa.

## Keamanan

- `config.js` hanya berisi URL proyek dan publishable key. Publishable key memang digunakan pada browser; keamanan data ditegakkan oleh RLS.
- Jangan pernah menambahkan `service_role` key atau secret key ke `config.js`, `app.js`, atau file frontend lainnya.
- Role dan status persetujuan disimpan di tabel database, bukan di metadata yang dapat diubah sendiri oleh pengguna.
- Perubahan status pending ke active/rejected hanya lewat RPC `approve_pending_account`, yang memeriksa role aktif di database.
- Struktur organisasi, periode, role, evaluasi, skor, dan laporan dibatasi oleh kebijakan RLS.
- Lihat Security Advisor sebelum membuka akses produksi atau menambahkan kebijakan baru.

## Tabel inti

`profiles`, `org_units`, `evaluation_periods`, `memberships`, `member_roster`, `evaluation_criteria`, `evaluations`, `evaluation_scores`, `activity_reports`, `audit_logs`.

## Catatan pengembangan

Skema aktif sudah dipasang langsung pada project Supabase. File perubahan database pada repository: `01_add_secretary_bidang_role.sql` lalu `02_nominal_roster_and_rapor.sql`. Jalankan berurutan hanya pada project baru; project aktif sudah menerima perubahan tersebut. Perubahan DDL berikutnya perlu dicatat sebagai file migration SQL agar dapat ditinjau dan direproduksi.
