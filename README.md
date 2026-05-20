# HP suporte remoto

Sistema de suporte remoto com fluxo público para clientes e painel administrativo para operação ponta a ponta.

## Stack

- Angular 22, standalone components, signals e lazy routes.
- Supabase Auth, Postgres, RLS e Realtime.
- Apache ECharts com `ngx-echarts` no dashboard administrativo.
- Cloudflare Pages para hospedagem.
- Cloudflare Pages Functions para endpoints admin em `/api/*`.
- GitHub Actions para deploy automático na `main`.

## URLs

- Cliente: <https://www.hpsuporteremoto.com.br>
- Admin principal: <https://hpsuporteremoto.com.br/admin>
- Admin em subdomínio: <https://admin.hpsuporteremoto.com.br> pode continuar existindo, mas `/admin` no domínio principal é a entrada oficial.

## Fluxos

### Cliente

1. Escolhe um ou mais serviços.
2. Informa WhatsApp.
3. Preenche solicitação.
4. Informa credenciais RustDesk, se souber.
5. Aguarda o admin aceitar ou recusar.
6. Vê QR Code PIX quando o admin finaliza o atendimento.
7. Acompanha conclusão.

### Admin

O admin acessa `/admin`, usa o drawer responsivo para navegar e pode fazer o pedido inteiro sem depender do cliente:

1. Abre o **Dashboard** para ver KPIs, fila por status e receita.
2. Abre **Novo atendimento**.
3. Preenche cliente, serviços, descrição e RustDesk opcional.
4. O pedido é criado já em `em_andamento`.
5. No detalhe do atendimento, finaliza e gera PIX.
6. Copia o BR Code se necessário.
7. Marca como pago e conclui.

## Admins

Admins ficam sincronizados em:

- `src/app/core/auth/admin-emails.ts`
- função SQL `public.is_admin()`
- Cloudflare Pages Functions em `functions/api/*`

Emails atuais:

- `heriveltonpiresalves@gmail.com`
- `hpsuporteremoto@gmail.com`

## Desenvolvimento local

Instale dependências:

```bash
npm install
```

Cliente principal:

```bash
npm start
```

Admin em app separado, útil para validar o subdomínio:

```bash
npm run start:admin
```

Build completo:

```bash
npm run build
```

O build gera:

- `dist/hp-suporte-remoto-client/browser`
- `dist/hp-suporte-remoto-admin/browser`

## Variáveis

A anon key do Supabase fica em `src/environments/environment.ts` e é pública.

Secrets de runtime das Pages Functions:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PIX_KEY
PIX_RECEIVER_NAME
PIX_RECEIVER_CITY
```

Secrets do GitHub Actions:

```txt
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

O token da Cloudflare para deploy precisa permitir editar Cloudflare Pages. Para mexer em DNS pelo CLI/API, também precisa de permissão `Zone DNS Edit`.

## Deploy Cloudflare Pages

O workflow `.github/workflows/deploy.yml` roda em push na `main`:

1. Instala dependências com `npm ci`.
2. Executa `npm run build`.
3. Publica o cliente no projeto Pages `hpsuporteremoto`.
4. Publica o admin separado no projeto Pages `hpsuporteremoto-admin`.
5. Garante o domínio customizado `admin.hpsuporteremoto.com.br`.

DNS esperado na Cloudflare:

```txt
CNAME  @      hpsuporteremoto.pages.dev
CNAME  www    hpsuporteremoto.pages.dev
CNAME  admin  hpsuporteremoto-admin.pages.dev
```

## Estrutura

```txt
src/app/
  core/
    auth/
    notifications/
    supabase/
  features/
    atendimento/          # fluxo público do cliente
    admin/
      layout/             # shell responsivo com drawer
      dashboard/          # KPIs e charts com Apache ECharts
      atendimentos/       # lista, detalhe e criação manual
      clientes/
      servicos/
      financeiro/
      usuarios/
  client.routes.ts        # app público com /admin oficial
  admin-app.routes.ts     # app do subdomínio admin

functions/api/
  create-user.ts
  delete-user.ts
  generate-pix.ts

supabase/migrations/
```

## Comandos úteis

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o app cliente em dev |
| `npm run start:admin` | Sobe o app admin separado na porta 4300 |
| `npm run build` | Builda cliente e admin |
| `npm run build:client` | Builda só o cliente |
| `npm run build:admin` | Builda só o admin |
