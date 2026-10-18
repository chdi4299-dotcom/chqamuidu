begin;

revoke create on schema public from public, anon, authenticated;

-- Owner configuration is intentionally outside the exposed public schema.
create schema if not exists vezlio_private;
revoke all on schema vezlio_private from public, anon, authenticated;
create table vezlio_private.owner_config (
  singleton boolean primary key default true check (singleton),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict
);
alter table vezlio_private.owner_config enable row level security;
revoke all on table vezlio_private.owner_config from public, anon, authenticated;
-- No owner is seeded. Until a database administrator designates one, access is denied.

create function public.vezlio_is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select auth.uid()) is not null
    and (select auth.jwt()->>'aal') = 'aal2'
    and (select auth.jwt()->>'role') = 'authenticated'
    and exists (
      select 1 from vezlio_private.owner_config c
      where c.singleton and c.auth_user_id = (select auth.uid())
    ), false
  );
$$;
revoke all on function public.vezlio_is_owner() from public;
grant execute on function public.vezlio_is_owner() to anon, authenticated;

create table public.vezlio_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in ('Entertainment', 'Creative', 'AI & Productivity', 'Other')),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  compatibility text check (char_length(compatibility) <= 300),
  authorization_notes text check (char_length(authorization_notes) <= 3000),
  legitimacy_confirmed boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not published or legitimacy_confirmed)
);
create table public.vezlio_packages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.vezlio_products(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  duration text check (char_length(duration) <= 120),
  price_lkr numeric(12,2) check (price_lkr >= 0 and price_lkr <= 99999999.99),
  availability text not null default 'contact' check (availability in ('contact', 'available', 'unavailable')),
  support_terms text check (char_length(support_terms) <= 1500),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vezlio_packages_product_id on public.vezlio_packages(product_id);

create table public.vezlio_services (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique check (service_code ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  platform text not null check (platform in ('YouTube', 'Instagram', 'TikTok', 'Facebook', 'Telegram', 'WhatsApp')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  method text not null check (method in ('paid_advertising', 'content_strategy', 'creator_outreach', 'community_promotion')),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  scope text check (char_length(scope) <= 300),
  price_lkr numeric(12,2) check (price_lkr >= 0 and price_lkr <= 99999999.99),
  estimated_delivery text check (char_length(estimated_delivery) <= 300),
  support_terms text check (char_length(support_terms) <= 1500),
  compliance_notes text check (char_length(compliance_notes) <= 3000),
  legitimacy_confirmed boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not published or legitimacy_confirmed)
);
create table public.vezlio_contact_settings (
  singleton boolean primary key default true check (singleton),
  whatsapp_number text check (whatsapp_number ~ '^[1-9][0-9]{9,14}$'),
  telegram_url text check (telegram_url ~ '^https://t[.]me/[A-Za-z0-9_]{5,32}/?$'),
  support_email text check (char_length(support_email) <= 254 and support_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  support_note text check (char_length(support_note) <= 500),
  updated_at timestamptz not null default now()
);
-- Contact destinations explicitly provided by the owner; no products, prices or orders seeded.
insert into public.vezlio_contact_settings(singleton, whatsapp_number, telegram_url)
values (true, '94788245211', 'https://t.me/VEZLIO');

create function vezlio_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'created_at' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function vezlio_private.touch_updated_at() from public, anon, authenticated;

-- No policies for customers/anon, no writable role fields, no service-role bypass in the app.
do $$
declare t text;
begin
  foreach t in array array['vezlio_products','vezlio_packages','vezlio_services','vezlio_contact_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('create policy owner_mfa_only on public.%I for all to authenticated using ((select public.vezlio_is_owner())) with check ((select public.vezlio_is_owner()))', t);
    -- Restrictive guard prevents a future permissive policy from bypassing owner/MFA.
    execute format('create policy owner_mfa_guard on public.%I as restrictive for all to public using ((select public.vezlio_is_owner())) with check ((select public.vezlio_is_owner()))', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function vezlio_private.touch_updated_at()', t);
  end loop;
end;
$$;
-- The contact singleton cannot be created/deleted through the application.
revoke insert, delete on public.vezlio_contact_settings from authenticated;

-- Deliberate public projection. The definer reads protected tables but only returns
-- reviewed, published records and public contact fields. Never add internal notes here.
create function public.vezlio_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'category', p.category,
      'description', p.description, 'compatibility', p.compatibility,
      'packages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'duration', k.duration,
        'price_lkr', k.price_lkr, 'availability', k.availability, 'support_terms', k.support_terms
      ) order by k.created_at) from public.vezlio_packages k
        where k.product_id = p.id and k.published), '[]'::jsonb)
    ) order by p.created_at) from public.vezlio_products p
      where p.published and p.legitimacy_confirmed), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'service_code', s.service_code, 'platform', s.platform,
      'name', s.name, 'method', s.method, 'description', s.description,
      'scope', s.scope, 'price_lkr', s.price_lkr,
      'estimated_delivery', s.estimated_delivery, 'support_terms', s.support_terms
    ) order by s.platform, s.created_at) from public.vezlio_services s
      where s.published and s.legitimacy_confirmed), '[]'::jsonb),
    'contacts', coalesce((select jsonb_build_object(
      'whatsappNumber', c.whatsapp_number, 'telegramUrl', c.telegram_url,
      'supportEmail', c.support_email, 'supportNote', c.support_note
    ) from public.vezlio_contact_settings c where c.singleton), '{}'::jsonb)
  );
$$;
revoke all on function public.vezlio_public_catalog() from public;
grant execute on function public.vezlio_public_catalog() to anon, authenticated;
comment on function public.vezlio_public_catalog() is 'Public allowlisted catalogue only. No owner UUID, private notes, drafts, customers, orders or payments.';

commit;
