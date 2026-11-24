-- Add the parallel Sekretaris Bidang role. Keep this in its own migration
-- because PostgreSQL requires a newly added enum value to commit before use.
alter type public.app_role add value if not exists 'sekretaris_bidang';
