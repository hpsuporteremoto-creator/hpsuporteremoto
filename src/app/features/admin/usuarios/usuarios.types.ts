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
  last_access_at: string | null;
  last_access_device: string | null;
  last_access_ip: string | null;
  last_access_country: string | null;
}

export interface UserCreateInput {
  email: string;
  role: UserRole;
}

export interface UserUpdateInput {
  full_name: string | null;
  role: UserRole;
}
