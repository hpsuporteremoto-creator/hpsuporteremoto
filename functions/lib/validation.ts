import { z } from 'zod';

export { z };

export const uuidSchema = z.string().uuid('Identificador inválido');
export const emailSchema = z.string().trim().toLowerCase().email('Email inválido');
export const positiveIntegerSchema = z.number().int().positive('Informe um valor maior que zero');
export const nonNegativeIntegerSchema = z.number().int().nonnegative('Valor inválido');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
export const optionalTextSchema = (maxLength = 20_000) =>
  z
    .string()
    .trim()
    .max(maxLength, `Texto deve ter no máximo ${maxLength} caracteres`)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export type JsonValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function readJson<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<JsonValidationResult<z.output<TSchema>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: 'Corpo JSON inválido' };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: validationErrorMessage(parsed.error) };
  return { ok: true, data: parsed.data };
}

export function validationErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Dados inválidos';
  const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${field}${issue.message}`;
}
