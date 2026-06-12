create table if not exists public.user_login_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  device_hash text not null,
  device_label text not null,
  user_agent text,
  ip_address text,
  country text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

create index if not exists user_login_devices_user_last_seen_idx
  on public.user_login_devices (user_id, last_seen_at desc);

create index if not exists user_login_devices_last_seen_idx
  on public.user_login_devices (last_seen_at desc);

alter table public.user_login_devices enable row level security;

drop policy if exists "Users read own login devices" on public.user_login_devices;
create policy "Users read own login devices"
  on public.user_login_devices for select
  using (auth.uid() = user_id);

drop policy if exists "Admins read login devices" on public.user_login_devices;
create policy "Admins read login devices"
  on public.user_login_devices for select
  using (public.is_admin());

drop trigger if exists user_login_devices_updated_at on public.user_login_devices;
create trigger user_login_devices_updated_at
  before update on public.user_login_devices
  for each row execute function public.touch_updated_at();
