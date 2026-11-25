-- SIGAP PMII FEBI: global presentation settings and admin-only customization.
-- Public may read these non-sensitive display settings. Only a system admin may edit them.

create table if not exists public.system_settings (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'SIGAP PMII FEBI'
    check (char_length(btrim(app_name)) between 3 and 60),
  app_subtitle text not null default 'Sistem Informasi Evaluasi Kepengurusan'
    check (char_length(btrim(app_subtitle)) between 3 and 100),
  login_headline text not null default 'Merawat amanah. Menumbuhkan gerakan.'
    check (char_length(btrim(login_headline)) between 3 and 100),
  login_description text not null default 'Ruang digital pengurus PMII Fakultas Ekonomi dan Bisnis Islam untuk mengelola struktur, mengukur kinerja, dan menyusun evaluasi bersama.'
    check (char_length(btrim(login_description)) between 3 and 300),
  theme_preset text not null default 'navy_gold'
    check (theme_preset in ('navy_gold','ocean_blue','forest_green')),
  compact_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

revoke all on table public.system_settings from public, anon, authenticated;
grant select on table public.system_settings to anon, authenticated;
grant insert, update on table public.system_settings to authenticated;

drop policy if exists system_settings_public_read on public.system_settings;
create policy system_settings_public_read
  on public.system_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists system_settings_admin_insert on public.system_settings;
create policy system_settings_admin_insert
  on public.system_settings
  for insert
  to authenticated
  with check ((select private.is_system_admin()));

drop policy if exists system_settings_admin_update on public.system_settings;
create policy system_settings_admin_update
  on public.system_settings
  for update
  to authenticated
  using ((select private.is_system_admin()))
  with check ((select private.is_system_admin()));

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

comment on table public.system_settings is
  'Public-safe SIGAP presentation settings. Only active system admins may change settings; no credentials or private user data are stored here.';

-- Keep the structural name synchronized between manual roster and linked account.
update public.member_roster
set full_name = 'Fina Amelia', updated_at = now()
where id = 'd5712027-802b-4513-a7cf-d680eb31e564'::uuid
  and full_name = 'Fina Amalia';

update public.profiles
set full_name = 'Fina Amelia', updated_at = now()
where id = '530476ee-096c-4b18-a392-16647ad979ae'::uuid
  and full_name <> 'Fina Amelia';

update public.memberships
set position_title = 'Sekretaris II Bidang Eksternal'
where id = 'cd861d44-9093-4a36-89ee-f45c7ffc773f'::uuid
  and position_title <> 'Sekretaris II Bidang Eksternal';
