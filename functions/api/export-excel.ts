import { asc, desc, eq } from 'drizzle-orm';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { strToU8, zipSync } from 'fflate';
import {
  clientes as clientesTable,
  marketingCampanhas,
  pixRecebedores,
  profiles as profilesTable,
  servicoCategorias,
  servicoComentarios,
  servicos as servicosTable,
  transacoes as transacoesTable,
} from '../../drizzle/schema';
import { getUserRole, isAdminUser, listAllUsers, metadataText, requireAdmin } from './admin-auth';
import { listAtendimentosComRelacoes, type AtendimentoComRelacoes } from './atendimentos-shared';
import { accessFromMetadata, latestAccessByUserIds, type UserAccessRef } from './user-access';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ExcelValue = string | number | boolean | null;

type ExcelSheet = {
  readonly name: string;
  readonly rows: readonly (readonly ExcelValue[])[];
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type ClienteRow = {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
  cadastrado_por_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ServicoCategoriaRow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

type ServicoCategoriaRef = Pick<ServicoCategoriaRow, 'id' | 'nome' | 'descricao' | 'ativo'>;

type ServicoRow = {
  id: string;
  nome: string;
  categoria_id: string | null;
  descricao: string | null;
  imagem_url: string | null;
  valor_centavos: number;
  ativo: boolean;
  vitrine: boolean;
  created_at: string;
  categoria: ServicoCategoriaRef | null;
};

type TransacaoRow = {
  id: string;
  tipo: string;
  valor_centavos: number;
  descricao: string;
  atendimento_id: string | null;
  data: string;
  created_at: string;
  updated_at: string;
};

type ComentarioRow = {
  id: string;
  servico_id: string;
  parent_id: string | null;
  user_id: string;
  author_name: string;
  author_email: string | null;
  texto: string;
  created_at: string;
  updated_at: string;
};

type PixRecebedorRow = {
  id: string;
  pix_key: string;
  receiver_name: string;
  receiver_city: string;
  ativo: boolean;
  padrao: boolean;
  created_at: string;
  updated_at: string;
};

type ExportData = {
  readonly generatedAt: string;
  readonly users: readonly User[];
  readonly latestAccessByUserId: ReadonlyMap<string, UserAccessRef>;
  readonly profiles: readonly ProfileRow[];
  readonly clientes: readonly ClienteRow[];
  readonly categorias: readonly ServicoCategoriaRow[];
  readonly servicos: readonly ServicoRow[];
  readonly atendimentos: readonly AtendimentoComRelacoes[];
  readonly transacoes: readonly TransacaoRow[];
  readonly comentarios: readonly ComentarioRow[];
  readonly pixConfigs: readonly PixRecebedorRow[];
};

const PAGE_SIZE = 1000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  try {
    const generatedAt = new Date().toISOString();
    const data = await loadExportData(admin, env, generatedAt);
    const workbook = buildXlsx(buildSheets(data));
    const filename = `hp-suporte-remoto-${generatedAt.slice(0, 10)}.xlsx`;
    const responseBytes = new Uint8Array(workbook.byteLength);
    responseBytes.set(workbook);

    return new Response(responseBytes.buffer, {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : 'Erro ao exportar Excel',
      },
      500,
    );
  }
};

async function loadExportData(
  admin: SupabaseClient,
  env: DatabaseEnv,
  generatedAt: string,
): Promise<ExportData> {
  const users = await listAllUsers(admin);
  const databaseData = await withDatabase(env, async (db) => {
    const [profiles, clientes, categorias, servicos, atendimentos, transacoes, comentarios, pixConfigs, latestAccessByUserId] =
      await Promise.all([
        db
          .select({ id: profilesTable.id, email: profilesTable.email, full_name: profilesTable.fullName, avatar_url: profilesTable.avatarUrl, created_at: profilesTable.createdAt, updated_at: profilesTable.updatedAt })
          .from(profilesTable)
          .orderBy(asc(profilesTable.email)),
        db
          .select({ id: clientesTable.id, nome: clientesTable.nome, whatsapp: clientesTable.whatsapp, instagram: clientesTable.instagram, email: clientesTable.email, observacao: clientesTable.observacao, ativo: clientesTable.ativo, cadastrado_por_user_id: clientesTable.cadastradoPorUserId, created_at: clientesTable.createdAt, updated_at: clientesTable.updatedAt })
          .from(clientesTable)
          .orderBy(asc(clientesTable.nome)),
        db
          .select({ id: servicoCategorias.id, nome: servicoCategorias.nome, descricao: servicoCategorias.descricao, ativo: servicoCategorias.ativo, created_at: servicoCategorias.createdAt, updated_at: servicoCategorias.updatedAt })
          .from(servicoCategorias)
          .orderBy(asc(servicoCategorias.nome)),
        db
          .select({
            id: servicosTable.id,
            nome: servicosTable.nome,
            categoria_id: servicosTable.categoriaId,
            descricao: servicosTable.descricao,
            imagem_url: servicosTable.imagemUrl,
            valor_centavos: servicosTable.valorCentavos,
            ativo: servicosTable.ativo,
            vitrine: servicosTable.vitrine,
            created_at: servicosTable.createdAt,
            categoria: { id: servicoCategorias.id, nome: servicoCategorias.nome, descricao: servicoCategorias.descricao, ativo: servicoCategorias.ativo },
          })
          .from(servicosTable)
          .leftJoin(servicoCategorias, eq(servicosTable.categoriaId, servicoCategorias.id))
          .orderBy(asc(servicosTable.nome)),
        listAtendimentosComRelacoes(db),
        db
          .select({ id: transacoesTable.id, tipo: transacoesTable.tipo, valor_centavos: transacoesTable.valorCentavos, descricao: transacoesTable.descricao, atendimento_id: transacoesTable.atendimentoId, data: transacoesTable.data, created_at: transacoesTable.createdAt, updated_at: transacoesTable.updatedAt })
          .from(transacoesTable)
          .orderBy(desc(transacoesTable.data)),
        db
          .select({ id: servicoComentarios.id, servico_id: servicoComentarios.servicoId, parent_id: servicoComentarios.parentId, user_id: servicoComentarios.userId, author_name: servicoComentarios.authorName, author_email: servicoComentarios.authorEmail, texto: servicoComentarios.texto, created_at: servicoComentarios.createdAt, updated_at: servicoComentarios.updatedAt })
          .from(servicoComentarios)
          .orderBy(desc(servicoComentarios.createdAt)),
        db
          .select({ id: pixRecebedores.id, pix_key: pixRecebedores.pixKey, receiver_name: pixRecebedores.receiverName, receiver_city: pixRecebedores.receiverCity, ativo: pixRecebedores.ativo, padrao: pixRecebedores.padrao, created_at: pixRecebedores.createdAt, updated_at: pixRecebedores.updatedAt })
          .from(pixRecebedores)
          .orderBy(desc(pixRecebedores.padrao), asc(pixRecebedores.receiverName)),
        latestAccessByUserIds(
          db,
          users.map((user) => user.id),
        ),
      ]);
    return { profiles, clientes, categorias, servicos, atendimentos, transacoes, comentarios, pixConfigs, latestAccessByUserId };
  });

  return {
    generatedAt,
    users,
    latestAccessByUserId: databaseData.latestAccessByUserId,
    profiles: databaseData.profiles,
    clientes: databaseData.clientes,
    categorias: databaseData.categorias,
    servicos: databaseData.servicos.map((servico) => ({ ...servico, categoria: servico.categoria?.id ? servico.categoria : null })),
    atendimentos: databaseData.atendimentos,
    transacoes: databaseData.transacoes,
    comentarios: databaseData.comentarios,
    pixConfigs: databaseData.pixConfigs,
  };
}

function buildSheets(data: ExportData): ExcelSheet[] {
  const profilesById = new Map(data.profiles.map((profile) => [profile.id, profile]));
  const servicosById = new Map(data.servicos.map((servico) => [servico.id, servico]));
  const atendimentosById = new Map(
    data.atendimentos.map((atendimento) => [atendimento.id, atendimento]),
  );

  return [
    buildResumoSheet(data),
    buildClientesSheet(data.clientes, profilesById),
    buildAtendimentosSheet(data.atendimentos),
    buildAtendimentoItensSheet(data.atendimentos),
    buildServicosSheet(data.servicos),
    buildCategoriasSheet(data.categorias),
    buildFinanceiroSheet(data.transacoes, atendimentosById),
    buildUsuariosSheet(data.users, profilesById, data.latestAccessByUserId),
    buildComentariosSheet(data.comentarios, servicosById),
    buildPixSheet(data.pixConfigs),
  ];
}

function buildResumoSheet(data: ExportData): ExcelSheet {
  return {
    name: 'Resumo',
    rows: [
      ['Exportado em', data.generatedAt],
      ['Clientes', data.clientes.length],
      ['Atendimentos', data.atendimentos.length],
      ['Itens de atendimento', countAtendimentoItens(data.atendimentos)],
      ['Serviços', data.servicos.length],
      ['Categorias', data.categorias.length],
      ['Transações', data.transacoes.length],
      ['Usuários', data.users.length],
      ['Comentários', data.comentarios.length],
    ],
  };
}

function buildClientesSheet(
  clientes: readonly ClienteRow[],
  profilesById: ReadonlyMap<string, ProfileRow>,
): ExcelSheet {
  return {
    name: 'Clientes',
    rows: [
      [
        'ID',
        'Nome',
        'WhatsApp',
        'Instagram',
        'Email',
        'Observação',
        'Ativo',
        'Cadastrado por',
        'Criado em',
        'Atualizado em',
      ],
      ...clientes.map((cliente) => [
        cliente.id,
        cliente.nome,
        cliente.whatsapp,
        cliente.instagram,
        cliente.email,
        cliente.observacao,
        cliente.ativo,
        userLabel(profilesById.get(cliente.cadastrado_por_user_id ?? '')),
        cliente.created_at,
        cliente.updated_at,
      ]),
    ],
  };
}

function buildAtendimentosSheet(atendimentos: readonly AtendimentoComRelacoes[]): ExcelSheet {
  return {
    name: 'Atendimentos',
    rows: [
      [
        'ID',
        'Cliente',
        'WhatsApp',
        'Email',
        'Status',
        'Serviços',
        'Descrição',
        'Subtotal R$',
        'Desconto R$',
        'Acréscimo R$',
        'Valor final R$',
        'Financeiro contabilizado',
        'Chave PIX',
        'Comprovante',
        'Pagamento confirmado em',
        'Pagamento confirmado por',
        'Criado por',
        'Vendido por',
        'Atendido por',
        'Criado em',
        'Atualizado em',
      ],
      ...atendimentos.map((atendimento) => [
        atendimento.id,
        atendimento.cliente?.nome ?? '',
        atendimento.cliente?.whatsapp ?? '',
        atendimento.cliente?.email ?? '',
        atendimento.state,
        atendimento.servicos_solicitados.map(formatServicoSolicitado).join('; '),
        atendimento.descricao_solicitacao,
        centavosToReais(subtotalAtendimento(atendimento)),
        centavosToReais(atendimento.desconto_centavos),
        centavosToReais(atendimento.acrescimo_centavos),
        centavosToReais(valorFinalAtendimento(atendimento)),
        atendimento.financeiro_contabilizado,
        atendimento.pix_recebedor?.pix_key ?? '',
        atendimento.pagamento_comprovante_nome,
        atendimento.pagamento_confirmado_em,
        userLabel(atendimento.pagamento_confirmado_por),
        userLabel(atendimento.criado_por),
        userLabel(atendimento.vendido_por),
        userLabel(atendimento.atendido_por),
        atendimento.created_at,
        atendimento.updated_at,
      ]),
    ],
  };
}

function buildAtendimentoItensSheet(atendimentos: readonly AtendimentoComRelacoes[]): ExcelSheet {
  return {
    name: 'Itens Atendimento',
    rows: [
      [
        'Atendimento ID',
        'Cliente',
        'Status',
        'Serviço ID',
        'Serviço',
        'Quantidade',
        'Valor unitário R$',
        'Subtotal R$',
        'Criado em',
      ],
      ...atendimentos.flatMap((atendimento) =>
        atendimento.servicos_solicitados.map((servico) => [
          atendimento.id,
          atendimento.cliente?.nome ?? '',
          atendimento.state,
          servico.id,
          servico.nome,
          servico.quantidade,
          centavosToReais(servico.valor_centavos),
          centavosToReais(servico.subtotal_centavos),
          atendimento.created_at,
        ]),
      ),
    ],
  };
}

function buildServicosSheet(servicos: readonly ServicoRow[]): ExcelSheet {
  return {
    name: 'Serviços',
    rows: [
      [
        'ID',
        'Nome',
        'Categoria',
        'Descrição',
        'Imagem URL',
        'Valor R$',
        'Ativo',
        'Exibir no site',
        'Criado em',
      ],
      ...servicos.map((servico) => [
        servico.id,
        servico.nome,
        servico.categoria?.nome ?? '',
        servico.descricao,
        servico.imagem_url,
        centavosToReais(servico.valor_centavos),
        servico.ativo,
        servico.vitrine,
        servico.created_at,
      ]),
    ],
  };
}

function buildCategoriasSheet(categorias: readonly ServicoCategoriaRow[]): ExcelSheet {
  return {
    name: 'Categorias',
    rows: [
      ['ID', 'Nome', 'Descrição', 'Ativa', 'Criada em', 'Atualizada em'],
      ...categorias.map((categoria) => [
        categoria.id,
        categoria.nome,
        categoria.descricao,
        categoria.ativo,
        categoria.created_at,
        categoria.updated_at,
      ]),
    ],
  };
}

function buildFinanceiroSheet(
  transacoes: readonly TransacaoRow[],
  atendimentosById: ReadonlyMap<string, AtendimentoComRelacoes>,
): ExcelSheet {
  return {
    name: 'Financeiro',
    rows: [
      [
        'ID',
        'Tipo',
        'Valor R$',
        'Descrição',
        'Data',
        'Atendimento ID',
        'Cliente',
        'Serviços',
        'Vendido por',
        'Criado em',
        'Atualizado em',
      ],
      ...transacoes.map((transacao) => {
        const atendimento = transacao.atendimento_id
          ? atendimentosById.get(transacao.atendimento_id)
          : null;
        return [
          transacao.id,
          transacao.tipo,
          centavosToReais(transacao.valor_centavos),
          transacao.descricao,
          transacao.data,
          transacao.atendimento_id,
          atendimento?.cliente?.nome ?? '',
          atendimento?.servicos_solicitados.map(formatServicoSolicitado).join('; ') ?? '',
          userLabel(atendimento?.vendido_por ?? null),
          transacao.created_at,
          transacao.updated_at,
        ];
      }),
    ],
  };
}

function buildUsuariosSheet(
  users: readonly User[],
  profilesById: ReadonlyMap<string, ProfileRow>,
  latestAccessByUserId: ReadonlyMap<string, UserAccessRef>,
): ExcelSheet {
  return {
    name: 'Usuários',
    rows: [
      [
        'ID',
        'Email',
        'Nome',
        'Role',
        'Admin',
        'Criado em',
        'Último login',
        'Último acesso registrado',
        'Máquina',
        'IP',
        'País',
        'Profile criado em',
        'Profile atualizado em',
      ],
      ...users.map((user) => {
        const profile = profilesById.get(user.id);
        const access = latestAccessByUserId.get(user.id);
        const metadataAccess = accessFromMetadata(user.app_metadata);
        return [
          user.id,
          user.email ?? profile?.email ?? '',
          profile?.full_name ??
            metadataText(user.user_metadata, 'full_name') ??
            metadataText(user.user_metadata, 'name'),
          getUserRole(user),
          isAdminUser(user),
          user.created_at,
          user.last_sign_in_at ?? '',
          access?.last_access_at ?? metadataAccess.last_access_at ?? '',
          access?.last_access_device ?? metadataAccess.last_access_device ?? '',
          access?.last_access_ip ?? metadataAccess.last_access_ip ?? '',
          access?.last_access_country ?? metadataAccess.last_access_country ?? '',
          profile?.created_at ?? '',
          profile?.updated_at ?? '',
        ];
      }),
    ],
  };
}

function buildComentariosSheet(
  comentarios: readonly ComentarioRow[],
  servicosById: ReadonlyMap<string, ServicoRow>,
): ExcelSheet {
  return {
    name: 'Comentários',
    rows: [
      [
        'ID',
        'Serviço',
        'Serviço ID',
        'Comentário pai ID',
        'Usuário ID',
        'Autor',
        'Email',
        'Texto',
        'Criado em',
        'Atualizado em',
      ],
      ...comentarios.map((comentario) => [
        comentario.id,
        servicosById.get(comentario.servico_id)?.nome ?? '',
        comentario.servico_id,
        comentario.parent_id,
        comentario.user_id,
        comentario.author_name,
        comentario.author_email,
        comentario.texto,
        comentario.created_at,
        comentario.updated_at,
      ]),
    ],
  };
}

function buildPixSheet(configs: readonly PixRecebedorRow[]): ExcelSheet {
  return {
    name: 'Config PIX',
    rows: [
      ['ID', 'Chave PIX', 'Recebedor', 'Cidade', 'Ativa', 'Padrão', 'Criado em', 'Atualizado em'],
      ...configs.map((config) => [
        config.id,
        config.pix_key,
        config.receiver_name,
        config.receiver_city,
        config.ativo,
        config.padrao,
        config.created_at,
        config.updated_at,
      ]),
    ],
  };
}

function countAtendimentoItens(atendimentos: readonly AtendimentoComRelacoes[]): number {
  return atendimentos.reduce(
    (total, atendimento) =>
      total +
      atendimento.servicos_solicitados.reduce((sum, servico) => sum + servico.quantidade, 0),
    0,
  );
}

function subtotalAtendimento(atendimento: AtendimentoComRelacoes): number {
  return atendimento.servicos_solicitados.reduce(
    (total, servico) => total + servico.subtotal_centavos,
    0,
  );
}

function valorFinalAtendimento(atendimento: AtendimentoComRelacoes): number {
  return (
    atendimento.valor_centavos ??
    Math.max(
      subtotalAtendimento(atendimento) +
        atendimento.acrescimo_centavos -
        atendimento.desconto_centavos,
      0,
    )
  );
}

function formatServicoSolicitado(servico: {
  nome: string;
  quantidade: number;
  subtotal_centavos: number;
}): string {
  const prefix = servico.quantidade > 1 ? `${servico.quantidade}x ` : '';
  return `${prefix}${servico.nome} (${formatCurrency(servico.subtotal_centavos)})`;
}

function userLabel(user: { email: string; full_name: string | null } | null | undefined): string {
  if (!user) return '';
  return user.full_name ? `${user.full_name} <${user.email}>` : user.email;
}

function centavosToReais(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 100 : null;
}

function formatCurrency(valueCentavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueCentavos / 100);
}

function buildXlsx(sheets: readonly ExcelSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xmlFile(contentTypesXml(sheets)),
    '_rels/.rels': xmlFile(rootRelsXml()),
    'docProps/core.xml': xmlFile(corePropsXml()),
    'docProps/app.xml': xmlFile(appPropsXml(sheets)),
    'xl/workbook.xml': xmlFile(workbookXml(sheets)),
    'xl/_rels/workbook.xml.rels': xmlFile(workbookRelsXml(sheets)),
    'xl/styles.xml': xmlFile(stylesXml()),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = xmlFile(worksheetXml(sheet));
  });

  return zipSync(files, { level: 6 });
}

function xmlFile(value: string): Uint8Array {
  return strToU8(value);
}

function contentTypesXml(sheets: readonly ExcelSheet[]): string {
  return xmlDecl(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      ${sheets
        .map(
          (_sheet, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
      <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
    </Types>`,
  );
}

function rootRelsXml(): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
    </Relationships>`,
  );
}

function workbookXml(sheets: readonly ExcelSheet[]): string {
  return xmlDecl(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        ${sheets
          .map(
            (sheet, index) =>
              `<sheet name="${escapeXmlAttr(safeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
          )
          .join('')}
      </sheets>
    </workbook>`,
  );
}

function workbookRelsXml(sheets: readonly ExcelSheet[]): string {
  return xmlDecl(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${sheets
        .map(
          (_sheet, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join('')}
      <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`,
  );
}

function worksheetXml(sheet: ExcelSheet): string {
  const rowCount = sheet.rows.length;
  const colCount = Math.max(1, ...sheet.rows.map((row) => row.length));
  const dimension = `A1:${columnName(colCount - 1)}${Math.max(rowCount, 1)}`;

  return xmlDecl(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <dimension ref="${dimension}"/>
      <sheetData>
        ${sheet.rows.map((row, rowIndex) => worksheetRowXml(row, rowIndex + 1)).join('')}
      </sheetData>
    </worksheet>`,
  );
}

function worksheetRowXml(row: readonly ExcelValue[], rowNumber: number): string {
  return `<row r="${rowNumber}">${row
    .map((cell, columnIndex) => worksheetCellXml(cell, rowNumber, columnIndex))
    .join('')}</row>`;
}

function worksheetCellXml(value: ExcelValue, rowNumber: number, columnIndex: number): string {
  if (value === null || value === '') return '';
  const ref = `${columnName(columnIndex)}${rowNumber}`;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : '';
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(
    limitCellText(value),
  )}</t></is></c>`;
}

function stylesXml(): string {
  return xmlDecl(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
      <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
      <borders count="1"><border/></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`,
  );
}

function corePropsXml(): string {
  const now = new Date().toISOString();
  return xmlDecl(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <dc:title>Exportação HP Suporte Remoto</dc:title>
      <dc:creator>HP Suporte Remoto</dc:creator>
      <cp:lastModifiedBy>HP Suporte Remoto</cp:lastModifiedBy>
      <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
      <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
    </cp:coreProperties>`,
  );
}

function appPropsXml(sheets: readonly ExcelSheet[]): string {
  return xmlDecl(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
      <Application>HP Suporte Remoto</Application>
      <TitlesOfParts>
        <vt:vector size="${sheets.length}" baseType="lpstr">
          ${sheets
            .map((sheet) => `<vt:lpstr>${escapeXmlText(safeSheetName(sheet.name))}</vt:lpstr>`)
            .join('')}
        </vt:vector>
      </TitlesOfParts>
    </Properties>`,
  );
}

function xmlDecl(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const modulo = (value - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    value = Math.floor((value - modulo) / 26);
  }
  return name;
}

function safeSheetName(name: string): string {
  return (
    name
      .replace(/[\][:*?/\\]/g, ' ')
      .slice(0, 31)
      .trim() || 'Planilha'
  );
}

function limitCellText(value: string): string {
  return value.length > 32767 ? `${value.slice(0, 32764)}...` : value;
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;');
}
