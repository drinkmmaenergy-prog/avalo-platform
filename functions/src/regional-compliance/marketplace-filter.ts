/**
 * PACK 199: Regional Marketplace Filtering
 * Automatic filtering and compliance for marketplace items by region
 */

import { db } from '../init';
import {
  RegionCode,
  RegionalMarketplaceItem,
  MarketplaceRestriction,
} from './types';
import { REGIONAL_RULES } from './regional-rules';
import { Timestamp } from 'firebase-admin/firestore';

export class MarketplaceFilter {
  async filterMarketplaceByRegion(
    regionCode: RegionCode,
    items: any[]
  ): Promise<any[]> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules || !rules.marketplaceRestrictions.length) {
      return items;
    }

    const filteredItems = [];

    for (const item of items) {
      const isAllowed = await this.checkItemAllowedInRegion(
        item,
        regionCode,
        rules.marketplaceRestrictions
      );

      if (isAllowed) {
        filteredItems.push(item);
      } else {
        await this.logBlockedItem(item.id, regionCode, 'auto-filtered');
      }
    }

    return filteredItems;
  }

  private async checkItemAllowedInRegion(
    item: any,
    regionCode: RegionCode,
    restrictions: MarketplaceRestriction[]
  ): Promise<boolean> {
    const regionalItemRef = db
      .collection('regional_marketplace_items')
      .doc(item.id);

    const regionalItem = await regionalItemRef.get();

    if (regionalItem.exists) {
      const data = regionalItem.data() as RegionalMarketplaceItem;
      
      if (data.blockedRegions?.includes(regionCode)) {
        return false;
      }

      if (data.allowedRegions?.length > 0 && !data.allowedRegions.includes(regionCode)) {
        return false;
      }
    }

    for (const restriction of restrictions) {
      if (this.matchesRestriction(item, restriction)) {
        if (restriction.autoRemove) {
          await this.autoRemoveItem(item.id, regionCode, restriction);
          return false;
        }

        if (restriction.prohibited) {
          return false;
        }

        if (restriction.requiresLicense && !item.hasLicense) {
          return false;
        }

        if (restriction.ageRestricted && !item.ageVerified) {
          return false;
        }
      }
    }

    return true;
  }

  private matchesRestriction(
    item: any,
    restriction: MarketplaceRestriction
  ): boolean {
    if (restriction.category === 'all' || item.category === restriction.category) {
      if (
        restriction.subcategory === 'all' ||
        !restriction.subcategory ||
        item.subcategory === restriction.subcategory
      ) {
        return true;
      }
    }

    return false;
  }

  private async autoRemoveItem(
    itemId: string,
    regionCode: RegionCode,
    restriction: MarketplaceRestriction
  ): Promise<void> {
    const regionalItemRef = db
      .collection('regional_marketplace_items')
      .doc(itemId);

    const regionalItem = await regionalItemRef.get();

    if (regionalItem.exists) {
      const data = regionalItem.data() as RegionalMarketplaceItem;
      const blockedRegions = data.blockedRegions || [];
      
      if (!blockedRegions.includes(regionCode)) {
        blockedRegions.push(regionCode);
        
        await regionalItemRef.update({
          blockedRegions,
          [`regionalRestrictions.${regionCode}`]: restriction.reason,
          complianceCheckedAt: Timestamp.now(),
        });
      }
    } else {
      await regionalItemRef.set({
        itemId,
        creatorId: '',
        category: '',
        subcategory: '',
        allowedRegions: [],
        blockedRegions: [regionCode],
        regionalRestrictions: {
          [regionCode]: restriction.reason,
        },
        complianceCheckedAt: Timestamp.now(),
      } as RegionalMarketplaceItem);
    }

    await db.collection('regional_marketplace_removals').add({
      itemId,
      regionCode,
      reason: restriction.reason,
      category: restriction.category,
      subcategory: restriction.subcategory,
      removedAt: Timestamp.now(),
    });
  }

  private async logBlockedItem(
    itemId: string,
    regionCode: RegionCode,
    reason: string
  ): Promise<void> {
    await db.collection('regional_marketplace_blocks').add({
      itemId,
      regionCode,
      reason,
      blockedAt: Timestamp.now(),
    });
  }

  async validateMarketplaceItem(
    itemId: string,
    item: {
      category: string;
      subcategory: string;
      creatorId: string;
      hasLicense?: boolean;
      ageVerified?: boolean;
    },
    regionCode: RegionCode
  ): Promise<{
    allowed: boolean;
    reason?: string;
    warnings: string[];
    requiredActions: string[];
  }> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules) {
      return {
        allowed: true,
        warnings: [],
        requiredActions: [],
      };
    }

    const result = {
      allowed: true,
      warnings: [] as string[],
      requiredActions: [] as string[],
    };

    for (const restriction of rules.marketplaceRestrictions) {
      if (this.matchesRestriction(item, restriction)) {
        if (restriction.prohibited) {
          return {
            allowed: false,
            reason: restriction.reason,
            warnings: [],
            requiredActions: [],
          };
        }

        if (restriction.requiresLicense && !item.hasLicense) {
          result.allowed = false;
          result.requiredActions.push(
            `License required: ${restriction.reason}`
          );
        }

        if (restriction.ageRestricted && !item.ageVerified) {
          result.warnings.push('Age verification required for buyers');
        }

        if (restriction.warningRequired) {
          result.warnings.push(
            `Warning label required: ${restriction.reason}`
          );
        }
      }
    }

    await this.updateRegionalItemCompliance(itemId, item, regionCode, result);

    return result;
  }

  private async updateRegionalItemCompliance(
    itemId: string,
    item: any,
    regionCode: RegionCode,
    validationResult: any
  ): Promise<void> {
    const regionalItemRef = db
      .collection('regional_marketplace_items')
      .doc(itemId);

    const data: RegionalMarketplaceItem = {
      itemId,
      creatorId: item.creatorId,
      category: item.category,
      subcategory: item.subcategory,
      allowedRegions: validationResult.allowed ? [regionCode] : [],
      blockedRegions: validationResult.allowed ? [] : [regionCode],
      regionalRestrictions: validationResult.allowed
        ? {}
        : { [regionCode]: validationResult.reason },
      complianceCheckedAt: Timestamp.now(),
    };

    await regionalItemRef.set(data, { merge: true });
  }

  async scanMarketplaceCompliance(
    regionCode: RegionCode
  ): Promise<{
    totalItems: number;
    blockedItems: number;
    warningItems: number;
    compliantItems: number;
  }> {
    const itemsSnapshot = await db
      .collection('marketplace_items')
      .get();

    let blockedItems = 0;
    let warningItems = 0;
    let compliantItems = 0;

    for (const doc of itemsSnapshot.docs) {
      const item = doc.data();
      const validation = await this.validateMarketplaceItem(
        doc.id,
        {
          category: item.category || '',
          subcategory: item.subcategory || '',
          creatorId: item.creatorId || '',
          hasLicense: item.hasLicense,
          ageVerified: item.ageVerified,
        },
        regionCode
      );

      if (!validation.allowed) {
        blockedItems++;
      } else if (validation.warnings.length > 0) {
        warningItems++;
      } else {
        compliantItems++;
      }
    }

    return {
      totalItems: itemsSnapshot.size,
      blockedItems,
      warningItems,
      compliantItems,
    };
  }

  async getRegionalMarketplaceRestrictions(
    regionCode: RegionCode
  ): Promise<MarketplaceRestriction[]> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules) {
      return [];
    }

    return rules.marketplaceRestrictions;
  }

  async getCreatorMarketplaceGuidelines(
    creatorId: string,
    regionCode: RegionCode
  ): Promise<{
    allowedCategories: string[];
    prohibitedCategories: string[];
    requiresLicense: string[];
    warnings: string[];
  }> {
    const rules = REGIONAL_RULES[regionCode];
    
    if (!rules) {
      return {
        allowedCategories: [],
        prohibitedCategories: [],
        requiresLicense: [],
        warnings: [],
      };
    }

    const prohibitedCategories: string[] = [];
    const requiresLicense: string[] = [];
    const warnings: string[] = [];

    for (const restriction of rules.marketplaceRestrictions) {
      const categoryDesc = `${restriction.category}/${restriction.subcategory}`;

      if (restriction.prohibited) {
        prohibitedCategories.push(categoryDesc);
      }

      if (restriction.requiresLicense) {
        requiresLicense.push(`${categoryDesc}: ${restriction.reason}`);
      }

      if (restriction.warningRequired) {
        warnings.push(`${categoryDesc}: ${restriction.reason}`);
      }
    }

    const allCategories = await this.getAllMarketplaceCategories();
    const allowedCategories = allCategories.filter(
      cat => !prohibitedCategories.includes(cat)
    );

    return {
      allowedCategories,
      prohibitedCategories,
      requiresLicense,
      warnings,
    };
  }

  private async getAllMarketplaceCategories(): Promise<string[]> {
    return [
      'clothing/casual',
      'clothing/fitness',
      'clothing/formal',
      'electronics/gadgets',
      'electronics/accessories',
      'beauty/skincare',
      'beauty/makeup',
      'health/supplements',
      'health/fitness',
      'digital/courses',
      'digital/ebooks',
      'services/consulting',
      'services/coaching',
    ];
  }

  async refreshMarketplaceCompliance(regionCode: RegionCode): Promise<void> {
    const itemsSnapshot = await db
      .collection('regional_marketplace_items')
      .where('allowedRegions', 'array-contains', regionCode)
      .get();

    for (const doc of itemsSnapshot.docs) {
      const item = doc.data() as RegionalMarketplaceItem;
      
      const validation = await this.validateMarketplaceItem(
        item.itemId,
        item,
        regionCode
      );

      if (!validation.allowed) {
        await this.autoRemoveItem(
          item.itemId,
          regionCode,
          { reason: validation.reason || 'Non-compliant' } as MarketplaceRestriction
        );
      }
    }

    await db.collection('regional_compliance_scans').add({
      regionCode,
      type: 'marketplace-refresh',
      itemsScanned: itemsSnapshot.size,
      timestamp: Timestamp.now(),
    });
  }
}

export async function filterMarketplaceByRegion(
  regionCode: RegionCode,
  items: any[]
): Promise<any[]> {
  const filter = new MarketplaceFilter();
  return filter.filterMarketplaceByRegion(regionCode, items);
}

export async function validateMarketplaceItem(
  itemId: string,
  item: {
    category: string;
    subcategory: string;
    creatorId: string;
    hasLicense?: boolean;
    ageVerified?: boolean;
  },
  regionCode: RegionCode
): Promise<{
  allowed: boolean;
  reason?: string;
  warnings: string[];
  requiredActions: string[];
}> {
  const filter = new MarketplaceFilter();
  return filter.validateMarketplaceItem(itemId, item, regionCode);
}

export async function getCreatorMarketplaceGuidelines(
  creatorId: string,
  regionCode: RegionCode
): Promise<{
  allowedCategories: string[];
  prohibitedCategories: string[];
  requiresLicense: string[];
  warnings: string[];
}> {
  const filter = new MarketplaceFilter();
  return filter.getCreatorMarketplaceGuidelines(creatorId, regionCode);
}