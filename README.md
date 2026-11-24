# SIGAP PMII FEBI

**Sistem Informasi Evaluasi dan Penilaian Kepengurusan** untuk Pergerakan Mahasiswa Islam Indonesia, Fakultas Ekonomi dan Bisnis Islam.

SIGAP membantu pengurus mengelola struktur rayon, bidang, biro, keanggotaan, periode kepengurusan, penilaian kinerja, evaluasi tertulis, dan laporan kegiatan.

## Teknologi

- GitHub Pages — hosting frontend statis.
- HTML, CSS, JavaScript — antarmuka web.
- Supabase Auth — autentikasi.
- Supabase PostgreSQL + Row Level Security — data dan kontrol akses.

## Fitur aplikasi

- Registrasi tanpa verifikasi email; akun baru menunggu persetujuan.
- Persetujuan pendaftaran oleh Ketua Rayon, Sekretaris Umum, Bendahara Umum, atau Kepala Bidang; koordinator biro dan anggota tidak dapat menyetujui.
- Pengelolaan role dan unit organisasi sesuai struktur PMII FEBI, termasuk Sekretaris Bidang sejajar dengan Kepala Bidang.
- Data anggota nominal dapat dicatat oleh pimpinan unit tanpa anggota harus mendaftar atau memiliki akun SIGAP.
- Penilaian dan evaluasi dapat ditulis untuk anggota nominal, lengkap dengan cetak rapor per orang.
- Penilaian kinerja biro sebagai satu unit, termasuk cetak rapor biro.
- Direktori struktur organisasi publik yang menampilkan nama dan jabatan tanpa membuka penilaian, evaluasi, email, atau NIM.
- Batas akses penilaian: Ketua Rayon seluruh unit; Kepala Bidang bidang dan semua biro di bawahnya (termasuk melihat penilaian Sekretaris Bidang); Sekretaris Bidang biro di bawahnya; Koordinator Biro hanya biro sendiri.
- Periode kepengurusan.
- Penilaian dengan enam indikator berbobot dan skala 1–5.
- Evaluasi tertulis, rekomendasi perbaikan, dan tinjau admin.
- Laporan kegiatan dengan edit draft, pengiriman untuk ditinjau, persetujuan penanggung jawab, dan permintaan revisi.
- Jejak audit perubahan penting.

## Struktur organisasi awal

Ketua Rayon → Sekretaris Umum dan Bendahara Umum → Kepala Bidang serta Sekretaris Bidang pada Bidang I (Internal), II (Eksternal), III (Kajian) → koordinator biro → anggota.

- Internal: Kaderisasi, PAPO.
- Eksternal: Entrepreneur, HKOG, Soshum, Medinfo.
- Kajian: Keilmuan, Keperempuanan, Keagamaan.

## Menjalankan / menerbitkan website

Website diterbitkan oleh workflow GitHub Pages bawaan repository pada setiap push ke branch `main`. Workflow `.github/workflows/deploy.yml` disimpan sebagai pemeriksaan/deploy manual melalui menu Actions agar tidak bertabrakan dengan workflow Pages otomatis.

Pengaturan GitHub Pages:
1. Repository → Settings → Pages.
2. Pastikan build and deployment menggunakan GitHub Actions.
3. Pantau hasilnya pada tab Actions.

## Langkah aktivasi awal

1. Periksa konfigurasi Supabase pada `config.js`. URL dan publishable key proyek sudah diisi.
2. Daftar melalui website menggunakan email admin pertama.
3. Email pendaftar baru otomatis dikonfirmasi oleh database, tetapi akun tetap berstatus menunggu persetujuan.
4. Ikuti instruksi di [supabase/README.md](supabase/README.md) dan jalankan [bootstrap admin pertama](supabase/bootstrap_first_admin.sql) melalui Supabase SQL Editor.
5. Ketua Rayon, Sekretaris Umum, Bendahara Umum, Kepala Bidang, atau Admin Sistem dapat menyetujui/menolak pendaftar dari menu **Persetujuan akun**. Penempatan jabatan dan unit tetap diatur Admin Sistem.

## Keamanan

Publishable key boleh berada di frontend. **Jangan pernah** meletakkan Supabase service-role key atau secret key di repository frontend. Seluruh tabel aplikasi dilindungi RLS; pemberian role dilakukan melalui database oleh admin.

Lihat dokumentasi Supabase untuk [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security). Skema terbaru untuk struktur publik, penilaian biro, dan pembatasan lingkup jabatan didokumentasikan di [supabase/03_public_structure_bureau_scoring_hierarchy.sql](supabase/03_public_structure_bureau_scoring_hierarchy.sql).
