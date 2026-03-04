/**
 * Moderator Auth — Client-side helpers for role display.
 */

export function getRoleDisplayName(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'moderator':
      return 'Moderator';
    case 'creator':
      return 'Creator';
    default:
      return 'User';
  }
}

export function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-800';
    case 'moderator':
      return 'bg-blue-100 text-blue-800';
    case 'creator':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
