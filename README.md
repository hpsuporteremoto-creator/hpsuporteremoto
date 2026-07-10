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

## Acesso operacional

O acesso é definido dinamicamente no Supabase Auth, por
`auth.users.app_metadata.role`. Roles aceitos:

- `admin`: acessa todo o sistema, incluindo financeiro, usuários e cancelamento
  de atendimento.
- `vendedor`: acessa o fluxo de criação de pedido a partir de cliente ativo.

Para compatibilidade, `auth.users.app_metadata.is_admin=true` continua sendo
tratado como admin. A tela `/admin/usuarios` é o caminho operacional para criar
usuários e alterar o role. A função SQL `public.is_admin()` deve considerar
`app_metadata.role='admin'` ou `app_metadata.is_admin=true`; a migration
`0021_role_based_access.sql` atualiza essa regra.

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
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
```

`RESEND_API_KEY` é usada somente pelas Functions do módulo de Marketing e deve
ser criada como secret no projeto Pages `hpsuporteremoto`; nunca a inclua em
arquivos versionados. O remetente padrão é `HP Suporte
<contato@hpsuporteremoto.com.br>` e o domínio precisa estar verificado no
Resend.

Os dados do recebedor do PIX são configurados no próprio sistema em
`/admin/financeiro/recebedor-pix`. A tela grava a chave PIX, nome do recebedor
e cidade na tabela `pix_recebedor_config`, usada pela função
`functions/api/generate-pix.ts` na hora de gerar o BR Code.

`PIX_KEY`, `PIX_RECEIVER_NAME` e `PIX_RECEIVER_CITY` ainda podem existir como
fallback legado de runtime, mas não são a forma principal de configuração.

## Marketing por email

O módulo `/admin/marketing` é exclusivo de administradores e permite:

- listar a base comercial com email e WhatsApp;
- exportar emails e celulares em CSV;
- segmentar uma campanha pelos clientes que compraram determinado serviço;
- enviar um teste, enviar imediatamente ou agendar uma campanha;
- registrar campanhas, destinatários e eventos de entrega.

O envio usa Resend Broadcasts. Os clientes existentes recebem consentimento
comercial inicial pela migration `0028_email_marketing.sql`; o consentimento
pode ser alterado na edição do cliente. Campanhas só usam clientes ativos,
com email válido e consentimento ativo.

Para atualizar automaticamente aberturas, entregas, falhas e descadastros,
crie um webhook no Resend apontando para:

```txt
https://hpsuporteremoto.com.br/api/resend-webhook
```

Selecione eventos `email.*` e `contact.updated`, copie o signing secret para
`RESEND_WEBHOOK_SECRET` e mantenha-o como secret de Pages.

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
