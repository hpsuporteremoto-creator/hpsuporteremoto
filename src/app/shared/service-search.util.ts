export interface ServiceSearchTarget {
  readonly nome: string;
  readonly descricao?: string | null;
  readonly categoria?: { readonly nome: string } | null;
  readonly extras?: readonly string[];
}

const MIN_TOKEN_LENGTH = 2;
const DESCRIPTION_STOP_WORDS = new Set([
  'com',
  'das',
  'dos',
  'para',
  'por',
  'sem',
  'servico',
  'servicos',
]);

export function normalizarBuscaServico(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function servicoMatchesBusca(servico: ServiceSearchTarget, termo: string): boolean {
  const tokens = searchTokens(termo);
  if (tokens.length === 0) return true;

  const primaryTexts = [servico.nome, servico.categoria?.nome, ...(servico.extras ?? [])];
  if (matchesAllTokens(tokens, primaryTexts)) return true;

  if (!shouldSearchDescription(tokens)) return false;
  return matchesAllTokens(tokens, [...primaryTexts, servico.descricao ?? '']);
}

function searchTokens(value: string): string[] {
  return normalizarBuscaServico(value)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function shouldSearchDescription(tokens: readonly string[]): boolean {
  return (
    tokens.length > 1 ||
    tokens.some((token) => token.length >= 4 && !DESCRIPTION_STOP_WORDS.has(token))
  );
}

function matchesAllTokens(tokens: readonly string[], texts: readonly (string | null | undefined)[]) {
  const textTokens = texts.flatMap((text) => searchTokens(text ?? ''));
  if (textTokens.length === 0) return false;
  return tokens.every((token) => textTokens.some((textToken) => tokenMatches(textToken, token)));
}

function tokenMatches(textToken: string, queryToken: string): boolean {
  return (
    textToken.startsWith(queryToken) ||
    (queryToken.length >= 3 && textToken.includes(queryToken))
  );
}
