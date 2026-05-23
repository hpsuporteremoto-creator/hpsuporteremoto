# HP Suporte Remoto

Sistema administrativo de suporte remoto para operação ponta a ponta.

## Stack

- Angular 22, standalone components, signals e lazy routes.
- Supabase Auth, Postgres, RLS e Realtime.
- Apache ECharts com `ngx-echarts` no dashboard administrativo.
- Cloudflare Pages para hospedagem.
- Cloudflare Pages Functions para endpoints admin em `/api/*`.
- GitHub Actions para deploy automático na `main`.

## URLs

- Admin: <https://hpsuporteremoto.com.br/admin>
- Raiz: <https://hpsuporteremoto.com.br> redireciona para `/admin`.

## Fluxos

### Admin

O admin acessa `/admin`, usa o drawer responsivo para navegar e pode fazer o pedido inteiro sem depender do cliente:

1. Abre o **Dashboard** para ver KPIs, fila por status e receita.
2. Abre **Novo atendimento**.
3. Preenche cliente, serviços, desconto opcional e descrição.
4. O pedido é criado já em `em_andamento`.
5. No detalhe do atendimento, finaliza e gera PIX.
6. Copia o BR Code se necessário.
7. Marca como pago e conclui.

### Serviços

O catálogo administrativo separa serviços ativos e inativos em abas. Cada
serviço possui nome, categoria selecionada, descrição, URL opcional de imagem,
valor e status. Categorias de serviço são gerenciadas em um CRUD próprio em
`/admin/servicos/categorias`; não são preenchidas como texto livre no cadastro
do serviço.

## Admins

Admins ficam sincronizados em:

- `src/app/core/auth/admin-emails.ts`
- função SQL `public.is_admin()`
- Cloudflare Pages Functions em `functions/api/*`

Emails atuais:

- `heriveltonpiresalves@gmail.com`
- `hpsuporteremoto@gmail.com`
- `thiagoprazeres@gmail.com`

## Desenvolvimento local

Instale dependências:

```bash
npm install
```

Aplicação administrativa:

```bash
npm start
```

Build:

```bash
npm run build
```

O build gera apenas:

- `dist/hp-suporte-remoto-client/browser`

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

Os dados do recebedor do PIX ficam nesses três secrets da Cloudflare Pages:

| Secret | Uso |
| --- | --- |
| `PIX_KEY` | Chave PIX do recebedor |
| `PIX_RECEIVER_NAME` | Nome do recebedor impresso no BR Code |
| `PIX_RECEIVER_CITY` | Cidade do recebedor impresso no BR Code |

Eles podem ser ajustados em **Cloudflare Dashboard > Workers & Pages > hpsuporteremoto > Settings > Environment variables** ou pelo Wrangler:

```bash
npx wrangler pages secret put PIX_KEY --project-name=hpsuporteremoto
npx wrangler pages secret put PIX_RECEIVER_NAME --project-name=hpsuporteremoto
npx wrangler pages secret put PIX_RECEIVER_CITY --project-name=hpsuporteremoto
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
3. Publica o app no projeto Pages `hpsuporteremoto`.

O ADMIN é servido pela rota `/admin`; a raiz do domínio redireciona para essa rota.

DNS esperado na Cloudflare:

```txt
CNAME  @      hpsuporteremoto.pages.dev
CNAME  www    hpsuporteremoto.pages.dev
```

## Estrutura

```txt
src/app/
  core/
    auth/
    supabase/
  features/
    admin/
      layout/             # shell responsivo com drawer
      dashboard/          # KPIs e charts com Apache ECharts
      atendimentos/       # lista, detalhe e criação manual
      clientes/
      servicos/
      financeiro/
      usuarios/
  client.routes.ts        # app administrativo com redirect da raiz para /admin

functions/api/
  create-user.ts
  delete-user.ts
  generate-pix.ts

supabase/migrations/
```

## Comandos úteis

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o app admin em dev |
| `npm run build` | Builda o app admin |
| `npm run build:client` | Builda o mesmo app admin |
