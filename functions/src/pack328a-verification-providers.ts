/**
 * PACK 328A: Verification Provider Implementations
 * Abstract providers for Bank-ID, DocAI, and Manual verification
 */

import {
  IVerificationProvider,
  VerificationInput,
  VerificationOutput,
  VerificationReason,
  DocumentType,
  VerificationProvider,
} from './pack328a-identity-verification-types';

// ============================================================================
// Base Provider (Abstract)
// ============================================================================

export abstract class BaseVerificationProvider implements IVerificationProvider {
  abstract name: VerificationProvider;

  abstract verifyIdentity(input: VerificationInput): Promise<VerificationOutput>;
  
  abstract canHandle(reason: VerificationReason, documents: DocumentType[]): boolean;
  
  abstract getStatus(): Promise<{
    available: boolean;
    responseTime?: number;
    error?: string;
  }>;

  /**
   * Extract date of birth and calculate age
   */
  protected calculateAge(dateOfBirth: string): number {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    
    return age;
  }

  /**
   * Validate minimum confidence scores
   */
  protected validateConfidence(confidence: {
    overall: number;
    ageVerification: number;
    identityMatch: number;
    documentAuthenticity: number;
  }): boolean {
    return (
      confidence.overall >= 0.8 &&
      confidence.ageVerification >= 0.9 &&
      confidence.identityMatch >= 0.85 &&
      confidence.documentAuthenticity >= 0.8
    );
  }
}

// ============================================================================
// BankID Provider (Nordic Region)
// ============================================================================

export class BankIDProvider extends BaseVerificationProvider {
  name: VerificationProvider = 'BANK_ID';

  async verifyIdentity(input: VerificationInput): Promise<VerificationOutput> {
    try {
      // BankID integration would go here
      // This is a placeholder implementation showing the expected flow
      
      console.log(`[BankID] Starting verification for user ${input.userId}`);
      
      // In production, this would:
      // 1. Initialize BankID session
      // 2. Generate QR code or mobile link
      // 3. Wait for user authentication
      // 4. Retrieve verified identity data
      
      // Simulate BankID response
      const bankIDResponse = await this.callBankIDAPI(input);
      
      if (!bankIDResponse.success) {
        return {
          success: false,
          verified: false,
          ageConfirmed: false,
          identityMatch: false,
          error: bankIDResponse.error,
          failureReasons: ['BANK_ID_AUTHENTICATION_FAILED'],
        };
      }

      // Extract verified data from BankID
      const age = this.calculateAge(bankIDResponse.dateOfBirth);
      const ageConfirmed = age >= 18;

      return {
        success: true,
        verified: bankIDResponse.verified,
        ageConfirmed,
        identityMatch: true, // BankID always confirms identity
        extractedData: {
          dateOfBirth: bankIDResponse.dateOfBirth,
          age,
          fullName: bankIDResponse.fullName,
          documentNumber: bankIDResponse.personalNumber,
          nationality: bankIDResponse.country,
        },
        confidence: {
          overall: 0.99, // BankID is highly reliable
          ageVerification: 0.99,
          identityMatch: 0.99,
          documentAuthenticity: 0.99,
        },
        providerTransactionId: bankIDResponse.transactionId,
      };
      
    } catch (error) {
      console.error('[BankID] Verification error:', error);
      return {
        success: false,
        verified: false,
        ageConfirmed: false,
        identityMatch: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        failureReasons: ['BANK_ID_SYSTEM_ERROR'],
      };
    }
  }

  canHandle(reason: VerificationReason, documents: DocumentType[]): boolean {
    // BankID doesn't need uploaded documents - it uses national digital identity
    return reason === 'UNDERAGE_RISK' || reason === 'FRAUD_FLAG';
  }

  async getStatus(): Promise<{ available: boolean; responseTime?: number; error?: string }> {
    try {
      const startTime = Date.now();
      // Ping BankID API
      await this.pingBankIDAPI();
      const responseTime = Date.now() - startTime;
      
      return {
        available: true,
        responseTime,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Private Methods (BankID API Integration)
  // ============================================================================

  private async callBankIDAPI(input: VerificationInput): Promise<any> {
    // TODO: Implement actual BankID API call
    // Example endpoints:
    // - POST /rp/v5.1/auth - Start authentication
    // - POST /rp/v5.1/collect - Collect result
    
    // For now, return mock success response
    return {
      success: true,
      verified: true,
      dateOfBirth: '1990-01-01',
      fullName: 'Test User',
      personalNumber: '199001011234',
      country: 'SE',
      transactionId: `bankid_${Date.now()}`,
    };
  }

  private async pingBankIDAPI(): Promise<void> {
    // TODO: Implement health check
    // For now, just resolve
    return Promise.resolve();
  }
}

// ============================================================================
// DocAI Provider (Onfido/Veriff/Sumsub)
// ============================================================================

export class DocAIProvider extends BaseVerificationProvider {
  name: VerificationProvider = 'DOC_AI';

  async verifyIdentity(input: VerificationInput): Promise<VerificationOutput> {
    try {
      console.log(`[DocAI] Starting verification for user ${input.userId}`);
      
      // In production, this would:
      // 1. Upload documents to Onfido/Veriff/Sumsub
      // 2. Run AI verification checks
      // 3. Perform liveness detection
      // 4. Extract and verify document data
      
      const docAIResponse = await this.callDocAIAPI(input);
      
      if (!docAIResponse.success) {
        return {
          success: false,
          verified: false,
          ageConfirmed: false,
          identityMatch: false,
          error: docAIResponse.error,
          failureReasons: docAIResponse.failureReasons || ['DOC_AI_VERIFICATION_FAILED'],
        };
      }

      const age = docAIResponse.dateOfBirth 
        ? this.calculateAge(docAIResponse.dateOfBirth)
        : 0;
      
      const ageConfirmed = age >= 18;

      const confidence = {
        overall: docAIResponse.overallScore || 0.85,
        ageVerification: docAIResponse.ageScore || 0.9,
        identityMatch: docAIResponse.faceMatchScore || 0.85,
        documentAuthenticity: docAIResponse.documentScore || 0.85,
      };

      const verified = this.validateConfidence(confidence);

      return {
        success: true,
        verified,
        ageConfirmed: verified && ageConfirmed,
        identityMatch: confidence.identityMatch >= 0.85,
        extractedData: {
          dateOfBirth: docAIResponse.dateOfBirth,
          age,
          fullName: docAIResponse.fullName,
          documentNumber: docAIResponse.documentNumber,
          expiryDate: docAIResponse.expiryDate,
          nationality: docAIResponse.nationality,
        },
        confidence,
        providerTransactionId: docAIResponse.checkId,
        providerResponse: docAIResponse,
      };
      
    } catch (error) {
      console.error('[DocAI] Verification error:', error);
      return {
        success: false,
        verified: false,
        ageConfirmed: false,
        identityMatch: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        failureReasons: ['DOC_AI_SYSTEM_ERROR'],
      };
    }
  }

  canHandle(reason: VerificationReason, documents: DocumentType[]): boolean {
    // DocAI requires at least one document and one selfie
    const hasDocument = documents.some(d => 
      ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(d)
    );
    const hasSelfie = documents.includes('LIVE_SELFIE');
    
    return hasDocument && hasSelfie;
  }

  async getStatus(): Promise<{ available: boolean; responseTime?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.pingDocAIAPI();
      const responseTime = Date.now() - startTime;
      
      return {
        available: true,
        responseTime,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Private Methods (DocAI API Integration)
  // ============================================================================

  private async callDocAIAPI(input: VerificationInput): Promise<any> {
    // TODO: Implement actual Onfido/Veriff/Sumsub API call
    // Example flow:
    // 1. Create applicant
    // 2. Upload documents
    // 3. Create check
    // 4. Poll for results
    
    // For now, return mock response
    return {
      success: true,
      checkId: `check_${Date.now()}`,
      dateOfBirth: '1990-01-01',
      fullName: 'Test User',
      documentNumber: 'AB123456',
      expiryDate: '2030-12-31',
      nationality: 'US',
      overallScore: 0.92,
      ageScore: 0.95,
      faceMatchScore: 0.88,
      documentScore: 0.90,
    };
  }

  private async pingDocAIAPI(): Promise<void> {
    // TODO: Implement health check
    return Promise.resolve();
  }
}

// ============================================================================
// Manual Review Provider
// ============================================================================

export class ManualReviewProvider extends BaseVerificationProvider {
  name: VerificationProvider = 'MANUAL';

  async verifyIdentity(input: VerificationInput): Promise<VerificationOutput> {
    // Manual review creates a pending case for human moderators
    console.log(`[Manual] Creating review case for user ${input.userId}`);
    
    // This provider doesn't complete verification immediately
    // It creates a task for moderators and returns pending status
    return {
      success: true,
      verified: false,
      ageConfirmed: false,
      identityMatch: false,
      error: 'MANUAL_REVIEW_PENDING',
      failureReasons: ['REQUIRES_HUMAN_REVIEW'],
    };
  }

  canHandle(reason: VerificationReason, documents: DocumentType[]): boolean {
    // Manual review can handle any case as fallback
    return true;
  }

  async getStatus(): Promise<{ available: boolean; responseTime?: number; error?: string }> {
    // Manual review is always "available" but requires human intervention
    return {
      available: true,
      responseTime: 0,
    };
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

export class VerificationProviderFactory {
  private static providers: Map<VerificationProvider, IVerificationProvider> = new Map([
    ['BANK_ID', new BankIDProvider()],
    ['DOC_AI', new DocAIProvider()],
    ['MANUAL', new ManualReviewProvider()],
  ]);

  static getProvider(providerName: VerificationProvider): IVerificationProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown verification provider: ${providerName}`);
    }
    return provider;
  }

  static async selectBestProvider(
    reason: VerificationReason,
    documents: DocumentType[]
  ): Promise<IVerificationProvider> {
    // Priority order: BANK_ID > DOC_AI > MANUAL
    const providerOrder: VerificationProvider[] = ['BANK_ID', 'DOC_AI', 'MANUAL'];
    
    for (const providerName of providerOrder) {
      const provider = this.getProvider(providerName);
      
      // Check if provider can handle this case
      if (provider.canHandle(reason, documents)) {
        // Check if provider is available
        const status = await provider.getStatus();
        if (status.available) {
          console.log(`[ProviderFactory] Selected provider: ${providerName}`);
          return provider;
        }
      }
    }
    
    // Fallback to manual review
    console.log('[ProviderFactory] All providers unavailable, falling back to MANUAL');
    return this.getProvider('MANUAL');
  }
}