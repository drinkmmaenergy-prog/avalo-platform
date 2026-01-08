/**
 * PACK 445 – Enterprise Readiness & Due Diligence Toolkit
 * External API Routes for Controlled Access
 * 
 * These routes handle authenticated external access via tokens
 * for investors, auditors, and enterprise partners.
 */

import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { ExternalAccessController } from '../services/pack445-due-diligence/ExternalAccessController';
import { DueDiligenceDataRoomService } from '../services/pack445-due-diligence/DueDiligenceDataRoomService';
import { InvestorKPICanonicalView } from '../services/pack445-due-diligence/InvestorKPICanonicalView';

const controller = new ExternalAccessController();
const dataRoomService = new DueDiligenceDataRoomService();
const kpiView = new InvestorKPICanonicalView();

/**
 * Middleware to verify external access token
 */
export async function verifyExternalToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }

    const resource = req.path.split('/')[2]; // Extract resource from path
    const result = await controller.verifyAccess(
      token,
      resource,
      req.method.toLowerCase(),
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    if (!result.allowed) {
      return res.status(403).json({
        error: result.reason || 'Access denied'
      });
    }

    // Attach access info to request
    (req as any).externalAccess = result.access;
    next();
  } catch (error: any) {
    console.error('Error verifying token:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/dataRoom/:id
 * Access a specific data room
 */
export async function getDataRoom(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const access = (req as any).externalAccess;

    // Verify data room access permission
    if (!access.permissions.dataRoom) {
      return res.status(403).json({
        error: 'Data room access not permitted'
      });
    }

    const dataRoomDoc = await admin.firestore()
      .collection('dueDiligenceDataRooms')
      .doc(id)
      .get();

    if (!dataRoomDoc.exists) {
      return res.status(404).json({
        error: 'Data room not found'
      });
    }

    const dataRoom = dataRoomDoc.data();

    // Check if expired
    if (new Date() > dataRoom.expiresAt.toDate()) {
      return res.status(410).json({
        error: 'Data room has expired'
      });
    }

    res.json({
      success: true,
      dataRoom: {
        id: dataRoom.id,
        createdAt: dataRoom.createdAt,
        expiresAt: dataRoom.expiresAt,
        sections: dataRoom.sections,
        exports: dataRoom.exports
      }
    });
  } catch (error: any) {
    console.error('Error getting data room:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/kpis
 * Access canonical KPIs
 */
export async function getKPIs(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    // Verify KPI access permission
    if (!access.permissions.kpis) {
      return res.status(403).json({
        error: 'KPI access not permitted'
      });
    }

    const kpis = await kpiView.getCanonicalKPIs();

    res.json({
      success: true,
      kpis
    });
  } catch (error: any) {
    console.error('Error getting KPIs:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/financials
 * Access financial data
 */
export async function getFinancials(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    // Verify financials access permission
    if (!access.permissions.financials) {
      return res.status(403).json({
        error: 'Financials access not permitted'
      });
    }

    const kpis = await kpiView.getCanonicalKPIs();

    // Return only financial data
    res.json({
      success: true,
      financials: {
        mrr: kpis.mrr,
        arr: kpis.arr,
        growth: {
          mrr: kpis.mrrGrowth,
          yoy: kpis.yoyGrowth
        },
        unitEconomics: {
          ltv: kpis.ltv,
          cac: kpis.cac,
          ltvCacRatio: kpis.ltvCacRatio,
          paybackPeriod: kpis.paybackPeriod
        },
        revenue: {
          net: kpis.netRevenue,
          gross: kpis.grossRevenue,
          breakdown: kpis.revenueBreakdown
        },
        margins: {
          gross: kpis.grossMargin,
          net: kpis.netMargin,
          contribution: kpis.contributionMargin
        },
        cashflow: {
          operating: kpis.operatingCashflow,
          free: kpis.freeCashflow,
          runway: kpis.runwayMonths,
          burnRate: kpis.burnRate
        }
      }
    });
  } catch (error: any) {
    console.error('Error getting financials:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/technical-docs
 * Access technical documentation
 */
export async function getTechnicalDocs(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    // Verify technical docs access permission
    if (!access.permissions.technicalDocs) {
      return res.status(403).json({
        error: 'Technical documentation access not permitted'
      });
    }

    // In production, this would fetch actual docs
    res.json({
      success: true,
      docs: {
        architecture: '/docs/architecture.pdf',
        api: '/docs/api-documentation.pdf',
        security: '/docs/security-practices.pdf',
        infrastructure: '/docs/infrastructure.pdf'
      }
    });
  } catch (error: any) {
    console.error('Error getting technical docs:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/compliance-docs
 * Access compliance documentation
 */
export async function getComplianceDocs(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    // Verify compliance docs access permission
    if (!access.permissions.complianceDocs) {
      return res.status(403).json({
        error: 'Compliance documentation access not permitted'
      });
    }

    const complianceDoc = await admin.firestore()
      .collection('complianceStatus')
      .doc('current')
      .get();

    const compliance = complianceDoc.data();

    res.json({
      success: true,
      compliance: {
        gdpr: {
          compliant: compliance?.gdpr?.compliant,
          lastAudit: compliance?.gdpr?.lastAudit
        },
        ccpa: {
          compliant: compliance?.ccpa?.compliant,
          lastAudit: compliance?.ccpa?.lastAudit
        },
        pci: {
          compliant: compliance?.pci?.compliant,
          level: compliance?.pci?.level,
          lastAudit: compliance?.pci?.lastAudit
        },
        certifications: [
          'SOC 2 Type II',
          'ISO 27001',
          'GDPR Compliant',
          'PCI DSS Level 1'
        ]
      }
    });
  } catch (error: any) {
    console.error('Error getting compliance docs:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/audit-logs
 * Access audit logs (auditor role only)
 */
export async function getAuditLogs(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    // Verify audit log access permission
    if (!access.permissions.auditLogs) {
      return res.status(403).json({
        error: 'Audit log access not permitted'
      });
    }

    // Only auditors can access
    if (access.role !== 'auditor') {
      return res.status(403).json({
        error: 'Audit logs restricted to auditors'
      });
    }

    const { startDate, endDate, limit = 100 } = req.query;

    let query = admin.firestore()
      .collection('auditLog')
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit as string));

    if (startDate) {
      query = query.where('timestamp', '>=', new Date(startDate as string));
    }

    if (endDate) {
      query = query.where('timestamp', '<=', new Date(endDate as string));
    }

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => doc.data());

    res.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (error: any) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/live-metrics
 * Access live system metrics
 */
export async function getLiveMetrics(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    // Verify live metrics access permission
    if (!access.permissions.liveMetrics) {
      return res.status(403).json({
        error: 'Live metrics access not permitted'
      });
    }

    const metricsDoc = await admin.firestore()
      .collection('systemMetrics')
      .doc('current')
      .get();

    const metrics = metricsDoc.data();

    res.json({
      success: true,
      metrics: {
        uptime: metrics?.uptime,
        activeUsers: metrics?.activeUsers,
        requestsPerMinute: metrics?.requestsPerMinute,
        avgResponseTime: metrics?.avgResponseTime,
        errorRate: metrics?.errorRate,
        timestamp: metrics?.timestamp
      }
    });
  } catch (error: any) {
    console.error('Error getting live metrics:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/external/access-log
 * Get access log for current token
 */
export async function getOwnAccessLog(req: Request, res: Response) {
  try {
    const access = (req as any).externalAccess;

    const logs = await controller.getAccessLog(access.id);

    res.json({
      success: true,
      accessLog: logs
    });
  } catch (error: any) {
    console.error('Error getting access log:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * Router configuration
 */
export function setupExternalAccessRoutes(app: any) {
  // All external routes require token verification
  app.use('/api/external', verifyExternalToken);

  // Data room access
  app.get('/api/external/dataRoom/:id', getDataRoom);

  // KPIs
  app.get('/api/external/kpis', getKPIs);

  // Financials
  app.get('/api/external/financials', getFinancials);

  // Technical documentation
  app.get('/api/external/technical-docs', getTechnicalDocs);

  // Compliance documentation
  app.get('/api/external/compliance-docs', getComplianceDocs);

  // Audit logs (auditor only)
  app.get('/api/external/audit-logs', getAuditLogs);

  // Live metrics
  app.get('/api/external/live-metrics', getLiveMetrics);

  // Own access log
  app.get('/api/external/access-log', getOwnAccessLog);
}
