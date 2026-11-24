-- SIGAP PMII FEBI: roster names without login accounts + report-card evaluations.
-- Run after 01_add_secretary_bidang_role.sql.

create table public.member_roster (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete restrict,
  unit_id uuid not null references public.org_units(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  nim text,
  cohort text,
  position_title text not null default 'Anggota',
  linked_user_id uuid references auth.users(id) on delete set null,
  created_by_membership_id uuid not null references public.memberships(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index member_roster_period_unit_idx on public.member_roster(period_id, unit_id, is_active);
create index member_roster_created_by_idx on public.member_roster(created_by_membership_id);
create unique index member_roster_nim_period_uidx
  on public.member_roster(period_id, nim)
  where nim is not null and length(trim(nim)) > 0;

alter table public.evaluations
  alter column subject_membership_id drop not null,
  add column subject_roster_id uuid references public.member_roster(id) on delete restrict;
alter table public.evaluations
  add constraint evaluations_exactly_one_subject_check
  check (
    (subject_membership_id is not null and subject_roster_id is null)
    or (subject_membership_id is null and subject_roster_id is not null)
  );

alter table public.member_roster enable row level security;
grant select, insert, update, delete on public.member_roster to authenticated;

create or replace function private.validate_membership_assignment()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  target_type public.org_unit_type;
  target_code text;
begin
  select unit_type, code into target_type, target_code
  from public.org_units where id = new.unit_id;

  if new.role = 'admin'::public.app_role then
    if new.period_id is not null or target_type <> 'rayon' then
      raise exception 'System admin must be assigned to the Rayon unit without an evaluation period';
    end if;
  else
    if new.period_id is null then
      raise exception 'A period is required for organizational memberships';
    end if;

    if new.role = 'ketua_rayon'::public.app_role and target_code <> 'pmii-febi' then
      raise exception 'Ketua Rayon must be assigned to the PMII FEBI Rayon unit';
    elsif new.role = 'sekretaris_umum'::public.app_role and target_code <> 'sekretaris-umum' then
      raise exception 'Sekretaris Umum must be assigned to the Sekretaris Umum unit';
    elsif new.role = 'bendahara_umum'::public.app_role and target_code <> 'bendahara-umum' then
      raise exception 'Bendahara Umum must be assigned to the Bendahara Umum unit';
    elsif new.role in ('kepala_bidang'::public.app_role, 'sekretaris_bidang'::public.app_role)
      and target_type <> 'field' then
      raise exception 'Kepala Bidang and Sekretaris Bidang must be assigned to a field unit';
    elsif new.role in ('koordinator_biro'::public.app_role, 'anggota'::public.app_role)
      and target_type <> 'bureau' then
      raise exception 'Koordinator and Anggota must be assigned to a bureau';
    end if;
  end if;

  if new.status = 'active'::public.membership_status and not exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.account_status = 'active'::public.account_status
  ) then
    raise exception 'The account must be active before assigning an organizational role';
  end if;
  return new;
end;
$function$;

drop index if exists public.membership_single_leadership_seat;
create unique index membership_single_leadership_seat
  on public.memberships(period_id, unit_id, role)
  where status = 'active'::public.membership_status
    and role in (
      'ketua_rayon'::public.app_role,
      'sekretaris_umum'::public.app_role,
      'bendahara_umum'::public.app_role,
      'kepala_bidang'::public.app_role,
      'sekretaris_bidang'::public.app_role,
      'koordinator_biro'::public.app_role
    );

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
  managed_units(unit_id) as (
    select a.unit_id
    from active_actor a
    where a.role in (
      'sekretaris_umum'::public.app_role,
      'bendahara_umum'::public.app_role,
      'koordinator_biro'::public.app_role
    )
    union
    select a.unit_id
    from active_actor a
    where a.role in (
      'kepala_bidang'::public.app_role,
      'sekretaris_bidang'::public.app_role
    )
    union
    select child.id
    from public.org_units child
    join managed_units parent on child.parent_id = parent.unit_id
    where child.is_active = true
      and exists (
        select 1 from active_actor a
        where a.unit_id = parent.unit_id
          and a.role in (
            'kepala_bidang'::public.app_role,
            'sekretaris_bidang'::public.app_role
          )
      )
  )
  select private.is_system_admin()
    or exists (select 1 from active_actor a where a.role = 'ketua_rayon'::public.app_role)
    or target_unit_id in (select mu.unit_id from managed_units mu);
$function$;
revoke all on function private.can_manage_unit(uuid) from public;
grant execute on function private.can_manage_unit(uuid) to authenticated;

create or replace function private.validate_member_roster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period_status public.period_status;
  v_creator_user_id uuid;
  v_creator_period_id uuid;
  v_creator_role public.app_role;
begin
  select ep.status into v_period_status
  from public.evaluation_periods ep
  where ep.id = new.period_id;

  if v_period_status is distinct from 'active'::public.period_status then
    raise exception 'Roster entries can only be changed in the active management period';
  end if;

  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      select m.user_id, m.period_id, m.role
        into v_creator_user_id, v_creator_period_id, v_creator_role
      from public.memberships m
      where m.id = new.created_by_membership_id
        and m.status = 'active'::public.membership_status;

      if v_creator_user_id is distinct from (select auth.uid())
         or not (
           v_creator_period_id = new.period_id
           or (v_creator_role = 'admin'::public.app_role
               and v_creator_period_id is null
               and private.is_system_admin())
         )
         or not private.can_manage_unit(new.unit_id) then
        raise exception 'You cannot manage this roster unit';
      end if;
    else
      if new.created_by_membership_id is distinct from old.created_by_membership_id
         or not private.can_manage_unit(new.unit_id) then
        raise exception 'You cannot manage this roster entry';
      end if;
    end if;
  end if;

  new.full_name := trim(new.full_name);
  new.nim := nullif(trim(coalesce(new.nim, '')), '');
  new.cohort := nullif(trim(coalesce(new.cohort, '')), '');
  new.position_title := coalesce(nullif(trim(new.position_title), ''), 'Anggota');
  return new;
end;
$function$;
drop trigger if exists member_roster_validate on public.member_roster;
create trigger member_roster_validate
before insert or update on public.member_roster
for each row execute function private.validate_member_roster();
drop trigger if exists member_roster_set_updated_at on public.member_roster;
create trigger member_roster_set_updated_at
before update on public.member_roster
for each row execute function public.set_updated_at();

drop policy if exists member_roster_read_authorized on public.member_roster;
create policy member_roster_read_authorized
on public.member_roster for select to authenticated
using (private.can_view_unit(unit_id));
drop policy if exists member_roster_insert_managed on public.member_roster;
create policy member_roster_insert_managed
on public.member_roster for insert to authenticated
with check (
  private.can_manage_unit(unit_id)
  and exists (
    select 1 from public.evaluation_periods ep
    where ep.id = period_id and ep.status = 'active'::public.period_status
  )
);
drop policy if exists member_roster_update_managed on public.member_roster;
create policy member_roster_update_managed
on public.member_roster for update to authenticated
using (private.can_manage_unit(unit_id))
with check (private.can_manage_unit(unit_id));
drop policy if exists member_roster_delete_managed on public.member_roster;
create policy member_roster_delete_managed
on public.member_roster for delete to authenticated
using (private.can_manage_unit(unit_id));

create or replace function private.can_evaluate(target_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.memberships target
    join public.profiles target_profile on target_profile.id = target.user_id
    where target.id = target_membership_id
      and target.status = 'active'::public.membership_status
      and target_profile.account_status = 'active'::public.account_status
      and (
        target.user_id = (select auth.uid())
        or private.is_system_admin()
        or private.can_manage_unit(target.unit_id)
      )
  );
$function$;

create or replace function private.can_evaluate_roster(target_roster_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.member_roster r
    join public.evaluation_periods ep on ep.id = r.period_id
    where r.id = target_roster_id
      and r.is_active = true
      and ep.status = 'active'::public.period_status
      and private.can_manage_unit(r.unit_id)
  );
$function$;
revoke all on function private.can_evaluate_roster(uuid) from public;
grant execute on function private.can_evaluate_roster(uuid) to authenticated;

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
        or (e.subject_membership_id is not null and private.can_evaluate(e.subject_membership_id))
        or (e.subject_roster_id is not null and private.can_evaluate_roster(e.subject_roster_id))
        or private.can_view_unit(coalesce(subject.unit_id, roster.unit_id))
      )
  );
$function$;

drop policy if exists evaluations_insert_authorized on public.evaluations;
create policy evaluations_insert_authorized
on public.evaluations for insert to authenticated
with check (
  status = 'draft'::public.evaluation_status
  and exists (
    select 1
    from public.memberships evaluator
    where evaluator.id = evaluator_membership_id
      and evaluator.user_id = (select auth.uid())
      and evaluator.status = 'active'::public.membership_status
      and (
        evaluator.period_id = period_id
        or (evaluator.role = 'admin'::public.app_role and evaluator.period_id is null)
      )
  )
  and (
    (
      subject_membership_id is not null
      and private.can_evaluate(subject_membership_id)
      and exists (
        select 1 from public.memberships subject
        where subject.id = subject_membership_id
          and subject.period_id = period_id
          and subject.status = 'active'::public.membership_status
      )
    )
    or
    (
      subject_roster_id is not null
      and private.can_evaluate_roster(subject_roster_id)
      and exists (
        select 1 from public.member_roster roster
        where roster.id = subject_roster_id
          and roster.period_id = period_id
      )
    )
  )
);

drop policy if exists evaluations_update_evaluator_or_admin on public.evaluations;
create policy evaluations_update_evaluator_or_admin
on public.evaluations for update to authenticated
using (
  private.is_system_admin()
  or (
    status = 'draft'::public.evaluation_status
    and exists (
      select 1 from public.memberships evaluator
      where evaluator.id = evaluator_membership_id
        and evaluator.user_id = (select auth.uid())
    )
  )
)
with check (
  private.is_system_admin()
  or (
    status in ('draft'::public.evaluation_status, 'submitted'::public.evaluation_status)
    and exists (
      select 1 from public.memberships evaluator
      where evaluator.id = evaluator_membership_id
        and evaluator.user_id = (select auth.uid())
        and (
          evaluator.period_id = period_id
          or (evaluator.role = 'admin'::public.app_role and evaluator.period_id is null)
        )
    )
    and (
      (
        subject_membership_id is not null
        and private.can_evaluate(subject_membership_id)
        and exists (
          select 1 from public.memberships subject
          where subject.id = subject_membership_id
            and subject.period_id = period_id
        )
      )
      or
      (
        subject_roster_id is not null
        and private.can_evaluate_roster(subject_roster_id)
        and exists (
          select 1 from public.member_roster roster
          where roster.id = subject_roster_id and roster.period_id = period_id
        )
      )
    )
  )
);

notify pgrst, 'reload schema';
