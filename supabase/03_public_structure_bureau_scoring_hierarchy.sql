-- SIGAP PMII FEBI
-- Public structural directory, bureau-level evaluations, and hierarchical manager scopes.
-- This migration reflects the schema changes already applied to the connected Supabase project.

begin;

-- 1) Allow an evaluation to target one bureau as a whole, in addition to a user or nominal member.
alter table public.evaluations
  add column if not exists subject_unit_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.evaluations'::regclass
      and conname='evaluations_subject_unit_id_fkey'
  ) then
    alter table public.evaluations
      add constraint evaluations_subject_unit_id_fkey
      foreign key (subject_unit_id) references public.org_units(id) on delete restrict;
  end if;
end $$;

alter table public.evaluations
  drop constraint if exists evaluations_exactly_one_subject_check;

alter table public.evaluations
  add constraint evaluations_exactly_one_subject_check
  check (num_nonnulls(subject_membership_id, subject_roster_id, subject_unit_id) = 1);

create index if not exists evaluations_subject_unit_id_idx
  on public.evaluations(subject_unit_id)
  where subject_unit_id is not null;

create unique index if not exists evaluations_unique_unit_subject_per_evaluator
  on public.evaluations(period_id, evaluator_membership_id, subject_unit_id)
  where subject_unit_id is not null;

create index if not exists evaluations_subject_roster_id_idx
  on public.evaluations(subject_roster_id)
  where subject_roster_id is not null;

create index if not exists member_roster_linked_user_id_idx
  on public.member_roster(linked_user_id)
  where linked_user_id is not null;

create index if not exists member_roster_unit_id_idx
  on public.member_roster(unit_id);

-- 2) Authorization hierarchy:
-- Ketua Rayon/Admin: all units.
-- Kepala Bidang: its field and all descendant bureaus.
-- Sekretaris Bidang: bureaus under its field, but not the field itself.
-- Koordinator Biro: own bureau only.
-- Sekretaris/Bendahara Umum: their own executive unit only.
create or replace function private.can_manage_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive active_actor as (
    select m.unit_id, m.role
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    join public.evaluation_periods ep on ep.id = m.period_id
    where m.user_id = (select auth.uid())
      and m.status = 'active'::public.membership_status
      and p.account_status = 'active'::public.account_status
      and ep.status = 'active'::public.period_status
  ),
  scoped_units(unit_id, root_id, actor_role) as (
    select a.unit_id, a.unit_id, a.role
    from active_actor a
    where a.role in (
      'kepala_bidang'::public.app_role,
      'sekretaris_bidang'::public.app_role
    )
    union all
    select child.id, parent.root_id, parent.actor_role
    from public.org_units child
    join scoped_units parent on child.parent_id = parent.unit_id
    where child.is_active = true
      and (
        parent.actor_role = 'kepala_bidang'::public.app_role
        or (
          parent.actor_role = 'sekretaris_bidang'::public.app_role
          and child.unit_type = 'bureau'::public.org_unit_type
        )
      )
  )
  select private.is_system_admin()
    or exists (
      select 1 from active_actor a
      where a.role = 'ketua_rayon'::public.app_role
    )
    or exists (
      select 1 from active_actor a
      where a.unit_id = target_unit_id
        and a.role in (
          'sekretaris_umum'::public.app_role,
          'bendahara_umum'::public.app_role,
          'koordinator_biro'::public.app_role
        )
    )
    or exists (
      select 1
      from scoped_units s
      join public.org_units u on u.id = s.unit_id
      where s.unit_id = target_unit_id
        and (
          s.actor_role = 'kepala_bidang'::public.app_role
          or (
            s.actor_role = 'sekretaris_bidang'::public.app_role
            and s.unit_id <> s.root_id
            and u.unit_type = 'bureau'::public.org_unit_type
          )
        )
    );
$function$;

create or replace function private.can_view_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_manage_unit(target_unit_id);
$function$;

create or replace function private.can_evaluate_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.org_units u
    where u.id = target_unit_id
      and u.unit_type = 'bureau'::public.org_unit_type
      and private.can_manage_unit(u.id)
  );
$function$;

grant execute on function private.can_evaluate_unit(uuid) to authenticated;

create or replace function private.can_read_evaluation(target_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.evaluations e
    join public.memberships evaluator on evaluator.id = e.evaluator_membership_id
    left join public.memberships subject on subject.id = e.subject_membership_id
    left join public.member_roster roster on roster.id = e.subject_roster_id
    where e.id = target_evaluation_id
      and (
        evaluator.user_id = (select auth.uid())
        or subject.user_id = (select auth.uid())
        or (
          e.subject_membership_id is not null
          and private.can_evaluate(e.subject_membership_id)
        )
        or (
          e.subject_roster_id is not null
          and private.can_evaluate_roster(e.subject_roster_id)
        )
        or (
          e.subject_unit_id is not null
          and private.can_evaluate_unit(e.subject_unit_id)
        )
        or private.can_view_unit(
          coalesce(subject.unit_id, roster.unit_id, e.subject_unit_id)
        )
      )
  );
$function$;

-- 3) Keep evaluation records and their scores scoped to the correct structural authority.
drop policy if exists evaluations_insert_authorized on public.evaluations;
create policy evaluations_insert_authorized
on public.evaluations
for insert
to authenticated
with check (
  status = 'draft'::public.evaluation_status
  and exists (
    select 1
    from public.memberships evaluator
    where evaluator.id = evaluations.evaluator_membership_id
      and evaluator.user_id = (select auth.uid())
      and evaluator.status = 'active'::public.membership_status
      and (
        evaluator.period_id = evaluations.period_id
        or (
          evaluator.role = 'admin'::public.app_role
          and evaluator.period_id is null
          and private.is_system_admin()
        )
      )
  )
  and (
    (
      evaluations.subject_membership_id is not null
      and private.can_evaluate(evaluations.subject_membership_id)
      and exists (
        select 1 from public.memberships subject
        where subject.id = evaluations.subject_membership_id
          and subject.period_id = evaluations.period_id
          and subject.status = 'active'::public.membership_status
      )
    )
    or (
      evaluations.subject_roster_id is not null
      and private.can_evaluate_roster(evaluations.subject_roster_id)
      and exists (
        select 1 from public.member_roster roster
        where roster.id = evaluations.subject_roster_id
          and roster.period_id = evaluations.period_id
          and roster.is_active = true
      )
    )
    or (
      evaluations.subject_unit_id is not null
      and private.can_evaluate_unit(evaluations.subject_unit_id)
      and exists (
        select 1 from public.evaluation_periods ep
        where ep.id = evaluations.period_id
          and ep.status = 'active'::public.period_status
      )
    )
  )
);

drop policy if exists evaluations_update_evaluator_or_admin on public.evaluations;
create policy evaluations_update_evaluator_or_admin
on public.evaluations
for update
to authenticated
using (
  private.is_system_admin()
  or (
    status = 'draft'::public.evaluation_status
    and exists (
      select 1 from public.memberships evaluator
      where evaluator.id = evaluations.evaluator_membership_id
        and evaluator.user_id = (select auth.uid())
    )
  )
)
with check (
  private.is_system_admin()
  or (
    status = any(array[
      'draft'::public.evaluation_status,
      'submitted'::public.evaluation_status
    ])
    and exists (
      select 1
      from public.memberships evaluator
      where evaluator.id = evaluations.evaluator_membership_id
        and evaluator.user_id = (select auth.uid())
        and evaluator.status = 'active'::public.membership_status
        and (
          evaluator.period_id = evaluations.period_id
          or (
            evaluator.role = 'admin'::public.app_role
            and evaluator.period_id is null
            and private.is_system_admin()
          )
        )
    )
    and (
      (
        evaluations.subject_membership_id is not null
        and private.can_evaluate(evaluations.subject_membership_id)
        and exists (
          select 1 from public.memberships subject
          where subject.id = evaluations.subject_membership_id
            and subject.period_id = evaluations.period_id
            and subject.status = 'active'::public.membership_status
        )
      )
      or (
        evaluations.subject_roster_id is not null
        and private.can_evaluate_roster(evaluations.subject_roster_id)
        and exists (
          select 1 from public.member_roster roster
          where roster.id = evaluations.subject_roster_id
            and roster.period_id = evaluations.period_id
            and roster.is_active = true
        )
      )
      or (
        evaluations.subject_unit_id is not null
        and private.can_evaluate_unit(evaluations.subject_unit_id)
        and exists (
          select 1 from public.evaluation_periods ep
          where ep.id = evaluations.period_id
            and ep.status = 'active'::public.period_status
        )
      )
    )
  )
);

-- 4) Anonymous visitors may read only names and roles in the active structure.
-- No email, NIM, phone, account credentials, scores, or evaluation notes are public.
grant select (id, parent_id, code, name, unit_type, sort_order, is_active)
  on public.org_units to anon;
grant select (id, name, status)
  on public.evaluation_periods to anon;
grant select (id, full_name, account_status)
  on public.profiles to anon;
grant select (user_id, unit_id, period_id, status, role, position_title)
  on public.memberships to anon;
grant select (unit_id, period_id, full_name, position_title, is_active)
  on public.member_roster to anon;

drop policy if exists org_units_public_directory_read on public.org_units;
create policy org_units_public_directory_read
  on public.org_units for select to anon
  using (is_active = true);

drop policy if exists evaluation_periods_public_directory_read on public.evaluation_periods;
create policy evaluation_periods_public_directory_read
  on public.evaluation_periods for select to anon
  using (status = 'active'::public.period_status);

drop policy if exists profiles_public_directory_read on public.profiles;
create policy profiles_public_directory_read
  on public.profiles for select to anon
  using (
    account_status = 'active'::public.account_status
    and exists (
      select 1
      from public.memberships m
      join public.evaluation_periods ep on ep.id = m.period_id
      where m.user_id = profiles.id
        and m.status = 'active'::public.membership_status
        and ep.status = 'active'::public.period_status
    )
  );

drop policy if exists memberships_public_directory_read on public.memberships;
create policy memberships_public_directory_read
  on public.memberships for select to anon
  using (
    status = 'active'::public.membership_status
    and exists (
      select 1 from public.evaluation_periods ep
      where ep.id = memberships.period_id
        and ep.status = 'active'::public.period_status
    )
  );

drop policy if exists member_roster_public_directory_read on public.member_roster;
create policy member_roster_public_directory_read
  on public.member_roster for select to anon
  using (
    is_active = true
    and exists (
      select 1 from public.evaluation_periods ep
      where ep.id = member_roster.period_id
        and ep.status = 'active'::public.period_status
    )
  );

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
  people.person_name,
  people.person_role,
  people.person_position,
  people.person_source
from public.org_units u
left join public.evaluation_periods ep
  on ep.status = 'active'::public.period_status
left join lateral (
  select
    p.full_name as person_name,
    m.role::text as person_role,
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
    ) as person_position,
    'akun'::text as person_source
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.unit_id = u.id
    and m.period_id = ep.id
    and m.status = 'active'::public.membership_status
    and p.account_status = 'active'::public.account_status

  union all

  select
    r.full_name as person_name,
    'anggota'::text as person_role,
    coalesce(r.position_title, 'Anggota') as person_position,
    'nominal'::text as person_source
  from public.member_roster r
  where r.unit_id = u.id
    and r.period_id = ep.id
    and r.is_active = true
) people on true
where u.is_active = true;

comment on view public.public_organization_structure is
  'Security-invoker public directory. Exposes only unit names, active structural names and positions; no email, NIM, scores or evaluations.';

revoke all on public.public_organization_structure from public;
grant select on public.public_organization_structure to anon, authenticated;


-- Consolidate authenticated profile SELECT rules into one policy.
drop policy if exists profiles_select_pending_for_approvers on public.profiles;
drop policy if exists profiles_select_self_or_visible_org on public.profiles;
drop policy if exists profiles_select_authorized on public.profiles;

create policy profiles_select_authorized
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or private.is_system_admin()
  or private.can_view_user(profiles.id)
  or (
    account_status = 'pending'::public.account_status
    and private.can_approve_accounts()
  )
);

commit;
