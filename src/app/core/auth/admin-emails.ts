// Lista canônica de admins. Mantenha sincronizada com:
//  - netlify/functions/create-user.mts
//  - supabase/migrations/0001_init.sql (função public.is_admin)
export const ADMIN_EMAILS: ReadonlyArray<string> = [
  'heriveltonpiresalves@gmail.com',
  'hpsuporteremoto@gmail.com',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
