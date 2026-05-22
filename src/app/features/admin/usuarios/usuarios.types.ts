export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCreateInput {
  email: string;
}

export interface UserUpdateInput {
  full_name: string | null;
}
