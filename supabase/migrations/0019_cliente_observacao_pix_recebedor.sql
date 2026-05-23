-- Observação de cliente e configuração administrável do recebedor PIX.

alter table public.clientes
  add column if not exists observacao text;

create table if not exists public.pix_recebedor_config (
  id smallint primary key default 1 check (id = 1),
  pix_key text not null default '',
  receiver_name text not null default '',
  receiver_city text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pix_recebedor_config (id)
values (1)
on conflict (id) do nothing;

alter table public.pix_recebedor_config enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pix_recebedor_config'
      and policyname = 'Admin manage pix recebedor config'
  ) then
    create policy "Admin manage pix recebedor config"
      on public.pix_recebedor_config
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'pix_recebedor_config_updated_at'
      and tgrelid = 'public.pix_recebedor_config'::regclass
  ) then
    create trigger pix_recebedor_config_updated_at
      before update on public.pix_recebedor_config
      for each row execute function public.touch_updated_at();
  end if;
end;
$$;

notify pgrst, 'reload schema';
