import type { ModeratorUser } from '@/lib/moderation/auth';
import { ModerationTopbarClient } from './TopbarClient';

interface ModerationTopbarProps {
  user: ModeratorUser | null;
}

export function ModerationTopbar({ user }: ModerationTopbarProps) {
  return <ModerationTopbarClient user={user} />;
}