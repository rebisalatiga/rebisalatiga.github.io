-- SIGAP PMII FEBI: bootstrap admin pertama
-- Jalankan sekali di Supabase Dashboard > SQL Editor SETELAH admin pertama mendaftar
-- dan memverifikasi emailnya di website.
--
-- WAJIB: ganti alamat email di bawah dengan email akun Anda yang sudah terdaftar.
-- Jangan membagikan akses SQL Editor kepada pengguna biasa.

do $$
declare
  v_admin_email text := lower('GANTI_DENGAN_EMAIL_ADMIN@CONTOH.COM');
  v_admin_id uuid;
  v_rayon_id uuid;
begin
  select u.id
    into v_admin_id
  from auth.users u
  where lower(u.email) = v_admin_email
    and u.email_confirmed_at is not null
  limit 1;

  if v_admin_id is null then
    raise exception 'Akun dengan email tersebut belum ditemukan atau email belum diverifikasi. Daftar dan verifikasi email terlebih dahulu.';
  end if;

  select id into v_rayon_id
  from public.org_units
  where code = 'pmii-febi'
  limit 1;

  if v_rayon_id is null then
    raise exception 'Unit PMII FEBI belum ditemukan. Periksa seed org_units.';
  end if;

  update public.profiles
  set account_status = 'active',
      updated_at = now()
  where id = v_admin_id;

  if not exists (
    select 1 from public.memberships
    where user_id = v_admin_id
      and role = 'admin'
      and status = 'active'
  ) then
    insert into public.memberships (
      user_id, unit_id, period_id, role, status, position_title, assigned_by
    )
    values (
      v_admin_id, v_rayon_id, null, 'admin', 'active',
      'Admin Sistem', v_admin_id
    );
  end if;
end;
$$;

-- Setelah berhasil:
-- 1. Masuk ke website menggunakan akun email tersebut.
-- 2. Buka Panel Admin.
-- 3. Buat periode kepengurusan (misalnya 2026–2027).
-- 4. Setujui pendaftar dan tetapkan role/unit masing-masing.
