"use client";

/**
 * PHASE 3.3 — Role-Based Access Control Hook
 * 
 * Enforces role-based access (user / creator / admin) for web surfaces.
 * NO business logic — just checks user role from profile.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { UserRole } from '@/types/phase33.types';

interface UseRoleGateOptions {
  requiredRole: UserRole;
  redirectTo?: string;
}

interface RoleGateResult {
  isAuthorized: boolean;
  isLoading: boolean;
  userRole: UserRole | null;
}

/**
 * Check if user has admin role by reading from Firestore admin_users collection.
 */
async function checkIsAdmin(uid: string): Promise<boolean> {
  try {
    const adminDoc = await getDoc(doc(requireDb(), 'admin_users', uid));
    return adminDoc.exists() && adminDoc.data()?.isActive === true;
  } catch {
    return false;
  }
}

/**
 * Check if user has required role.
 * Returns loading state and authorization status.
 */
export function useRoleGate(options: UseRoleGateOptions): RoleGateResult {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  
  useEffect(() => {
    async function checkRole() {
      if (authLoading) {
        return;
      }
      
      // Not logged in
      if (!user) {
        setIsLoading(false);
        setIsAuthorized(false);
        setUserRole(null);
        
        if (options.redirectTo) {
          router.push(options.redirectTo);
        }
        return;
      }
      
      // Determine user role
      let role: UserRole = 'user';
      
      // Check admin status from Firestore
      const isAdmin = await checkIsAdmin(user.uid);
      if (isAdmin) {
        role = 'admin';
      } else if (user.isCreator) {
        role = 'creator';
      }
      
      setUserRole(role);
      
      // Check authorization based on role hierarchy
      // admin > creator > user
      const roleHierarchy: Record<UserRole, number> = {
        user: 1,
        creator: 2,
        admin: 3,
      };
      
      const hasAccess = roleHierarchy[role] >= roleHierarchy[options.requiredRole];
      setIsAuthorized(hasAccess);
      setIsLoading(false);
      
      if (!hasAccess && options.redirectTo) {
        router.push(options.redirectTo);
      }
    }
    
    checkRole();
  }, [user, authLoading, options.requiredRole, options.redirectTo, router]);
  
  return {
    isAuthorized,
    isLoading,
    userRole,
  };
}

/**
 * Simple hook to check if current user is a creator.
 */
export function useIsCreator(): { isCreator: boolean; isLoading: boolean } {
  const result = useRoleGate({ requiredRole: 'creator' });
  return {
    isCreator: result.isAuthorized,
    isLoading: result.isLoading,
  };
}

/**
 * Simple hook to check if current user is an admin.
 */
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const result = useRoleGate({ requiredRole: 'admin' });
  return {
    isAdmin: result.isAuthorized,
    isLoading: result.isLoading,
  };
}

/**
 * Loading spinner component for role gate.
 */
function RoleGateLoading(): React.JSX.Element {
  return React.createElement('div', {
    className: 'flex items-center justify-center min-h-screen',
  }, React.createElement('div', {
    className: 'animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600',
  }));
}

/**
 * HOC-style wrapper for role-gated pages.
 * Use in page components to enforce access control.
 */
export function withRoleGate<P extends object>(
  requiredRole: UserRole,
  redirectTo: string = '/auth/login'
) {
  return function RoleGatedComponent(Component: React.ComponentType<P>) {
    return function WrappedComponent(props: P): React.JSX.Element | null {
      const { isAuthorized, isLoading } = useRoleGate({ requiredRole, redirectTo });
      
      if (isLoading) {
        return React.createElement(RoleGateLoading);
      }
      
      if (!isAuthorized) {
        return null; // Redirect will happen in useRoleGate
      }
      
      return React.createElement(Component, props);
    };
  };
}


