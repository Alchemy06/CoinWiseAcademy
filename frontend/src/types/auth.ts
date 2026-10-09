export interface AuthProfile {
  // display_name is the header/chat-facing label chosen during registration.
  display_name: string;
  // email_verified is reserved for future UX, but already mirrors the backend profile shape exactly.
  email_verified: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  // email is kept separately because the backend still uses it as the canonical login identifier.
  email: string;
  profile: AuthProfile;
}
