-- Admin employee credential update RPC.
--
-- WHY THIS EXISTS
-- The app runs entirely client-side with the anon key. GoTrue's admin
-- endpoints (auth.admin.updateUserById / deleteUser) require a service_role
-- key and return 403 with an anon key, so password/email changes made from the
-- Admin panel were silently never written to auth.users. This SECURITY
-- DEFINER function runs with the table owner's privileges and writes directly
-- to auth.users so those changes actually persist.
--
-- RUN THIS ONCE
-- Supabase Dashboard -> SQL Editor -> paste -> Run.
--
-- Called from the app as:
--   supabase.rpc("admin_update_employee_auth", {
--     p_user_id: "<auth.user.id>",
--     p_password: "new password",    // null/omitted to leave unchanged
--     p_email: "user@example.com",   // null/omitted to leave unchanged
--     p_confirm_email: true,         // sets email_confirmed_at when missing
--   })

create or replace function public.admin_update_employee_auth(
  p_user_id uuid,
  p_password text default null,
  p_email text default null,
  p_confirm_email boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user auth.users%rowtype;
  v_new_email text;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing user id');
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'auth user not found');
  end if;

  if p_password is not null and p_password <> '' then
    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
           updated_at = now()
     where id = p_user_id;
  end if;

  v_new_email := coalesce(nullif(p_email, ''), v_user.email);

  if v_new_email is distinct from v_user.email then
    update auth.users
       set email = v_new_email,
           email_change = null,
           email_change_token_current = null,
           email_change_token_new = null,
           email_change_confirm_status = 0,
           updated_at = now()
     where id = p_user_id;

    update auth.identities
       set email = v_new_email,
           provider_id = v_new_email,
           updated_at = now()
     where user_id = p_user_id
       and provider = 'email';
  end if;

  if p_confirm_email then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = p_user_id;
  end if;

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end;
$$;

revoke all on function public.admin_update_employee_auth(uuid, text, text, boolean) from public;
grant execute on function public.admin_update_employee_auth(uuid, text, text, boolean) to anon, authenticated;
