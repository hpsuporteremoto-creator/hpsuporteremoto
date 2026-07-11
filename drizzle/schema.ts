import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const atendimentoState = pgEnum('atendimento_state', [
  'aguardando_confirmacao',
  'recusado',
  'em_andamento',
  'faturamento',
  'pagamento',
  'concluido',
]);

export const transacaoTipo = pgEnum('transacao_tipo', ['entrada', 'saida']);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
});

export const clientes = pgTable('clientes', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  whatsapp: text('whatsapp').notNull(),
  instagram: text('instagram'),
  email: text('email'),
  ativo: boolean('ativo').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  observacao: text('observacao'),
  cadastradoPorUserId: uuid('cadastrado_por_user_id'),
  marketingOptIn: boolean('marketing_opt_in').default(true).notNull(),
  marketingOptInAt: timestamp('marketing_opt_in_at', { withTimezone: true, mode: 'string' }),
  marketingOptOutAt: timestamp('marketing_opt_out_at', { withTimezone: true, mode: 'string' }),
  resendContactId: text('resend_contact_id'),
});

export const servicoCategorias = pgTable('servico_categorias', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  ativo: boolean('ativo').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const servicos = pgTable('servicos', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  ativo: boolean('ativo').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  descricao: text('descricao'),
  imagemUrl: text('imagem_url'),
  categoriaId: uuid('categoria_id'),
  vitrine: boolean('vitrine').default(true).notNull(),
});

export const atendimentos = pgTable('atendimentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  clienteId: uuid('cliente_id').notNull(),
  servicoId: uuid('servico_id'),
  state: atendimentoState('state').default('aguardando_confirmacao').notNull(),
  valorCentavos: integer('valor_centavos'),
  pixBrcode: text('pix_brcode'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  descricaoSolicitacao: text('descricao_solicitacao'),
  servicoIds: uuid('servico_ids').array().default(sql`ARRAY[]::uuid[]`).notNull(),
  descontoCentavos: integer('desconto_centavos').default(0).notNull(),
  criadoPorUserId: uuid('criado_por_user_id'),
  vendidoPorUserId: uuid('vendido_por_user_id'),
  atendidoPorUserId: uuid('atendido_por_user_id'),
  acrescimoCentavos: integer('acrescimo_centavos').default(0).notNull(),
  pixRecebedorId: uuid('pix_recebedor_id'),
  pagamentoEndToEndId: text('pagamento_end_to_end_id'),
  pagamentoIspb: text('pagamento_ispb'),
  pagamentoInstituicao: text('pagamento_instituicao'),
  pagamentoComprovantePath: text('pagamento_comprovante_path'),
  pagamentoComprovanteNome: text('pagamento_comprovante_nome'),
  pagamentoComprovanteTipo: text('pagamento_comprovante_tipo'),
  pagamentoConfirmadoEm: timestamp('pagamento_confirmado_em', { withTimezone: true, mode: 'string' }),
  pagamentoConfirmadoPorUserId: uuid('pagamento_confirmado_por_user_id'),
});

export const transacoes = pgTable('transacoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tipo: transacaoTipo('tipo').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  descricao: text('descricao').notNull(),
  atendimentoId: uuid('atendimento_id'),
  data: date('data').default(sql`CURRENT_DATE`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const pixRecebedorConfig = pgTable('pix_recebedor_config', {
  id: smallint('id').default(1).primaryKey(),
  pixKey: text('pix_key').default('').notNull(),
  receiverName: text('receiver_name').default('').notNull(),
  receiverCity: text('receiver_city').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const pixRecebedores = pgTable('pix_recebedores', {
  id: uuid('id').defaultRandom().primaryKey(),
  pixKey: text('pix_key').notNull(),
  receiverName: text('receiver_name').notNull(),
  receiverCity: text('receiver_city').notNull(),
  ativo: boolean('ativo').default(true).notNull(),
  padrao: boolean('padrao').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const userLoginDevices = pgTable('user_login_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  email: text('email'),
  deviceHash: text('device_hash').notNull(),
  deviceLabel: text('device_label').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  country: text('country'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const servicoComentarios = pgTable('servico_comentarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  servicoId: uuid('servico_id').notNull(),
  parentId: uuid('parent_id'),
  userId: uuid('user_id').notNull(),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email'),
  authorAvatarUrl: text('author_avatar_url'),
  texto: text('texto').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const marketingCampanhas = pgTable('marketing_campanhas', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  assunto: text('assunto').notNull(),
  mensagem: text('mensagem').notNull(),
  textoPrevia: text('texto_previa'),
  servicoId: uuid('servico_id'),
  somenteVendasContabilizadas: boolean('somente_vendas_contabilizadas').default(true).notNull(),
  status: text('status').default('rascunho').notNull(),
  totalDestinatarios: integer('total_destinatarios').default(0).notNull(),
  agendadaPara: timestamp('agendada_para', { withTimezone: true, mode: 'string' }),
  enviadaEm: timestamp('enviada_em', { withTimezone: true, mode: 'string' }),
  resendSegmentId: text('resend_segment_id'),
  resendBroadcastId: text('resend_broadcast_id'),
  erro: text('erro'),
  criadoPorUserId: uuid('criado_por_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const marketingCampanhaDestinatarios = pgTable('marketing_campanha_destinatarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  campanhaId: uuid('campanha_id').notNull(),
  clienteId: uuid('cliente_id'),
  nome: text('nome').notNull(),
  email: text('email').notNull(),
  whatsapp: text('whatsapp'),
  resendContactId: text('resend_contact_id'),
  status: text('status').default('pendente').notNull(),
  erro: text('erro'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const marketingEventos = pgTable('marketing_eventos', {
  id: uuid('id').defaultRandom().primaryKey(),
  campanhaId: uuid('campanha_id'),
  destinatarioId: uuid('destinatario_id'),
  tipo: text('tipo').notNull(),
  resendEmailId: text('resend_email_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
