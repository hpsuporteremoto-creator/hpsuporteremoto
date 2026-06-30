export interface ServiceSearchTarget {
  readonly nome: string;
  readonly descricao?: string | null;
  readonly categoria?: { readonly nome: string } | null;
  readonly extras?: readonly string[];
}

export interface SearchHighlightSegment {
  readonly text: string;
  readonly highlighted: boolean;
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

export function servicoSearchScore(servico: ServiceSearchTarget, termo: string): number {
  const tokens = searchTokens(termo);
  if (tokens.length === 0) return 0;

  const nome = servico.nome;
  const categoria = servico.categoria?.nome ?? '';
  const descricao = servico.descricao ?? '';
  const extras = servico.extras ?? [];
  const termoNormalizado = normalizarBuscaServico(termo);
  const nomeNormalizado = normalizarBuscaServico(nome);
  const titleOnlyMatch = matchesAllTokens(tokens, [nome]);

  let score = titleOnlyMatch ? 500 : 0;
  if (nomeNormalizado === termoNormalizado) score += 600;
  else if (nomeNormalizado.startsWith(termoNormalizado)) score += 300;

  for (const token of tokens) {
    score += bestTextScore(nome, token, 120, 85, 55);
    score += bestTextScore(categoria, token, 35, 25, 14);
    score += Math.max(...extras.map((extra) => bestTextScore(extra, token, 22, 16, 8)), 0);
    if (shouldSearchDescription(tokens)) {
      score += bestTextScore(descricao, token, 10, 6, 3);
    }
  }

  return score;
}

export function destacarBuscaServico(value: string, termo: string): SearchHighlightSegment[] {
  const tokens = searchTokens(termo);
  if (tokens.length === 0 || value.length === 0) {
    return [{ text: value, highlighted: false }];
  }

  return value
    .split(/([\p{Letter}\p{Number}]+)/gu)
    .filter((part) => part.length > 0)
    .map((part) => {
      const normalizedPart = normalizarBuscaServico(part);
      const highlighted =
        normalizedPart.length > 0 && tokens.some((token) => tokenMatches(normalizedPart, token));
      return { text: part, highlighted };
    });
}

export function destacarBuscaTexto(value: string, termo: string): SearchHighlightSegment[] {
  return destacarBuscaServico(value, termo);
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

function bestTextScore(
  text: string,
  token: string,
  exactScore: number,
  prefixScore: number,
  includesScore: number,
): number {
  const textTokens = searchTokens(text);
  if (textTokens.includes(token)) return exactScore;
  if (textTokens.some((textToken) => textToken.startsWith(token))) return prefixScore;
  if (token.length >= 3 && textTokens.some((textToken) => textToken.includes(token))) {
    return includesScore;
  }
  return 0;
}
