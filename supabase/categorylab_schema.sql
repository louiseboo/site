create extension if not exists pgcrypto;

create table if not exists public.categorylab_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'viewer'
    check (role in ('owner', 'pm', 'viewer', 'supplier')),
  supplier_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_feedback_records (
  id uuid primary key default gen_random_uuid(),
  edit_token_hash text not null,
  followup_code text,
  product_name text not null,
  supplier_name text not null,
  version_label text,
  sample_date date,
  version_change text,
  finished_spec text,
  ingredients_structure text,
  image_paths jsonb not null default '[]'::jsonb,
  quote_rmb numeric(12, 2),
  core_ingredients_selling_points text,
  tasting_scene text,
  tasting_feedback text,
  round_conclusion text,
  next_step_direction text,
  key_blocker text,
  status text not null default '待处理'
    check (status in ('待处理', '已确认')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplier_feedback_records
  add column if not exists followup_code text;

alter table public.supplier_feedback_records
  drop constraint if exists supplier_feedback_records_status_check;

update public.supplier_feedback_records
set status = '已确认'
where status in ('已导入', '已归档');

alter table public.supplier_feedback_records
  add constraint supplier_feedback_records_status_check
  check (status in ('待处理', '已确认'));

create index if not exists supplier_feedback_records_created_at_idx
  on public.supplier_feedback_records (created_at desc);

create index if not exists supplier_feedback_records_supplier_idx
  on public.supplier_feedback_records (supplier_name);

create unique index if not exists supplier_feedback_records_followup_code_idx
  on public.supplier_feedback_records (followup_code)
  where followup_code is not null;

create or replace function public.categorylab_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categorylab_profiles_updated_at on public.categorylab_profiles;
create trigger categorylab_profiles_updated_at
before update on public.categorylab_profiles
for each row execute function public.categorylab_set_updated_at();

drop trigger if exists supplier_feedback_records_updated_at on public.supplier_feedback_records;
create trigger supplier_feedback_records_updated_at
before update on public.supplier_feedback_records
for each row execute function public.categorylab_set_updated_at();

create or replace function public.categorylab_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.categorylab_profiles p
    where p.id = auth.uid()
      and p.role = any(allowed_roles)
  );
$$;

create or replace function public.categorylab_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categorylab_profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_categorylab on auth.users;
create trigger on_auth_user_created_categorylab
after insert on auth.users
for each row execute function public.categorylab_handle_new_user();

create or replace function public.categorylab_hash_token(raw_token text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(extensions.digest(coalesce(raw_token, '')::text, 'sha256'::text), 'hex');
$$;

create or replace function public.categorylab_quote_to_numeric(raw_quote text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text := nullif(regexp_replace(coalesce(raw_quote, ''), '[^0-9.]', '', 'g'), '');
begin
  if cleaned is null then
    return null;
  end if;
  if cleaned ~ '^[0-9]+(\.[0-9]{1,2})?$' then
    return cleaned::numeric;
  end if;
  return null;
end;
$$;

create or replace function public.categorylab_generate_followup_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
    exit when not exists (
      select 1
      from public.supplier_feedback_records
      where followup_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

update public.supplier_feedback_records
set followup_code = upper(substr(replace(id::text, '-', ''), 1, 8))
where followup_code is null;

create or replace function public.categorylab_public_record(record_row public.supplier_feedback_records)
returns jsonb
language sql
stable
set search_path = public
as $$
  select to_jsonb(record_row) - 'edit_token_hash';
$$;

create or replace function public.submit_supplier_feedback(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_row public.supplier_feedback_records;
  v_product_name text := nullif(btrim(p_payload ->> 'product_name'), '');
  v_supplier_name text := nullif(btrim(p_payload ->> 'supplier_name'), '');
begin
  if v_product_name is null then
    raise exception '品名不能为空';
  end if;

  if v_supplier_name is null then
    raise exception '供应商不能为空';
  end if;

  insert into public.supplier_feedback_records (
    id,
    edit_token_hash,
    followup_code,
    product_name,
    supplier_name,
    version_label,
    sample_date,
    version_change,
    finished_spec,
    ingredients_structure,
    image_paths,
    quote_rmb,
    core_ingredients_selling_points,
    tasting_scene,
    tasting_feedback,
    round_conclusion,
    next_step_direction,
    key_blocker,
    created_by,
    status
  )
  values (
    v_id,
    public.categorylab_hash_token(v_token),
    public.categorylab_generate_followup_code(),
    v_product_name,
    v_supplier_name,
    nullif(btrim(p_payload ->> 'version_label'), ''),
    nullif(p_payload ->> 'sample_date', '')::date,
    nullif(btrim(p_payload ->> 'version_change'), ''),
    nullif(btrim(p_payload ->> 'finished_spec'), ''),
    nullif(btrim(p_payload ->> 'ingredients_structure'), ''),
    coalesce(p_payload -> 'image_paths', '[]'::jsonb),
    public.categorylab_quote_to_numeric(p_payload ->> 'quote_rmb'),
    nullif(btrim(p_payload ->> 'core_ingredients_selling_points'), ''),
    nullif(btrim(p_payload ->> 'tasting_scene'), ''),
    nullif(btrim(p_payload ->> 'tasting_feedback'), ''),
    nullif(btrim(p_payload ->> 'round_conclusion'), ''),
    nullif(btrim(p_payload ->> 'next_step_direction'), ''),
    nullif(btrim(p_payload ->> 'key_blocker'), ''),
    auth.uid(),
    '待处理'
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_id,
    'edit_token', v_token,
    'record', public.categorylab_public_record(v_row)
  );
end;
$$;

create or replace function public.get_supplier_feedback_by_followup_code(p_followup_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supplier_feedback_records;
begin
  select *
  into v_row
  from public.supplier_feedback_records
  where followup_code = upper(btrim(coalesce(p_followup_code, '')));

  if not found then
    raise exception '提交编号不存在';
  end if;

  return public.categorylab_public_record(v_row);
end;
$$;

create or replace function public.complete_supplier_feedback(p_followup_code text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supplier_feedback_records;
begin
  update public.supplier_feedback_records
  set
    tasting_scene = nullif(btrim(p_payload ->> 'tasting_scene'), ''),
    tasting_feedback = nullif(btrim(p_payload ->> 'tasting_feedback'), ''),
    round_conclusion = nullif(btrim(p_payload ->> 'round_conclusion'), ''),
    next_step_direction = nullif(btrim(p_payload ->> 'next_step_direction'), '')
  where followup_code = upper(btrim(coalesce(p_followup_code, '')))
  returning * into v_row;

  if not found then
    raise exception '提交编号不存在';
  end if;

  return public.categorylab_public_record(v_row);
end;
$$;

create or replace function public.get_supplier_feedback_for_edit(p_id uuid, p_edit_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supplier_feedback_records;
begin
  select *
  into v_row
  from public.supplier_feedback_records
  where id = p_id
    and edit_token_hash = public.categorylab_hash_token(p_edit_token);

  if not found then
    raise exception '记录不存在或修改链接无效';
  end if;

  return public.categorylab_public_record(v_row);
end;
$$;

create or replace function public.update_supplier_feedback(p_id uuid, p_edit_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supplier_feedback_records;
  v_product_name text := nullif(btrim(p_payload ->> 'product_name'), '');
  v_supplier_name text := nullif(btrim(p_payload ->> 'supplier_name'), '');
begin
  if v_product_name is null then
    raise exception '品名不能为空';
  end if;

  if v_supplier_name is null then
    raise exception '供应商不能为空';
  end if;

  update public.supplier_feedback_records
  set
    product_name = v_product_name,
    supplier_name = v_supplier_name,
    version_label = nullif(btrim(p_payload ->> 'version_label'), ''),
    sample_date = nullif(p_payload ->> 'sample_date', '')::date,
    version_change = nullif(btrim(p_payload ->> 'version_change'), ''),
    finished_spec = nullif(btrim(p_payload ->> 'finished_spec'), ''),
    ingredients_structure = nullif(btrim(p_payload ->> 'ingredients_structure'), ''),
    image_paths = coalesce(p_payload -> 'image_paths', image_paths),
    quote_rmb = public.categorylab_quote_to_numeric(p_payload ->> 'quote_rmb'),
    core_ingredients_selling_points = nullif(btrim(p_payload ->> 'core_ingredients_selling_points'), ''),
    tasting_scene = nullif(btrim(p_payload ->> 'tasting_scene'), ''),
    tasting_feedback = nullif(btrim(p_payload ->> 'tasting_feedback'), ''),
    round_conclusion = nullif(btrim(p_payload ->> 'round_conclusion'), ''),
    next_step_direction = nullif(btrim(p_payload ->> 'next_step_direction'), ''),
    key_blocker = nullif(btrim(p_payload ->> 'key_blocker'), '')
  where id = p_id
    and edit_token_hash = public.categorylab_hash_token(p_edit_token)
  returning * into v_row;

  if not found then
    raise exception '记录不存在或修改链接无效';
  end if;

  return public.categorylab_public_record(v_row);
end;
$$;

alter table public.categorylab_profiles enable row level security;
alter table public.supplier_feedback_records enable row level security;

drop policy if exists "profiles read own or owner" on public.categorylab_profiles;
create policy "profiles read own or owner"
on public.categorylab_profiles
for select
to authenticated
using (id = auth.uid() or public.categorylab_has_role(array['owner']));

drop policy if exists "profiles owner update" on public.categorylab_profiles;
create policy "profiles owner update"
on public.categorylab_profiles
for update
to authenticated
using (public.categorylab_has_role(array['owner']))
with check (public.categorylab_has_role(array['owner']));

drop policy if exists "supplier feedback internal read" on public.supplier_feedback_records;
create policy "supplier feedback internal read"
on public.supplier_feedback_records
for select
to authenticated
using (public.categorylab_has_role(array['owner', 'pm', 'viewer']));

drop policy if exists "supplier feedback supplier read own" on public.supplier_feedback_records;
create policy "supplier feedback supplier read own"
on public.supplier_feedback_records
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "supplier feedback internal update" on public.supplier_feedback_records;
create policy "supplier feedback internal update"
on public.supplier_feedback_records
for update
to authenticated
using (public.categorylab_has_role(array['owner', 'pm']))
with check (public.categorylab_has_role(array['owner', 'pm']));

drop policy if exists "supplier feedback internal delete" on public.supplier_feedback_records;
create policy "supplier feedback internal delete"
on public.supplier_feedback_records
for delete
to authenticated
using (public.categorylab_has_role(array['owner', 'pm']));

revoke all on function public.submit_supplier_feedback(jsonb) from public;
revoke all on function public.get_supplier_feedback_for_edit(uuid, text) from public;
revoke all on function public.update_supplier_feedback(uuid, text, jsonb) from public;
revoke all on function public.get_supplier_feedback_by_followup_code(text) from public;
revoke all on function public.complete_supplier_feedback(text, jsonb) from public;
grant execute on function public.submit_supplier_feedback(jsonb) to anon, authenticated;
grant execute on function public.get_supplier_feedback_for_edit(uuid, text) to anon, authenticated;
grant execute on function public.update_supplier_feedback(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.get_supplier_feedback_by_followup_code(text) to anon, authenticated;
grant execute on function public.complete_supplier_feedback(text, jsonb) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-feedback-images',
  'supplier-feedback-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "supplier feedback images public read" on storage.objects;
create policy "supplier feedback images public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'supplier-feedback-images');

drop policy if exists "supplier feedback images upload" on storage.objects;
create policy "supplier feedback images upload"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'supplier-feedback-images');

drop policy if exists "supplier feedback images internal delete" on storage.objects;
create policy "supplier feedback images internal delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'supplier-feedback-images'
  and public.categorylab_has_role(array['owner', 'pm'])
);
