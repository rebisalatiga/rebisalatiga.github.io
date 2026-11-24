-- SIGAP PMII FEBI — safe public organization directory projection
-- The public chart must be visible to anonymous visitors and signed-in users.
-- It must not require SELECT access to profiles, memberships, or member_roster.

begin;

create table if not exists public.org_structure_directory (
  source_type text not null check (source_type in ('membership','roster')),
  source_id uuid not null,
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  unit_id uuid not null references public.org_units(id) on delete cascade,
  person_name text not null,
  person_role text not null,
  person_position text not null,
  is_active boolean not null default true,
  primary key (source_type,source_id)
);

alter table public.org_structure_directory enable row level security;

revoke all on table public.org_structure_directory from public, anon, authenticated;
grant select (period_id,unit_id,person_name,person_role,person_position,is_active,source_type)
  on public.org_structure_directory to anon, authenticated;

drop policy if exists org_structure_directory_public_read on public.org_structure_directory;
create policy org_structure_directory_public_read
  on public.org_structure_directory
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.evaluation_periods ep
      where ep.id=org_structure_directory.period_id
        and ep.status='active'::public.period_status
    )
  );

create or replace function private.refresh_public_structure_directory()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.org_structure_directory;

  insert into public.org_structure_directory
    (source_type,source_id,period_id,unit_id,person_name,person_role,person_position,is_active)
  select
    'membership',m.id,m.period_id,m.unit_id,p.full_name,m.role::text,
    coalesce(
      m.position_title,
      case m.role
        when 'ketua_rayon'::public.app_role then 'Ketua Rayon'
        when 'sekretaris_umum'::public.app_role then 'Sekretaris Umum'
        when 'bendahara_umum'::public.app_role then 'Bendahara Umum'
        when 'kepala_bidang'::public.app_role then 'Kepala Bidang'
        when 'sekretaris_bidang'::public.app_role then 'Sekretaris Bidang'
        when 'koordinator_biro'::public.app_role then 'Koordinator Biro'
        else 'Anggota'
      end
    ),
    true
  from public.memberships m
  join public.profiles p on p.id=m.user_id
  join public.evaluation_periods ep on ep.id=m.period_id
  join public.org_units u on u.id=m.unit_id
  where m.status='active'::public.membership_status
    and p.account_status='active'::public.account_status
    and ep.status='active'::public.period_status
    and u.is_active=true
    and m.role <> 'admin'::public.app_role;

  insert into public.org_structure_directory
    (source_type,source_id,period_id,unit_id,person_name,person_role,person_position,is_active)
  select
    'roster',r.id,r.period_id,r.unit_id,r.full_name,'anggota',
    coalesce(r.position_title,'Anggota'),true
  from public.member_roster r
  join public.evaluation_periods ep on ep.id=r.period_id
  join public.org_units u on u.id=r.unit_id
  where r.is_active=true
    and ep.status='active'::public.period_status
    and u.is_active=true
    and not exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id=m.user_id
      where m.period_id=r.period_id
        and m.unit_id=r.unit_id
        and m.status='active'::public.membership_status
        and p.account_status='active'::public.account_status
        and lower(trim(p.full_name))=lower(trim(r.full_name))
    );
end;
$function$;

create or replace function private.refresh_public_structure_directory_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.refresh_public_structure_directory();
  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.refresh_public_structure_directory() from public, anon, authenticated;
revoke all on function private.refresh_public_structure_directory_trigger() from public, anon, authenticated;

drop trigger if exists sync_directory_from_memberships on public.memberships;
create trigger sync_directory_from_memberships
after insert or update or delete on public.memberships
for each row execute function private.refresh_public_structure_directory_trigger();

drop trigger if exists sync_directory_from_roster on public.member_roster;
create trigger sync_directory_from_roster
after insert or update or delete on public.member_roster
for each row execute function private.refresh_public_structure_directory_trigger();

drop trigger if exists sync_directory_from_profiles on public.profiles;
create trigger sync_directory_from_profiles
after insert or update or delete on public.profiles
for each row execute function private.refresh_public_structure_directory_trigger();

drop trigger if exists sync_directory_from_periods on public.evaluation_periods;
create trigger sync_directory_from_periods
after insert or update or delete on public.evaluation_periods
for each row execute function private.refresh_public_structure_directory_trigger();

drop trigger if exists sync_directory_from_units on public.org_units;
create trigger sync_directory_from_units
after insert or update or delete on public.org_units
for each row execute function private.refresh_public_structure_directory_trigger();

create or replace view public.public_organization_structure
with (security_invoker = true, security_barrier = true)
as
select
  u.id as unit_id,
  u.parent_id,
  u.code as unit_code,
  u.name as unit_name,
  u.unit_type::text as unit_type,
  u.sort_order,
  ep.name as period_name,
  d.person_name,
  d.person_role,
  d.person_position,
  d.source_type as person_source
from public.org_units u
left join public.evaluation_periods ep
  on ep.status='active'::public.period_status
left join public.org_structure_directory d
  on d.unit_id=u.id
 and d.period_id=ep.id
 and d.is_active=true
where u.is_active=true;

comment on table public.org_structure_directory is
  'Public-safe structure projection: names, roles, positions, unit IDs and active period only. No NIM, email, auth IDs, scores or evaluations.';

drop policy if exists profiles_public_directory_read on public.profiles;
drop policy if exists memberships_public_directory_read on public.memberships;
drop policy if exists member_roster_public_directory_read on public.member_roster;

revoke all privileges on table public.profiles from anon;
revoke all privileges (id,full_name,account_status) on table public.profiles from anon;
revoke all privileges on table public.memberships from anon;
revoke all privileges (user_id,unit_id,period_id,status,role,position_title)
  on table public.memberships from anon;
revoke all privileges on table public.member_roster from anon;
revoke all privileges (unit_id,period_id,full_name,position_title,is_active)
  on table public.member_roster from anon;

revoke all on public.public_organization_structure from public;
grant select on public.public_organization_structure to anon, authenticated;

select private.refresh_public_structure_directory();

commit;
