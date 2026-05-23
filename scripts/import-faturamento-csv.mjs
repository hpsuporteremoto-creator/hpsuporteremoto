#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_CSV_PATH = 'Faturamento - Clientes desde 2023.csv';
const HISTORICAL_CATEGORY = 'Importado CSV';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 500;

const args = parseArgs(process.argv.slice(2));
loadEnvFile('.env');
loadEnvFile('.env.local');

const csvPath = resolve(args.csvPath ?? DEFAULT_CSV_PATH);
if (!existsSync(csvPath)) {
  fail(`CSV não encontrado: ${csvPath}`);
}

const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''));
const plan = buildImportPlan(rows);
printReport(plan, args.apply);

if (!args.apply) {
  console.log('\nDry-run concluído. Para importar de verdade:');
  console.log('  npm run import:faturamento -- --apply --yes');
  process.exit(0);
}

if (!args.yes) {
  fail('Import real exige --yes para confirmar o reset operacional.');
}

const supabaseUrl = process.env['SUPABASE_URL'] ?? readSupabaseUrlFromEnvironment();
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? readSupabaseAnonKeyFromEnvironment();
const accessToken = process.env['SUPABASE_ACCESS_TOKEN'];
if (!supabaseUrl || !supabaseKey) {
  fail(
    [
      'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, ou use SUPABASE_ACCESS_TOKEN de um admin autenticado.',
      'SUPABASE_URL pode ser lida de src/environments/environment.ts.',
      'SUPABASE_SERVICE_ROLE_KEY é preferível; SUPABASE_ACCESS_TOKEN usa a anon key pública com RLS de admin.',
    ].join('\n'),
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: accessToken
    ? {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    : undefined,
});

await applyImport(supabase, plan);
await printDatabaseValidation(supabase, plan);

function parseArgs(argv) {
  const parsed = {
    apply: false,
    yes: false,
    csvPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      parsed.apply = true;
    } else if (arg === '--dry-run') {
      parsed.apply = false;
    } else if (arg === '--yes') {
      parsed.yes = true;
    } else if (arg === '--csv') {
      parsed.csvPath = argv[i + 1] ?? null;
      i += 1;
    } else {
      fail(`Argumento desconhecido: ${arg}`);
    }
  }

  return parsed;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function readSupabaseUrlFromEnvironment() {
  const path = 'src/environments/environment.ts';
  if (!existsSync(path)) return null;
  const match = /supabaseUrl:\s*'([^']+)'/.exec(readFileSync(path, 'utf8'));
  return match?.[1] ?? null;
}

function readSupabaseAnonKeyFromEnvironment() {
  const path = 'src/environments/environment.ts';
  if (!existsSync(path)) return null;
  const match = /supabaseAnonKey:\s*'([^']+)'/.exec(readFileSync(path, 'utf8'));
  return match?.[1] ?? null;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function buildImportPlan(rows) {
  const parsedRows = [];
  const ignored = {
    structural: 0,
    missingName: 0,
    missingPhone: 0,
    missingPedido: 0,
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 1;
    if (!isPedidoRow(row)) {
      ignored.structural += 1;
      continue;
    }

    const nome = cleanText(row[1]);
    const whatsapp = normalizeWhatsapp(row[2]);
    const email = normalizeEmail(row[3]);
    const timestamp = parseBrazilianDate(row[4]) ?? nowTimestamp();
    const hasValidDate = Boolean(parseBrazilianDate(row[4]));
    const disabled = Boolean(cleanText(row[5]));
    const pedido = cleanText(row[6]);

    if (!nome) {
      ignored.missingName += 1;
      continue;
    }
    if (!whatsapp) {
      ignored.missingPhone += 1;
      continue;
    }
    if (!pedido) {
      ignored.missingPedido += 1;
      continue;
    }

    parsedRows.push({
      line,
      nome,
      whatsapp,
      email,
      timestamp,
      hasValidDate,
      ativo: !disabled,
      pedido,
      completeness: completenessScore({ nome, whatsapp, email, hasValidDate, pedido }),
    });
  }

  const clientWinners = new Map();
  for (const row of parsedRows) {
    const current = clientWinners.get(row.whatsapp);
    if (
      !current ||
      row.completeness > current.completeness ||
      (row.completeness === current.completeness && row.line > current.line)
    ) {
      clientWinners.set(row.whatsapp, row);
    }
  }

  const clientes = Array.from(clientWinners.values())
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((row) => ({
      id: randomUUID(),
      nome: row.nome,
      whatsapp: row.whatsapp,
      instagram: null,
      email: row.email,
      ativo: row.ativo,
      created_at: row.timestamp,
      updated_at: row.timestamp,
    }));

  const clienteIdByWhatsapp = new Map(clientes.map((cliente) => [cliente.whatsapp, cliente.id]));
  const servicos = [];
  const atendimentos = [];

  for (const row of parsedRows) {
    const clienteId = clienteIdByWhatsapp.get(row.whatsapp);
    if (!clienteId) {
      throw new Error(`Cliente não encontrado para WhatsApp ${row.whatsapp}`);
    }

    const servicoId = randomUUID();
    servicos.push({
      id: servicoId,
      nome: row.pedido,
      categoria: HISTORICAL_CATEGORY,
      valor_centavos: 0,
      ativo: false,
      created_at: row.timestamp,
    });
    atendimentos.push({
      id: randomUUID(),
      cliente_id: clienteId,
      servico_id: servicoId,
      servico_ids: [servicoId],
      desconto_centavos: 0,
      state: 'concluido',
      valor_centavos: null,
      pix_brcode: null,
      descricao_solicitacao: row.pedido,
      created_at: row.timestamp,
      updated_at: row.timestamp,
    });
  }

  return {
    ignored,
    totalRows: rows.length,
    parsedRows,
    clientes,
    servicos,
    atendimentos,
  };
}

function isPedidoRow(row) {
  return row.length >= 7 && /^\d+$/.test(cleanText(row[0]));
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeWhatsapp(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

function normalizeEmail(value) {
  const email = cleanText(value).toLowerCase();
  return email || null;
}

function parseBrazilianDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleanText(value));
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00-03:00`;
}

function nowTimestamp() {
  return new Date().toISOString();
}

function completenessScore(row) {
  return [
    row.nome,
    row.whatsapp,
    row.email,
    row.hasValidDate,
    row.pedido,
  ].filter(Boolean).length;
}

function printReport(plan, willApply) {
  const activeClientes = plan.clientes.filter((cliente) => cliente.ativo).length;
  const inactiveClientes = plan.clientes.length - activeClientes;
  const clientesWithEmail = plan.clientes.filter((cliente) => cliente.email).length;

  console.log(`Modo: ${willApply ? 'IMPORT REAL' : 'DRY-RUN'}`);
  console.log(`CSV: ${csvPath}`);
  console.table({
    'linhas lidas': plan.totalRows,
    'linhas válidas': plan.parsedRows.length,
    'ignoradas estrutura/cabeçalho': plan.ignored.structural,
    'ignoradas sem nome': plan.ignored.missingName,
    'ignoradas sem whatsapp': plan.ignored.missingPhone,
    'ignoradas sem pedido': plan.ignored.missingPedido,
    'clientes únicos': plan.clientes.length,
    'clientes ativos': activeClientes,
    'clientes inativos': inactiveClientes,
    'clientes com email': clientesWithEmail,
    'serviços históricos': plan.servicos.length,
    atendimentos: plan.atendimentos.length,
  });

  console.log('\nAmostra de clientes:');
  console.table(
    plan.clientes.slice(0, 8).map((cliente) => ({
      nome: cliente.nome,
      whatsapp: cliente.whatsapp,
      email: cliente.email ?? '',
      ativo: cliente.ativo,
    })),
  );

  console.log('\nAmostra de atendimentos:');
  console.table(
    plan.atendimentos.slice(0, 8).map((atendimento, index) => ({
      cliente_id: atendimento.cliente_id.slice(0, 8),
      servico: plan.servicos[index]?.nome.slice(0, 64),
      state: atendimento.state,
      created_at: atendimento.created_at.slice(0, 10),
    })),
  );
}

async function applyImport(supabase, plan) {
  console.log('\nAplicando reset operacional...');
  await deleteAll(supabase, 'transacoes');
  await deleteAll(supabase, 'atendimentos');
  await deleteAll(supabase, 'clientes');
  await deletePreviousImportedServices(supabase);

  console.log('Inserindo clientes...');
  await insertInBatches(supabase, 'clientes', plan.clientes);

  console.log('Inserindo serviços históricos...');
  await insertInBatches(supabase, 'servicos', plan.servicos);

  console.log('Inserindo atendimentos históricos...');
  await insertInBatches(supabase, 'atendimentos', plan.atendimentos);
}

async function deleteAll(supabase, table) {
  const { error } = await supabase.from(table).delete().neq('id', ZERO_UUID);
  if (error) throw new Error(`Falha ao limpar ${table}: ${error.message}`);
}

async function deletePreviousImportedServices(supabase) {
  const { error } = await supabase
    .from('servicos')
    .delete()
    .eq('categoria', HISTORICAL_CATEGORY)
    .eq('valor_centavos', 0)
    .eq('ativo', false);
  if (error) {
    throw new Error(`Falha ao limpar serviços importados anteriores: ${error.message}`);
  }
}

async function insertInBatches(supabase, table, rows) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      throw new Error(
        `Falha ao inserir ${table} (${start + 1}-${start + batch.length}): ${error.message}`,
      );
    }
    console.log(`  ${table}: ${Math.min(start + batch.length, rows.length)}/${rows.length}`);
  }
}

async function printDatabaseValidation(supabase, plan) {
  const [clientes, atendimentos, transacoes, servicosImportados] = await Promise.all([
    countRows(supabase, 'clientes'),
    countRows(supabase, 'atendimentos'),
    countRows(supabase, 'transacoes'),
    countRows(
      supabase,
      'servicos',
      (query) => query.eq('categoria', HISTORICAL_CATEGORY).eq('ativo', false).eq('valor_centavos', 0),
    ),
  ]);

  console.log('\nValidação no banco:');
  console.table({
    clientes,
    atendimentos,
    transacoes,
    'serviços importados': servicosImportados,
    'clientes esperados': plan.clientes.length,
    'atendimentos esperados': plan.atendimentos.length,
    'serviços esperados': plan.servicos.length,
  });
}

async function countRows(supabase, table, refine = (query) => query) {
  const query = refine(
    supabase.from(table).select('id', {
      count: 'exact',
      head: true,
    }),
  );
  const { count, error } = await query;
  if (error) throw new Error(`Falha ao contar ${table}: ${error.message}`);
  return count ?? 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
