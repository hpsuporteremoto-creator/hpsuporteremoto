/**
 * Utilidades de WhatsApp.
 *
 * Convenção do projeto: o valor armazenado em `clientes.whatsapp` é a forma
 * canônica — dígitos com DDI internacional, ex `558185207465`. A faixa válida
 * (10–15 dígitos, E.164) é garantida por um CHECK constraint no banco
 * (migration 0013) e espelhada pela função `canonicalizarWhatsapp` deste módulo.
 *
 * Usar esses helpers em:
 *  - busca digit-aware → `onlyDigits`
 *  - submit/edição do formulário admin → `canonicalizarWhatsapp`, `parseWhatsappCanonical`
 *  - templates que exibem o número → `formatWhatsappDisplay`
 *  - links wa.me → `https://wa.me/${cliente.whatsapp}` direto, já é digits-only.
 */

const DDI_CONHECIDOS = ['351', '55', '49', '44', '34', '1'] as const;

/** Remove tudo que não for dígito. Usado em input e busca. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Espelho TS de `public.canonicalizar_whatsapp(text)`.
 * - "(81) 98520-7465"   → "558185207465"  (fallback BR p/ 10–11 dígitos)
 * - "+55 81 98520-7465" → "558185207465"
 * - "5511999998888"     → "5511999998888" (já canônico)
 * @throws se o resultado ficar fora de 10–15 dígitos (faixa válida E.164).
 */
export function canonicalizarWhatsapp(input: string): string {
  const digits = onlyDigits(input);
  const withDdi =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (withDdi.length < 10 || withDdi.length > 15) {
    throw new Error(
      `WhatsApp inválido: "${input}" → "${withDdi}" (${withDdi.length} dígitos)`,
    );
  }
  return withDdi;
}

/**
 * Quebra um canônico em DDI + restante para preencher o formulário em edição.
 * Tenta DDIs conhecidos longest-first; cai num fallback genérico de 2 dígitos
 * para inputs que não casem nenhum DDI conhecido.
 */
export function parseWhatsappCanonical(canonical: string): {
  ddi: string;
  local: string;
} {
  const digits = onlyDigits(canonical);
  for (const ddi of DDI_CONHECIDOS) {
    if (digits.startsWith(ddi)) {
      return { ddi, local: digits.slice(ddi.length) };
    }
  }
  return { ddi: digits.slice(0, 2), local: digits.slice(2) };
}

export function extractWhatsappParts(
  input: string,
  currentDdi = '55',
): { ddi: string; local: string } {
  const digits = onlyDigits(input);
  if (!digits) return { ddi: onlyDigits(currentDdi) || '55', local: '' };

  const ddi = onlyDigits(currentDdi) || '55';
  const pastedCompleteNumber = input.includes('+') || digits.length > 11;

  if (pastedCompleteNumber) {
    const parsed = parseWhatsappCanonical(digits);
    if (parsed.local.length >= 8) return parsed;
  }

  return { ddi, local: digits };
}

export function formatWhatsappLocal(local: string, ddi = '55'): string {
  const digits = onlyDigits(local).slice(0, 14);
  if (!digits) return '';

  if (onlyDigits(ddi) === '55' && digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2, 11);
    const main =
      number.length > 8
        ? `${number.slice(0, 5)}-${number.slice(5)}`
        : `${number.slice(0, 4)}-${number.slice(4)}`;
    return `(${ddd}) ${main}`.trim();
  }

  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

/**
 * Formato de exibição.
 * - BR (DDI 55, 12–13 dígitos): "+55 (81) 98520-7465"
 * - Outros DDIs: "+DDI rest"
 * - Se o input não parecer canônico (linha legada antes da 0013), devolve cru
 *   para não quebrar templates durante o rollout.
 */
export function formatWhatsappDisplay(
  canonical: string | null | undefined,
): string {
  if (!canonical) return '';
  const d = onlyDigits(canonical);
  if (d.length < 10 || d.length > 15) return canonical;

  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const local =
      rest.length === 9
        ? `${rest.slice(0, 5)}-${rest.slice(5)}`
        : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+55 (${ddd}) ${local}`;
  }

  const parsed = parseWhatsappCanonical(d);
  return `+${parsed.ddi} ${parsed.local}`;
}
