# SIGAP PMII FEBI

**Sistem Informasi Evaluasi dan Penilaian Kepengurusan** untuk Pergerakan Mahasiswa Islam Indonesia, Fakultas Ekonomi dan Bisnis Islam.

SIGAP membantu pengurus mengelola struktur rayon, bidang, biro, keanggotaan, periode kepengurusan, penilaian kinerja, evaluasi tertulis, dan laporan kegiatan.

## Teknologi

- GitHub Pages — hosting frontend statis.
- HTML, CSS, JavaScript — antarmuka web.
- Supabase Auth — autentikasi.
- Supabase PostgreSQL + Row Level Security — data dan kontrol akses.

## Fitur aplikasi

- Registrasi, login, dan persetujuan akun admin.
- Pengelolaan role dan unit organisasi sesuai struktur PMII FEBI.
- Periode kepengurusan.
- Penilaian dengan enam indikator berbobot dan skala 1–5.
- Evaluasi tertulis, rekomendasi perbaikan, dan tinjau admin.
- Laporan kegiatan dengan edit draft, pengiriman untuk ditinjau, persetujuan penanggung jawab, dan permintaan revisi.
- Jejak audit perubahan penting.

## Struktur organisasi awal

Ketua Rayon → Sekretaris Umum dan Bendahara Umum → Kepala Bidang I (Internal), II (Eksternal), III (Kajian) → biro.

- Internal: Kaderisasi, PAPO.
- Eksternal: Entrepreneur, HKOG, Soshum, Medinfo.
- Kajian: Keilmuan, Keperempuanan, Keagamaan.

## Menjalankan / menerbitkan website

Repository ini memakai GitHub Pages dan workflow pada `.github/workflows/deploy.yml`. Setiap perubahan pada branch `main` memicu proses deploy.

Pengaturan GitHub Pages:
1. Repository → Settings → Pages.
2. Pastikan build and deployment menggunakan GitHub Actions.
3. Pantau hasilnya pada tab Actions.

## Langkah aktivasi awal

1. Periksa konfigurasi Supabase pada `config.js`. URL dan publishable key proyek sudah diisi.
2. Daftar melalui website menggunakan email admin pertama.
3. Verifikasi email.
4. Ikuti instruksi di [supabase/README.md](supabase/README.md) dan jalankan [bootstrap admin pertama](supabase/bootstrap_first_admin.sql) melalui Supabase SQL Editor.
5. Masuk sebagai admin, buat periode aktif, setujui pendaftar, lalu tetapkan jabatan dan unit.

## Keamanan

Publishable key boleh berada di frontend. **Jangan pernah** meletakkan Supabase service-role key atau secret key di repository frontend. Seluruh tabel aplikasi dilindungi RLS; pemberian role dilakukan melalui database oleh admin.

Lihat dokumentasi Supabase untuk [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
