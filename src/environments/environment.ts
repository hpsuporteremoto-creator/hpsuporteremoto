// Valores do projeto Supabase. A anon key é pública (JWT com claim role=anon)
// e pode ser commitada — toda a segurança está em RLS + função is_admin().
export const environment = {
  supabaseUrl: 'https://qcrpgeeiiavgiunwyukj.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcnBnZWVpaWF2Z2l1bnd5dWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMzE3NTgsImV4cCI6MjA5NDcwNzc1OH0.fx5Pa4A7AHV1lKHHM1mQeBoU3aOKzFG9EuN6kkdgl3o',
};
