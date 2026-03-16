import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 119 — Creator Agencies SaaS Panel
 * Portfolio Builder Engine
 * 
 * ZERO VISIBILITY BOOST:
 * - Portfolios are external branding only (not shown in Avalo app discovery)
 * - No algorithmic promotion or ranking benefits
 * - Public landing pages for social media bio links
 */

import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CreatorPortfolio, AgencySaaSError, AgencySaaSErrorCode } from './pack119-types';
import { admin, auth, functions } from './runtime';

// ============================================================================
// PORTFOLIO OPERATIONS
// ============================================================================

/**
 * Create or update earner portfolio
 */
export const createOrUpdatePortfolio = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ portfolioId: string; handle: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const {
      earnerUserId,
      handle,
      displayName,
      bio,
      profileimageUrl,
      coverimageUrl,
      socialLinks,
      featuredAssets,
      customSections,
      contactEmail,
      isPublic,
      themeColor,
    } = request.data;

    if (!earnerUserId || !handle || !displayName) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      // Only earner or linked agency can create/update portfolio
      if (request.auth.uid !== earnerUserId) {
        // Check if caller is from linked agency
        const linkQuery = await db
          .collection('earner_agency_links')
          .where('earnerUserId', '==', earnerUserId)
          .where('status', '==', 'ACTIVE')
          .limit(1)
          .get();

        if (linkQuery.empty) {
          throw new HttpsError('permission-denied', 'Not authorized to manage this portfolio');
        }

        const link = linkQuery.docs[0].data();
        
        // Verify caller is from this agency
        const memberDoc = await db
          .collection('agency_team_members')
          .doc(`${link.agencyId}_${request.auth.uid}`)
          .get();

        if (!memberDoc.exists || memberDoc.data()?.status !== 'ACTIVE') {
          throw new HttpsError('permission-denied', 'Not authorized to manage this portfolio');
        }
      }

      // Validate handle (lowercase, alphanumeric + hyphens only)
      const handleRegex = /^[a-z0-9-]+$/;
      if (!handleRegex.test(handle)) {
        throw new HttpsError(
          'invalid-argument',
          'Handle must be lowercase alphanumeric with hyphens only'
        );
      }

      // Check if handle is already taken (by another earner)
      const existingPortfolioQuery = await db
        .collection('earner_portfolios')
        .where('handle', '==', handle)
        .where('earnerUserId', '!=', earnerUserId)
        .limit(1)
        .get();

      if (!existingPortfolioQuery.empty) {
        throw new AgencySaaSError(
          AgencySaaSErrorCode.PORTFOLIO_HANDLE_TAKEN,
          'Handle is already taken'
        );
      }

      // Get or create portfolio
      const portfolioQuery = await db
        .collection('earner_portfolios')
        .where('earnerUserId', '==', earnerUserId)
        .limit(1)
        .get();

      let portfolioId: string;
      let portfolioRef;

      if (portfolioQuery.empty) {
        // Create new portfolio
        portfolioId = generateId();
        portfolioRef = db.collection('earner_portfolios').doc(portfolioId);

        const portfolio: CreatorPortfolio = {
          portfolioId,
          earnerUserId,
          handle,
          displayName,
          bio,
          profileimageUrl,
          coverimageUrl,
          socialLinks: socialLinks || {},
          featuredAssets: featuredAssets || [],
          customSections: customSections || [],
          contactEmail,
          isPublic: isPublic !== undefined ? isPublic : true,
          themeColor,
          views: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await portfolioRef.set(portfolio);
      } else {
        // Update existing portfolio
        const portfolioDoc = portfolioQuery.docs[0];
        portfolioId = portfolioDoc.id;
        portfolioRef = portfolioDoc.ref;

        await portfolioRef.update({
          handle,
          displayName,
          bio,
          profileimageUrl,
          coverimageUrl,
          socialLinks: socialLinks || {},
          featuredAssets: featuredAssets || [],
          customSections: customSections || [],
          contactEmail,
          isPublic: isPublic !== undefined ? isPublic : true,
          themeColor,
          updatedAt: serverTimestamp(),
        });
      }

      logger.info('Portfolio created/updated', { portfolioId, earnerUserId, handle });

      return { portfolioId, handle };
    } catch (error: any) {
      logger.error('Error creating/updating portfolio', error);
      
      if (error instanceof AgencySaaSError) {
        throw new HttpsError('already-exists', error.message);
      }
      
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get portfolio by handle (public endpoint)
 */
export const getPortfolioByHandle = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ portfolio: CreatorPortfolio | null }> => {
    const { handle } = request.data;

    if (!handle) {
      throw new HttpsError('invalid-argument', 'Handle required');
    }

    try {
      const portfolioQuery = await db
        .collection('earner_portfolios')
        .where('handle', '==', handle)
        .limit(1)
        .get();

      if (portfolioQuery.empty) {
        return { portfolio: null };
      }

      const portfolioDoc = portfolioQuery.docs[0];
      const portfolio = portfolioDoc.data() as CreatorPortfolio;

      // Only return if public OR if viewer is the earner/agency
      if (!portfolio.isPublic) {
        if (!request.auth || request.auth.uid !== portfolio.earnerUserId) {
          // Check if viewer is from linked agency
          if (request.auth) {
            const linkQuery = await db
              .collection('earner_agency_links')
              .where('earnerUserId', '==', portfolio.earnerUserId)
              .where('status', '==', 'ACTIVE')
              .limit(1)
              .get();

            if (!linkQuery.empty) {
              const link = linkQuery.docs[0].data();
              const memberDoc = await db
                .collection('agency_team_members')
                .doc(`${link.agencyId}_${request.auth.uid}`)
                .get();

              if (!memberDoc.exists || memberDoc.data()?.status !== 'ACTIVE') {
                return { portfolio: null };
              }
            } else {
              return { portfolio: null };
            }
          } else {
            return { portfolio: null };
          }
        }
      }

      // Increment view count (only for external viewers, not earner/agency)
      if (!request.auth || request.auth.uid !== portfolio.earnerUserId) {
        await portfolioDoc.ref.update({
          views: increment(1),
          lastViewedAt: serverTimestamp(),
        });
      }

      return { portfolio };
    } catch (error: any) {
      logger.error('Error getting portfolio', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Delete portfolio
 */
export const deletePortfolio = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { portfolioId } = request.data;

    if (!portfolioId) {
      throw new HttpsError('invalid-argument', 'Portfolio ID required');
    }

    try {
      const portfolioRef = db.collection('earner_portfolios').doc(portfolioId);
      const portfolioDoc = await portfolioRef.get();

      if (!portfolioDoc.exists) {
        throw new HttpsError('not-found', 'Portfolio not found');
      }

      const portfolio = portfolioDoc.data() as CreatorPortfolio;

      // Only earner can delete portfolio
      if (request.auth.uid !== portfolio.earnerUserId) {
        throw new HttpsError('permission-denied', 'Only earner can delete portfolio');
      }

      await portfolioRef.delete();

      logger.info('Portfolio deleted', { portfolioId, earnerUserId: portfolio.earnerUserId });

      return { success: true };
    } catch (error: any) {
      logger.error('Error deleting portfolio', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get portfolio analytics
 */
export const getPortfolioAnalytics = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{
    views: number;
    lastViewedAt?: string;
    trending: boolean;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { portfolioId } = request.data;

    if (!portfolioId) {
      throw new HttpsError('invalid-argument', 'Portfolio ID required');
    }

    try {
      const portfolioDoc = await db.collection('earner_portfolios').doc(portfolioId).get();

      if (!portfolioDoc.exists) {
        throw new HttpsError('not-found', 'Portfolio not found');
      }

      const portfolio = portfolioDoc.data() as CreatorPortfolio;

      // Only earner or linked agency can view analytics
      if (request.auth.uid !== portfolio.earnerUserId) {
        if (portfolio.agencyId) {
          const memberDoc = await db
            .collection('agency_team_members')
            .doc(`${portfolio.agencyId}_${request.auth.uid}`)
            .get();

          if (!memberDoc.exists || memberDoc.data()?.status !== 'ACTIVE') {
            throw new HttpsError('permission-denied', 'Not authorized to view analytics');
          }
        } else {
          throw new HttpsError('permission-denied', 'Not authorized to view analytics');
        }
      }

      // Calculate if trending (more than 100 views in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const isTrending =
        portfolio.lastViewedAt &&
        portfolio.lastViewedAt.toDate() > sevenDaysAgo &&
        portfolio.views > 100;

      return {
        views: portfolio.views,
        lastViewedAt: portfolio.lastViewedAt?.toDate().toISOString(),
        trending: isTrending || false,
      };
    } catch (error: any) {
      logger.error('Error getting portfolio analytics', error);
      throw new HttpsError('internal', error.message);
    }
  }
);























