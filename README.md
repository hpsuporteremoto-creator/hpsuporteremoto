# HP suporte remoto

Sistema interno de suporte remoto. Frontend em Angular 22 SSR + autenticação Google via Supabase + Netlify Functions para operações admin (criação de usuários com `service_role`).

**Stack:**
- Angular 22 (SSR ativo, render mode `Client` em todas as rotas)
- Supabase (Auth + Postgres + RLS)
- Netlify (hospedagem do Angular SSR via `@netlify/angular-runtime` + Functions)
- Google OAuth (provider nativo do Supabase)

**Admins** (hardcoded em `src/app/core/auth/admin-emails.ts`, função SQL `public.is_admin()` e `netlify/functions/create-user.mts`):
- `heriveltonpiresalves@gmail.com`
- `hpsuporteremoto@gmail.com`

Apenas esses dois emails podem criar novos usuários. Sign-up aberto é desabilitado no Supabase, então só quem foi criado pelos admins consegue entrar.

---

## Setup inicial (faça uma vez)

### 1. Criar o projeto no Supabase

1. Vá em [supabase.com](https://supabase.com), faça login com `hpsuporteremoto@gmail.com`.
2. Crie um novo projeto (nome sugerido: **hp-suporte-remoto**, escolha uma região próxima).
3. Anote a **senha do banco**.
4. Em **Project Settings → API**, copie:
   - `Project URL` → use em `SUPABASE_URL`
   - `anon public` key → use em `SUPABASE_ANON_KEY`
   - `service_role` key → use em `SUPABASE_SERVICE_ROLE_KEY` ⚠️ NUNCA commitar nem expor no frontend

### 2. Aplicar a migration SQL

No dashboard do Supabase → **SQL Editor**, abra um novo query, cole o conteúdo de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) e execute.

Isso cria a tabela `profiles`, RLS, função `public.is_admin()` e trigger que cria o profile automaticamente quando um novo `auth.user` aparece.

### 3. Desabilitar sign-up aberto

No dashboard do Supabase → **Authentication → Providers → Email**: desligue `Enable Signup`.
Em **Authentication → Settings → User Signups**: desmarque `Allow new users to sign up`.

Resultado: só quem foi criado via `auth.admin.createUser` (rota `/api/create-user`) consegue logar.

### 4. Configurar Google OAuth

#### 4.1 Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto (ou use um existente).
2. **APIs & Services → OAuth consent screen**: configure como External, preencha nome do app, suporte e dev email.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:4200`, `https://SEU-DOMINIO-NETLIFY.netlify.app` (ajuste depois do deploy)
   - Authorized redirect URIs: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
4. Copie **Client ID** e **Client Secret**.

#### 4.2 Supabase

Em **Authentication → Providers → Google**:
- Ative o provider.
- Cole o Client ID e Client Secret do Google.
- Salve. Copie a `Callback URL (for OAuth)` que aparece — ela deve bater com o redirect URI configurado no Google.

#### 4.3 URLs autorizados

Em **Authentication → URL Configuration**:
- **Site URL**: `https://SEU-DOMINIO-NETLIFY.netlify.app`
- **Redirect URLs**: adicione `http://localhost:4200/`, `https://SEU-DOMINIO-NETLIFY.netlify.app/`

### 5. Criar os dois admins iniciais

Como sign-up está desabilitado, os 2 admins precisam ser pré-criados. No dashboard do Supabase → **SQL Editor**:

```sql
-- Cria os admins iniciais. Eles vão logar via Google com esses mesmos emails.
select auth.users.id from auth.admin_create_user(
  jsonb_build_object('email', 'heriveltonpiresalves@gmail.com', 'email_confirm', true)
);
select auth.users.id from auth.admin_create_user(
  jsonb_build_object('email', 'hpsuporteremoto@gmail.com', 'email_confirm', true)
);
```

*Alternativa via dashboard:* **Authentication → Users → Add user → Create new user**, marque "Auto Confirm User", deixe senha em branco (vai logar via Google).

### 6. Preencher `src/environments/environment.ts`

Substitua os placeholders pelos valores reais (a `anon key` é pública, pode ser commitada):

```ts
export const environment = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'eyJ...sua-anon-key',
};
```

---

## Rodar localmente

```bash
npm install
npm start
```

Abra http://localhost:4200/. Clique em "Entrar com Google" → autorize com um dos emails admin → vai pro `/`. O link "Painel admin" aparece pra admins.

⚠️ A função Netlify (`/api/create-user`) NÃO roda com `ng serve` puro. Pra testar localmente:

```bash
npx netlify dev
```

Isso sobe o Angular + functions na mesma porta com proxy.

Variáveis de ambiente locais (`.env` na raiz, **não commitar**):

```
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...sua-service-role-key
```

---

## Deploy no Netlify

1. **Conectar repositório**: New site → import from Git → escolha o repo.
2. **Build settings** já estão em `netlify.toml`:
   - Build command: `npm run build`
   - Plugin `@netlify/angular-runtime` cuida do SSR.
   - Functions em `netlify/functions/`.
3. **Environment variables** (Site settings → Environment variables):
   - `SUPABASE_URL` → URL do projeto Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` → service_role key (⚠️ scope: Functions only)
4. **Deploy**. Pegue o domínio final e atualize:
   - Google Cloud → OAuth client → Authorized origins/redirects
   - Supabase → Authentication → URL Configuration

---

## Como funciona a criação de usuários

1. Admin loga em `/admin` (a rota é protegida pelo `adminGuard` que checa o email contra `ADMIN_EMAILS`).
2. Admin digita o email do novo usuário → POST `/api/create-user` com `Authorization: Bearer <token>`.
3. A função Netlify:
   - Valida o JWT do chamador via `supabase.auth.getUser(token)`.
   - Confere se o email do chamador está em `ADMIN_EMAILS` (defense in depth).
   - Chama `supabase.auth.admin.createUser({ email, email_confirm: true })` usando `service_role`.
4. O trigger `on_auth_user_created` insere a linha em `public.profiles`.
5. Novo usuário acessa o site, clica em "Entrar com Google", autoriza com o email cadastrado → Supabase encontra o `auth.user` correspondente → sessão criada → entra no `/`.

Se alguém não cadastrado tentar logar, a OAuth falha (porque `Allow new users to sign up` está desabilitado).

---

## Estrutura

```
src/app/
  core/
    auth/
      admin-emails.ts        # lista canônica de admins (frontend)
      auth.service.ts        # signals de sessão, signIn/signOut
      auth.guard.ts          # authGuard + adminGuard
    supabase/
      supabase.service.ts    # SupabaseClient (SSR-safe)
  pages/
    login/login.ts           # botão Google
    home/home.ts             # página autenticada
    admin/admin.ts           # form de criar usuário
  app.routes.ts              # / (auth), /admin (admin), /login
  app.routes.server.ts       # RenderMode.Client em todas as rotas

netlify/
  functions/
    create-user.mts          # endpoint admin (service_role)

supabase/
  migrations/
    0001_init.sql            # profiles + RLS + triggers
```

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | Dev server Angular (sem functions) |
| `npx netlify dev` | Dev server completo (Angular + functions) |
| `npm run build` | Build de produção (SSR) |
| `npm run serve:ssr:hp-suporte-remoto` | Roda build SSR localmente |
