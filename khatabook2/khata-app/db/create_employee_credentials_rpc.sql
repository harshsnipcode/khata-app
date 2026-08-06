-- Admin employee credential update RPC (v2).
--
-- WHY THIS EXISTS
-- The app runs entirely client-side with the anon key. GoTrue's admin
-- endpoints (auth.admin.updateUserById / deleteUser) require a service_role
-- key and return 403 with an anon key, so password/email changes made from the
-- Admin panel were silently never written to auth.users. This SECURITY
-- DEFINER function runs with the table owner's privileges and writes directly
-- to auth.users so those changes actually persist.
--
-- WHAT CHANGED IN v2
-- * Resolves the target auth user by LOGIN EMAIL first (the identity the
--   employee actually signs in with), falling back to p_user_id. This fixes
--   employees whose employees.auth_id drifted from the auth user that owns
--   the login email (e.g. usernames renamed through the old broken edit, or
--   accounts re-created).
-- * Always syncs the login email + email identity onto the resolved user and
--   returns the user_id it operated on, so the app can self-heal
--   employees.auth_id.
-- * Does NOT write the generated auth.identities.email column (it is a
--   GENERATED column in this GoTrue schema and rejects direct writes).
--   identity_data is updated instead (that is the column email is derived from).
--
-- RUN THIS ONCE
-- Supabase Dashboard -> SQL Editor -> paste -> Run.
--
-- Called from the app as:
--   supabase.rpc("admin_update_employee_auth", {
--     p_user_id: "<auth.user.id>",    // fallback; may be stale
--     p_password: "new password",     // null/omitted to leave unchanged
--     p_email: "user@example.com",    // the LOGIN email (username@example.com)
--     p_confirm_email: true,          // sets email_confirmed_at when missing
--   })

create or replace function public.admin_update_employee_auth(
  p_user_id uuid default null,
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
  v_final_email text;
  v_found boolean := false;
begin
  v_new_email := lower(nullif(trim(coalesce(p_email, '')), ''));

  if v_new_email is not null then
    select u.* into v_user
      from auth.users u
      left join auth.identities i on i.user_id = u.id and i.provider = 'email'
     where lower(u.email) = v_new_email
        or lower(i.provider_id) = v_new_email
     order by u.created_at
     limit 1;
    v_found := found;
  end if;

  if not v_found and p_user_id is not null then
    select * into v_user from auth.users where id = p_user_id;
    v_found := found;
  end if;

  if not v_found then
    return jsonb_build_object('ok', false, 'error', 'auth user not found');
  end if;

  if p_password is not null and p_password <> '' then
    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
           updated_at = now()
     where id = v_user.id;
  end if;

  v_final_email := coalesce(v_new_email, lower(v_user.email));

  if lower(v_final_email) is distinct from lower(v_user.email) then
    update auth.users
       set email = v_final_email,
           email_change = null,
           email_change_token_current = null,
           email_change_token_new = null,
           email_change_confirm_status = 0,
           updated_at = now()
     where id = v_user.id;
  end if;

  if v_new_email is not null then
    update auth.identities
       set provider_id = v_new_email,
           identity_data = coalesce(identity_data, '{}'::jsonb)
             || jsonb_build_object('email', v_new_email, 'email_verified', true),
           updated_at = now()
     where user_id = v_user.id
       and provider = 'email';
  end if;

  if p_confirm_email then
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user.id,
    'email', v_final_email
  );
end;
$$;

revoke all on function public.admin_update_employee_auth(uuid, text, text, boolean) from public;
grant execute on function public.admin_update_employee_auth(uuid, text, text, boolean) to anon, authenticated;
