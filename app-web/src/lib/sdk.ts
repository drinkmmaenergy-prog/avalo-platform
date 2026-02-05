import type { User } from '@/types';

const sdk = {
  auth: {},
  api: {},

  // Auth methods
  signInWithEmail: async (email: string, password: string): Promise<void> => {
    // Stub implementation
  },
  signInWithGoogle: async (): Promise<void> => {
    // Stub implementation
  },
  signInWithApple: async (): Promise<void> => {
    // Stub implementation
  },
  signOut: async (): Promise<void> => {
    // Stub implementation
  },

  // Profile methods
  getUserProfile: async (userId: string): Promise<User | null> => {
    return null;
  },
};

export default sdk;
