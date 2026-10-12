-- current_org_id() is a leftover twin of current_user_org_id(): no policy,
-- function or app code calls it, yet signed-in users could execute it (a
-- SECURITY DEFINER function flagged by the Supabase security advisor).
-- Nobody needs it, so nobody may call it; the function itself stays.
revoke execute on function public.current_org_id() from public, anon, authenticated;
