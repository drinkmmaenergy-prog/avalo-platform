/**
 * PACK 449 - Role Segmentation Engine
 * 
 * Enforces hard separations between departments:
 * - Product vs Engineering vs Finance vs Compliance vs Support
 * - Prevents cross-domain access
 * - Controls blast radius of compromised accounts
 * - One role ≠ full stack
 * 
 * Dependencies:
 * - PACK 296: Compliance & Audit Layer
 * - PACK 449: Zero-Trust Access Manager
 */

export type Department = 
  | 'product'
  | 'engineering'
  | 'finance'
  | 'compliance'
  | 'legal'
  | 'support'
  | 'data'
  | 'security'
  | 'executive';

export interface RoleSegmentation {
  role: string;
  department: Department;
  allowedDomains: string[];
  blockedDomains: string[];
  canAccessUserData: boolean;
  canAccessFinancialData: boolean;
  canAccessSecurityData: boolean;
  canAccessInfrastructure: boolean;
  maxBlastRadius: 'low' | 'medium' | 'high' | 'critical';
}

export interface CrossDepartmentRequest {
  id: string;
  requesterId: string;
  requesterRole: string;
  requesterDepartment: Department;
  targetDepartment: Department;
  targetResource: string;
  justification: string;
  status: 'pending' | 'approved' | 'denied';
  approvers: string[];
  createdAt: Date;
  resolvedAt?: Date;
}

export interface DomainAccess {
  domain: string;
  description: string;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  allowedDepartments: Department[];
  requiresApproval: boolean;
}

// Domain definitions
const DOMAINS: Record<string, DomainAccess> = {
  // Code domains
  'code.read': {
    domain: 'code.read',
    description: 'Read access to source code',
    sensitivity: 'medium',
    allowedDepartments: ['engineering', 'security'],
    requiresApproval: false
  },
  'code.write.backend': {
    domain: 'code.write.backend',
    description: 'Write access to backend code',
    sensitivity: 'high',
    allowedDepartments: ['engineering'],
    requiresApproval: false
  },
  'code.write.frontend': {
    domain: 'code.write.frontend',
    description: 'Write access to frontend code',
    sensitivity: 'high',
    allowedDepartments: ['engineering'],
    requiresApproval: false
  },
  'code.write.mobile': {
    domain: 'code.write.mobile',
    description: 'Write access to mobile code',
    sensitivity: 'high',
    allowedDepartments: ['engineering'],
    requiresApproval: false
  },
  
  // Infrastructure domains
  'infrastructure.read': {
    domain: 'infrastructure.read',
    description: 'Read access to infrastructure',
    sensitivity: 'high',
    allowedDepartments: ['engineering', 'security', 'executive'],
    requiresApproval: false
  },
  'infrastructure.manage': {
    domain: 'infrastructure.manage',
    description: 'Manage infrastructure',
    sensitivity: 'critical',
    allowedDepartments: ['engineering'],
    requiresApproval: true
  },
  
  // User data domains
  'users.read.limited': {
    domain: 'users.read.limited',
    description: 'Limited read access to user data',
    sensitivity: 'medium',
    allowedDepartments: ['support', 'data'],
    requiresApproval: false
  },
  'users.read': {
    domain: 'users.read',
    description: 'Full read access to user data',
    sensitivity: 'high',
    allowedDepartments: ['support', 'compliance', 'legal'],
    requiresApproval: true
  },
  'users.edit.limited': {
    domain: 'users.edit.limited',
    description: 'Limited edit access to user data',
    sensitivity: 'high',
    allowedDepartments: ['support'],
    requiresApproval: true
  },
  
  // Financial domains
  'financial.read': {
    domain: 'financial.read',
    description: 'Read access to financial data',
    sensitivity: 'critical',
    allowedDepartments: ['finance', 'executive', 'compliance'],
    requiresApproval: false
  },
  'financial.write': {
    domain: 'financial.write',
    description: 'Write access to financial data',
    sensitivity: 'critical',
    allowedDepartments: ['finance'],
    requiresApproval: true
  },
  'transactions.read': {
    domain: 'transactions.read',
    description: 'Read access to transactions',
    sensitivity: 'critical',
    allowedDepartments: ['finance', 'compliance'],
    requiresApproval: false
  },
  'payouts.approve': {
    domain: 'payouts.approve',
    description: 'Approve payouts',
    sensitivity: 'critical',
    allowedDepartments: ['finance'],
    requiresApproval: true
  },
  
  // Compliance domains
  'compliance.read': {
    domain: 'compliance.read',
    description: 'Read access to compliance data',
    sensitivity: 'high',
    allowedDepartments: ['compliance', 'legal', 'executive'],
    requiresApproval: false
  },
  'compliance.write': {
    domain: 'compliance.write',
    description: 'Write access to compliance data',
    sensitivity: 'high',
    allowedDepartments: ['compliance'],
    requiresApproval: false
  },
  'audit_logs.read': {
    domain: 'audit_logs.read',
    description: 'Read access to audit logs',
    sensitivity: 'high',
    allowedDepartments: ['compliance', 'security', 'executive'],
    requiresApproval: false
  },
  
  // Security domains
  'security.read': {
    domain: 'security.read',
    description: 'Read access to security data',
    sensitivity: 'critical',
    allowedDepartments: ['security', 'executive'],
    requiresApproval: false
  },
  'security.investigate': {
    domain: 'security.investigate',
    description: 'Investigate security incidents',
    sensitivity: 'critical',
    allowedDepartments: ['security'],
    requiresApproval: false
  },
  'incidents.manage': {
    domain: 'incidents.manage',
    description: 'Manage security incidents',
    sensitivity: 'critical',
    allowedDepartments: ['security'],
    requiresApproval: false
  },
  
  // Analytics domains
  'analytics.read': {
    domain: 'analytics.read',
    description: 'Read access to analytics',
    sensitivity: 'low',
    allowedDepartments: ['product', 'data', 'executive'],
    requiresApproval: false
  },
  'data.read.anonymized': {
    domain: 'data.read.anonymized',
    description: 'Read anonymized data',
    sensitivity: 'low',
    allowedDepartments: ['product', 'data', 'executive'],
    requiresApproval: false
  }
};

// Role-to-Department mapping
const ROLE_DEPARTMENTS: Record<string, Department> = {
  product_manager: 'product',
  engineer_backend: 'engineering',
  engineer_frontend: 'engineering',
  engineer_mobile: 'engineering',
  engineer_infra: 'engineering',
  finance_analyst: 'finance',
  finance_controller: 'finance',
  compliance_officer: 'compliance',
  legal_counsel: 'legal',
  support_tier1: 'support',
  support_tier2: 'support',
  support_tier3: 'support',
  data_analyst: 'data',
  security_analyst: 'security',
  executive_cto: 'executive',
  executive_ceo: 'executive',
  executive_cfo: 'executive'
};

export class RoleSegmentationEngine {
  
  /**
   * Check if role can access domain
   */
  canAccessDomain(role: string, domain: string): boolean {
    const domainAccess = DOMAINS[domain];
    if (!domainAccess) {
      return false;
    }
    
    const department = ROLE_DEPARTMENTS[role];
    if (!department) {
      return false;
    }
    
    return domainAccess.allowedDepartments.includes(department);
  }
  
  /**
   * Check if domain requires approval
   */
  requiresApproval(domain: string): boolean {
    const domainAccess = DOMAINS[domain];
    return domainAccess?.requiresApproval || false;
  }
  
  /**
   * Get department for role
   */
  getDepartment(role: string): Department {
    return ROLE_DEPARTMENTS[role] || 'support';
  }
  
  /**
   * Get all accessible domains for role
   */
  getAccessibleDomains(role: string): string[] {
    const department = this.getDepartment(role);
    
    return Object.keys(DOMAINS).filter(domain => {
      const access = DOMAINS[domain];
      return access.allowedDepartments.includes(department);
    });
  }
  
  /**
   * Get blocked domains for role
   */
  getBlockedDomains(role: string): string[] {
    const department = this.getDepartment(role);
    
    return Object.keys(DOMAINS).filter(domain => {
      const access = DOMAINS[domain];
      return !access.allowedDepartments.includes(department);
    });
  }
  
  /**
   * Get role segmentation info
   */
  getRoleSegmentation(role: string): RoleSegmentation {
    const department = this.getDepartment(role);
    const allowedDomains = this.getAccessibleDomains(role);
    const blockedDomains = this.getBlockedDomains(role);
    
    // Determine capabilities
    const canAccessUserData = allowedDomains.some(d => d.startsWith('users.'));
    const canAccessFinancialData = allowedDomains.some(d => d.startsWith('financial.') || d.startsWith('transactions.'));
    const canAccessSecurityData = allowedDomains.some(d => d.startsWith('security.') || d.startsWith('incidents.'));
    const canAccessInfrastructure = allowedDomains.some(d => d.startsWith('infrastructure.'));
    
    // Determine blast radius
    let maxBlastRadius: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    if (canAccessInfrastructure) {
      maxBlastRadius = 'critical';
    } else if (canAccessFinancialData || canAccessSecurityData) {
      maxBlastRadius = 'high';
    } else if (canAccessUserData) {
      maxBlastRadius = 'medium';
    }
    
    return {
      role,
      department,
      allowedDomains,
      blockedDomains,
      canAccessUserData,
      canAccessFinancialData,
      canAccessSecurityData,
      canAccessInfrastructure,
      maxBlastRadius
    };
  }
  
  /**
   * Request cross-department access
   */
  async requestCrossDepartmentAccess(
    requesterId: string,
    requesterRole: string,
    targetDepartment: Department,
    targetResource: string,
    justification: string
  ): Promise<CrossDepartmentRequest> {
    const requesterDepartment = this.getDepartment(requesterRole);
    
    const request: CrossDepartmentRequest = {
      id: `cross_dept_${Date.now()}_${requesterId}`,
      requesterId,
      requesterRole,
      requesterDepartment,
      targetDepartment,
      targetResource,
      justification,
      status: 'pending',
      approvers: [],
      createdAt: new Date()
    };
    
    // Would be stored in Firestore
    console.log('Cross-department access request created:', request);
    
    return request;
  }
  
  /**
   * Validate cross-department access
   */
  validateCrossDepartmentAccess(
    fromDepartment: Department,
    toDepartment: Department,
    resource: string
  ): {valid: boolean; reason?: string} {
    // Hard blocks
    if (fromDepartment === 'support' && toDepartment === 'finance') {
      return {
        valid: false,
        reason: 'Support staff cannot access financial data'
      };
    }
    
    if (fromDepartment === 'product' && toDepartment === 'finance') {
      return {
        valid: false,
        reason: 'Product team cannot access financial data'
      };
    }
    
    if (fromDepartment === 'product' && toDepartment === 'security') {
      return {
        valid: false,
        reason: 'Product team cannot access security data'
      };
    }
    
    // All cross-department access requires justification
    return {
      valid: true
    };
  }
  
  /**
   * Get departments with access to domain
   */
  getDepartmentsWithAccess(domain: string): Department[] {
    const domainAccess = DOMAINS[domain];
    return domainAccess?.allowedDepartments || [];
  }
  
  /**
   * Check if action crosses department boundary
   */
  crossesDepartmentBoundary(
    requesterRole: string,
    targetDomain: string
  ): boolean {
    const requesterDept = this.getDepartment(requesterRole);
    const allowedDepts = this.getDepartmentsWithAccess(targetDomain);
    
    return !allowedDepts.includes(requesterDept);
  }
  
  /**
   * Get blast radius explanation
   */
  getBlastRadiusExplanation(role: string): string {
    const segmentation = this.getRoleSegmentation(role);
    
    switch (segmentation.maxBlastRadius) {
      case 'low':
        return 'Limited to read-only analytics and non-sensitive data';
      case 'medium':
        return 'Can access user data, but not financial or infrastructure';
      case 'high':
        return 'Can access sensitive financial or security data';
      case 'critical':
        return 'Can access infrastructure with potential for system-wide impact';
      default:
        return 'Unknown';
    }
  }
}

export const roleSegmentationEngine = new RoleSegmentationEngine();
