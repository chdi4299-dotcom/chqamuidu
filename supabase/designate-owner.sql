-- Run only in a trusted Supabase SQL editor/psql session as the database owner.
-- Replace the marker with the UUID of your one real, pre-created Auth user.
-- This deliberately fails if the marker is unchanged or the Auth user does not exist.
begin;
insert into vezlio_private.owner_config (singleton, auth_user_id)
values (true, 'REPLACE_WITH_REAL_SUPABASE_AUTH_USER_UUID'::uuid)
on conflict (singleton) do update set auth_user_id = excluded.auth_user_id;
commit;
-- Set SUPABASE_OWNER_UUID to the exact same UUID in server runtime environment.
-- Never grant browser roles privileges on vezlio_private or add an owner-management API.
