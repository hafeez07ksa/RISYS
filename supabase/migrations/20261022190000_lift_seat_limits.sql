-- Seat limits are no longer a product concept.
--
-- The console stopped asking for a plan, a user limit and a storage quota
-- (22 Oct 2026). The columns stay, because create_invitation() and
-- accept_invitation() still compare membership against max_members, but every
-- company is set to the ceiling those functions and
-- platform_create_organization() accept (10000), so the check can never be the
-- reason someone cannot join a workspace.
--
-- plan and storage_quota_gb are left as they are: nothing enforces them.
--
-- Data-only plus a column default. Safe to re-run.

alter table public.organizations alter column max_members set default 10000;

update public.organizations
   set max_members = 10000
 where max_members < 10000;
