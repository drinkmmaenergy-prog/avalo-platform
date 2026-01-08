/**
 * PACK 447 — Global Data Residency & Sovereignty Control
 * JurisdictionAwareStorageRouter
 * 
 * Dynamic write routing to appropriate cloud regions and local storage pools
 * Zero manual exceptions - fully automated based on residency policies
 */

import { DataResidencyPolicyEngine, DataClassification, ComplianceRegion } from './DataResidencyPolicyEngine';
import { SovereigntyAuditLogger } from './SovereigntyAuditLogger';
import { Storage } from '@google-cloud/storage';
import { firestore } from '../firebase-admin';

export interface StorageBackend {
  backendId: string;
  name: string;
  type: 'GCS' | 'AWS_S3' | 'AZURE_BLOB' | 'LOCAL';
  region: ComplianceRegion;
  country: string;
  dataCenter: string;
  
  config: {
    bucketName?: string;
    projectId?: string;
    endpoint?: string;
    credentials?: any;
  };
  
  capabilities: {
    maxFileSize: number;
    supportedFormats: string[];
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
  };
  
  status: 'ACTIVE' | 'DEGRADED' | 'OFFLINE';
  priority: number; // Higher = preferred
  healthScore: number; // 0-100
  lastHealthCheck: Date;
}

export interface StorageRoutingDecision {
  userId: string;
  dataType: DataClassification;
  fileSize: number;
  
  selectedBackend: StorageBackend;
  alternativeBackends: StorageBackend[];
  
  path: string;
  url: string;
  
  reasoning: string;
  decidedAt: Date;
}

export class JurisdictionAwareStorageRouter {
  private static instance: JurisdictionAwareStorageRouter;
  private policyEngine: DataResidencyPolicyEngine;
  private auditLogger: SovereigntyAuditLogger;
  
  private backends: Map<string, StorageBackend> = new Map();
  private storageClients: Map<string, Storage> = new Map();
  
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private healthCheckTimer?: NodeJS.Timeout;

  private constructor() {
    this.policyEngine = DataResidencyPolicyEngine.getInstance();
    this.auditLogger = SovereigntyAuditLogger.getInstance();
    this.initializeBackends();
    this.startHealthChecks();
  }

  public static getInstance(): JurisdictionAwareStorageRouter {
    if (!JurisdictionAwareStorageRouter.instance) {
      JurisdictionAwareStorageRouter.instance = new JurisdictionAwareStorageRouter();
    }
    return JurisdictionAwareStorageRouter.instance;
  }

  /**
   * Initialize storage backends for each compliance region
   */
  private async initializeBackends(): Promise<void> {
    const defaultBackends: Partial<StorageBackend>[] = [
      // EU Region
      {
        name: 'GCS_EU_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.EU,
        country: 'Germany',
        dataCenter: 'europe-west3',
        config: {
          bucketName: process.env.GCS_EU_BUCKET || 'avalo-eu-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // UK Region
      {
        name: 'GCS_UK_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.UK,
        country: 'United Kingdom',
        dataCenter: 'europe-west2',
        config: {
          bucketName: process.env.GCS_UK_BUCKET || 'avalo-uk-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // US Region
      {
        name: 'GCS_US_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.US,
        country: 'United States',
        dataCenter: 'us-east4',
        config: {
          bucketName: process.env.GCS_US_BUCKET || 'avalo-us-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // APAC Region
      {
        name: 'GCS_APAC_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.APAC,
        country: 'Singapore',
        dataCenter: 'asia-southeast1',
        config: {
          bucketName: process.env.GCS_APAC_BUCKET || 'avalo-apac-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // India Region (specific due to DPDPA)
      {
        name: 'GCS_INDIA_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.INDIA,
        country: 'India',
        dataCenter: 'asia-south1',
        config: {
          bucketName: process.env.GCS_INDIA_BUCKET || 'avalo-india-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // Brazil Region (LGPD compliance)
      {
        name: 'GCS_BRAZIL_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.BRAZIL,
        country: 'Brazil',
        dataCenter: 'southamerica-east1',
        config: {
          bucketName: process.env.GCS_BRAZIL_BUCKET || 'avalo-brazil-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // MENA Region
      {
        name: 'GCS_MENA_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.MENA,
        country: 'UAE',
        dataCenter: 'me-west1',
        config: {
          bucketName: process.env.GCS_MENA_BUCKET || 'avalo-mena-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      },
      
      // Switzerland (stricter than EU)
      {
        name: 'GCS_SWITZERLAND_PRIMARY',
        type: 'GCS',
        region: ComplianceRegion.SWITZERLAND,
        country: 'Switzerland',
        dataCenter: 'europe-west6',
        config: {
          bucketName: process.env.GCS_SWITZERLAND_BUCKET || 'avalo-switzerland-data',
          projectId: process.env.GCP_PROJECT_ID
        },
        capabilities: {
          maxFileSize: 5 * 1024 * 1024 * 1024,
          supportedFormats: ['*'],
          encryptionAtRest: true,
          encryptionInTransit: true
        },
        priority: 100,
        status: 'ACTIVE'
      }
    ];

    // Store in Firestore
    const batch = firestore.batch();
    for (const backend of defaultBackends) {
      const backendId = `backend_${backend.name?.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const docRef = firestore.collection('storageBackends').doc(backendId);
      
      batch.set(docRef, {
        ...backend,
        backendId,
        healthScore: 100,
        lastHealthCheck: new Date()
      }, { merge: true });

      // Cache locally
      this.backends.set(backendId, {
        ...backend,
        backendId,
        healthScore: 100,
        lastHealthCheck: new Date()
      } as StorageBackend);
    }

    try {
      await batch.commit();
      console.log('[JurisdictionAwareStorageRouter] Storage backends initialized');
    } catch (error) {
      console.error('[JurisdictionAwareStorageRouter] Failed to initialize backends:', error);
    }
  }

  /**
   * Route storage write to appropriate backend
   */
  public async routeStorage(params: {
    userId: string;
    userRegion: ComplianceRegion;
    dataType: DataClassification;
    fileName: string;
    fileSize: number;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<StorageRoutingDecision> {
    // Get residency decision
    const residency = await this.policyEngine.determineResidency({
      userId: params.userId,
      userRegion: params.userRegion,
      dataType: params.dataType
    });

    // Find suitable backends
    const suitableBackends = await this.findSuitableBackends({
      allowedRegions: residency.storage.allowedRegions,
      prohibitedRegions: residency.storage.prohibitedRegions,
      primaryRegion: residency.storage.primaryRegion,
      fileSize: params.fileSize,
      isolationMode: residency.storage.isolationMode
    });

    if (suitableBackends.length === 0) {
      throw new Error(
        `No suitable storage backend found for user ${params.userId} in region ${params.userRegion}. ` +
        `Allowed regions: ${residency.storage.allowedRegions.join(', ')}`
      );
    }

    // Select best backend
    const selectedBackend = this.selectBestBackend(suitableBackends, residency.storage.primaryRegion);

    // Generate storage path
    const path = this.generateStoragePath({
      userId: params.userId,
      dataType: params.dataType,
      fileName: params.fileName,
      region: selectedBackend.region
    });

    // Generate signed URL (will be implemented in actual storage operation)
    const url = `gs://${selectedBackend.config.bucketName}/${path}`;

    const decision: StorageRoutingDecision = {
      userId: params.userId,
      dataType: params.dataType,
      fileSize: params.fileSize,
      selectedBackend,
      alternativeBackends: suitableBackends.filter(b => b.backendId !== selectedBackend.backendId),
      path,
      url,
      reasoning: `Selected ${selectedBackend.name} in ${selectedBackend.region} based on residency policy. ` +
                `Allowed regions: ${residency.storage.allowedRegions.join(', ')}`,
      decidedAt: new Date()
    };

    // Audit log
    await this.auditLogger.logDataAccess({
      userId: params.userId,
      systemServiceId: 'JurisdictionAwareStorageRouter',
      dataType: params.dataType,
      classification: params.dataType,
      region: selectedBackend.region,
      country: selectedBackend.country,
      dataCenter: selectedBackend.dataCenter,
      policyIds: residency.appliedPolicies,
      success: true
    });

    return decision;
  }

  /**
   * Find backends suitable for the given requirements
   */
  private async findSuitableBackends(params: {
    allowedRegions: ComplianceRegion[];
    prohibitedRegions: ComplianceRegion[];
    primaryRegion: ComplianceRegion;
    fileSize: number;
    isolationMode: boolean;
  }): Promise<StorageBackend[]> {
    // Reload backends from Firestore
    const snapshot = await firestore
      .collection('storageBackends')
      .where('status', '==', 'ACTIVE')
      .get();

    const allBackends = snapshot.docs.map(doc => doc.data() as StorageBackend);

    return allBackends.filter(backend => {
      // Check allowed regions
      if (!params.allowedRegions.includes(backend.region)) {
        return false;
      }

      // Check prohibited regions
      if (params.prohibitedRegions.includes(backend.region)) {
        return false;
      }

      // Check file size capability
      if (params.fileSize > backend.capabilities.maxFileSize) {
        return false;
      }

      // Check health score
      if (backend.healthScore < 50) {
        return false;
      }

      // In isolation mode, only allow primary region
      if (params.isolationMode && backend.region !== params.primaryRegion) {
        return false;
      }

      return true;
    });
  }

  /**
   * Select best backend from suitable options
   */
  private selectBestBackend(
    backends: StorageBackend[],
    primaryRegion: ComplianceRegion
  ): StorageBackend {
    // Sort by priority, then health score
    backends.sort((a, b) => {
      // Prefer primary region
      if (a.region === primaryRegion && b.region !== primaryRegion) return -1;
      if (b.region === primaryRegion && a.region !== primaryRegion) return 1;

      // Then by priority
      if (a.priority !== b.priority) return b.priority - a.priority;

      // Then by health score
      return b.healthScore - a.healthScore;
    });

    return backends[0];
  }

  /**
   * Generate organized storage path
   */
  private generateStoragePath(params: {
    userId: string;
    dataType: DataClassification;
    fileName: string;
    region: ComplianceRegion;
  }): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Sanitize filename
    const sanitizedFileName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    return `${params.region}/${params.dataType}/${params.userId}/${year}/${month}/${day}/${Date.now()}_${sanitizedFileName}`;
  }

  /**
   * Upload file to selected backend
   */
  public async uploadFile(params: {
    routingDecision: StorageRoutingDecision;
    fileBuffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<{
    success: boolean;
    url: string;
    signedUrl?: string;
    error?: string;
  }> {
    const { routingDecision, fileBuffer, contentType, metadata } = params;
    const backend = routingDecision.selectedBackend;

    try {
      // Get or create storage client
      let storage = this.storageClients.get(backend.backendId);
      if (!storage) {
        storage = new Storage({
          projectId: backend.config.projectId
        });
        this.storageClients.set(backend.backendId, storage);
      }

      const bucket = storage.bucket(backend.config.bucketName!);
      const file = bucket.file(routingDecision.path);

      // Upload with metadata
      await file.save(fileBuffer, {
        contentType,
        metadata: {
          ...metadata,
          userId: routingDecision.userId,
          dataType: routingDecision.dataType,
          region: backend.region,
          uploadedAt: new Date().toISOString()
        },
        resumable: false
      });

      // Generate signed URL (valid for 1 hour)
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000
      });

      // Audit log
      await this.auditLogger.logDataAccess({
        userId: routingDecision.userId,
        systemServiceId: 'JurisdictionAwareStorageRouter',
        dataType: routingDecision.dataType,
        classification: routingDecision.dataType,
        region: backend.region,
        country: backend.country,
        dataCenter: backend.dataCenter,
        success: true
      });

      return {
        success: true,
        url: routingDecision.url,
        signedUrl
      };
    } catch (error: any) {
      // Audit log failure
      await this.auditLogger.logDataAccess({
        userId: routingDecision.userId,
        systemServiceId: 'JurisdictionAwareStorageRouter',
        dataType: routingDecision.dataType,
        classification: routingDecision.dataType,
        region: backend.region,
        country: backend.country,
        dataCenter: backend.dataCenter,
        success: false,
        errorMessage: error.message
      });

      // Try alternative backend
      if (routingDecision.alternativeBackends.length > 0) {
        console.warn(
          `[JurisdictionAwareStorageRouter] Primary backend failed, trying alternative: ${error.message}`
        );
        
        const alternativeDecision = {
          ...routingDecision,
          selectedBackend: routingDecision.alternativeBackends[0],
          alternativeBackends: routingDecision.alternativeBackends.slice(1)
        };

        return this.uploadFile({
          routingDecision: alternativeDecision,
          fileBuffer,
          contentType,
          metadata
        });
      }

      return {
        success: false,
        url: routingDecision.url,
        error: error.message
      };
    }
  }

  /**
   * Start health checks for all backends
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);

    // Initial check
    this.performHealthChecks();
  }

  /**
   * Perform health checks on all backends
   */
  private async performHealthChecks(): Promise<void> {
    for (const [backendId, backend] of this.backends.entries()) {
      try {
        const storage = new Storage({
          projectId: backend.config.projectId
        });

        const bucket = storage.bucket(backend.config.bucketName!);
        
        // Simple health check: try to list files (with limit)
        await bucket.getFiles({ maxResults: 1 });

        // Update health score
        await firestore
          .collection('storageBackends')
          .doc(backendId)
          .update({
            status: 'ACTIVE',
            healthScore: 100,
            lastHealthCheck: new Date()
          });

        backend.status = 'ACTIVE';
        backend.healthScore = 100;
        backend.lastHealthCheck = new Date();
      } catch (error) {
        console.error(`[JurisdictionAwareStorageRouter] Health check failed for ${backendId}:`, error);

        // Update health score
        const newHealthScore = Math.max(0, backend.healthScore - 20);
        const newStatus = newHealthScore < 50 ? 'DEGRADED' : 'ACTIVE';

        await firestore
          .collection('storageBackends')
          .doc(backendId)
          .update({
            status: newStatus,
            healthScore: newHealthScore,
            lastHealthCheck: new Date()
          });

        backend.status = newStatus;
        backend.healthScore = newHealthScore;
        backend.lastHealthCheck = new Date();
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}
