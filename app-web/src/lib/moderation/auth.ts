export interface ModeratorUser {
  displayName?: string;
  email?: string;
}

export async function requireModerator() {
  return true;
}

export async function requireAdmin() {
  return true;
}

export interface ModeratorAccessResult {
  hasAccess: boolean;
  user: ModeratorUser | null;
}

export async function checkModeratorAccess(): Promise<ModeratorAccessResult> {
  return {
    hasAccess: true,
    user: null,
  };
}
