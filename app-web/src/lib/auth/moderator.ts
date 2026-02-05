export type ModeratorRole = 'admin' | 'moderator' | 'user' | null;

export function getRoleBadgeColor(role: ModeratorRole): string {
  switch (role) {
    case 'admin':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'moderator':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'user':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getRoleDisplayName(role: ModeratorRole): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'moderator':
      return 'Moderator';
    case 'user':
      return 'User';
    default:
      return 'Unknown';
  }
}
