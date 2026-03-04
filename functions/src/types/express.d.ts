/**
 * Express type extensions for Avalo
 * Extends Express Request to include user property added by auth middleware
 */

import { DecodedIdToken } from 'firebase-admin/auth';

declare global {
  namespace Express {
    interface Request {
      user?: DecodedIdToken & {
        uid: string;
        email?: string;
        name?: string;
        picture?: string;
        [key: string]: any;
      };
    }
  }
}

export {};









