-- SIGAP PMII FEBI
-- Signups do not require email-link verification. Every new email account is
-- confirmed by the database, then remains pending until an authorized leader acts.
create or replace function private.auto_confirm_sigap_email_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.email is not null
     and coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email'
     and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function private.auto_confirm_sigap_email_signup() from public, anon, authenticated;
drop trigger if exists sigap_auto_confirm_email_signup on auth.users;
create trigger sigap_auto_confirm_email_signup
before insert on auth.users
for each row execute function private.auto_confirm_sigap_email_signup();

create or replace function private.can_approve_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_system_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      join public.evaluation_periods ep on ep.id = m.period_id
      where m.user_id = (select auth.uid())
        and m.status = 'active'::public.membership_status
        and p.account_status = 'active'::public.account_status
        and ep.status = 'active'::public.period_status
        and m.role in (
          'ketua_rayon'::public.app_role,
          'sekretaris_umum'::public.app_role,
          'bendahara_umum'::public.app_role,
          'kepala_bidang'::public.app_role
        )
    );
$function$;
revoke all on function private.can_approve_accounts() from public;
grant execute on function private.can_approve_accounts() to authenticated;

create or replace function private.guard_profile_account_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.account_status is distinct from old.account_status
     and (select auth.uid()) is not null
     and not private.is_system_admin()
     and current_setting('sigap.account_approval', true) is distinct from 'allowed' then
    raise exception 'Account status can only be changed through the approved leadership workflow';
  end if;
  return new;
end;
$function$;

create or replace function private.approve_pending_account(
  p_target_user_id uuid,
  p_approve boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_new_status public.account_status;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if not private.can_approve_accounts() then
    raise exception 'Only Ketua Rayon, Sekretaris Umum, Bendahara Umum, Kepala Bidang, or system admin can approve registrations';
  end if;

  v_new_status := case
    when coalesce(p_approve, true) then 'active'::public.account_status
    else 'rejected'::public.account_status
  end;

  perform set_config('sigap.account_approval', 'allowed', true);

  update public.profiles
  set account_status = v_new_status, updated_at = now()
  where id = p_target_user_id
    and account_status = 'pending'::public.account_status;

  if not found then
    raise exception 'Pending account not found or it has already been processed';
  end if;

  return jsonb_build_object('user_id', p_target_user_id, 'account_status', v_new_status);
end;
$function$;
revoke all on function private.approve_pending_account(uuid, boolean) from public, anon;
grant execute on function private.approve_pending_account(uuid, boolean) to authenticated;

create or replace function public.approve_pending_account(
  p_target_user_id uuid,
  p_approve boolean default true
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.approve_pending_account(p_target_user_id, p_approve);
$function$;
revoke all on function public.approve_pending_account(uuid, boolean) from public, anon;
grant execute on function public.approve_pending_account(uuid, boolean) to authenticated;

drop policy if exists profiles_select_pending_for_approvers on public.profiles;
create policy profiles_select_pending_for_approvers
on public.profiles
for select
to authenticated
using (
  account_status = 'pending'::public.account_status
  and private.can_approve_accounts()
);

notify pgrst, 'reload schema';
