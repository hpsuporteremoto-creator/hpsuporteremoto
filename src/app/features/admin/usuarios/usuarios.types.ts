export type UserRole = 'admin' | 'vendedor';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCreateInput {
  email: string;
  role: UserRole;
}

export interface UserUpdateInput {
  full_name: string | null;
  role: UserRole;
}
