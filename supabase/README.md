# Supabase — SIGAP PMII FEBI

Project ref: `krqpvnmuchnbpfmijqzh`  
Project URL: https://krqpvnmuchnbpfmijqzh.supabase.co  
Region: Southeast Asia (Singapore)

## Komponen database yang sudah dipasang

- Supabase Auth dan profil pengguna.
- Struktur organisasi PMII FEBI dalam `org_units`.
- Periode kepengurusan dan penugasan role.
- Kriteria penilaian berbobot, evaluasi, dan skor.
- Laporan kegiatan.
- Audit log untuk perubahan penting.
- Row Level Security (RLS) pada seluruh tabel di schema `public`.
- Fungsi otorisasi terpisah pada schema `private`.

Role aplikasi: `admin`, `ketua_rayon`, `sekretaris_umum`, `bendahara_umum`, `kepala_bidang`, `koordinator_biro`, `anggota`.

## Bootstrap admin pertama

1. Buka website SIGAP dan daftar dengan email admin yang akan digunakan.
2. Verifikasi email tersebut dari kotak masuk.
3. Buka Supabase Dashboard → SQL Editor.
4. Buka file `bootstrap_first_admin.sql`, ganti `GANTI_DENGAN_EMAIL_ADMIN@CONTOH.COM` dengan email terverifikasi, lalu jalankan.
5. Masuk kembali ke website. Akun tersebut kini menjadi Admin Sistem.
6. Buat periode kepengurusan dari Panel Admin, lalu setujui dan tetapkan role pendaftar lainnya.

Bootstrap admin hanya perlu dilakukan satu kali. Jangan memberikan akses SQL Editor atau secret key kepada pengguna biasa.

## Keamanan

- `config.js` hanya berisi URL proyek dan publishable key. Publishable key memang digunakan pada browser; keamanan data ditegakkan oleh RLS.
- Jangan pernah menambahkan `service_role` key atau secret key ke `config.js`, `app.js`, atau file frontend lainnya.
- Role dan status persetujuan disimpan di tabel database, bukan di metadata yang dapat diubah sendiri oleh pengguna.
- Struktur organisasi, periode, role, evaluasi, skor, dan laporan dibatasi oleh kebijakan RLS.
- Lihat Security Advisor sebelum membuka akses produksi atau menambahkan kebijakan baru.

## Tabel inti

`profiles`, `org_units`, `evaluation_periods`, `memberships`, `evaluation_criteria`, `evaluations`, `evaluation_scores`, `activity_reports`, `audit_logs`.

## Catatan pengembangan

Skema aktif sudah dipasang langsung pada project Supabase. Perubahan DDL berikutnya perlu dicatat sebagai file migration SQL pada repository ini agar perubahan database dapat ditinjau dan direproduksi.
