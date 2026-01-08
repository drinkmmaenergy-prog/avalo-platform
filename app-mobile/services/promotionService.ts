/**
 * PACK 61: Promotion Service
 * Mobile service for fetching and logging promotions
 */

// API URL - should match your Firebase Functions deployment
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://us-central1-your-project.cloudfunctions.net';

export type PromotionPlacement = 'DISCOVERY' | 'MARKETPLACE' | 'HOME_CARD';

export interface PromotionItem {
  campaignId: string;
  placement: PromotionPlacement;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
}

export interface FetchPromotionsResponse {
  items: PromotionItem[];
}

/**
 * Fetch promotions for a specific placement
 */
export async function fetchPromotionsForPlacement(
  userId: string,
  placement: PromotionPlacement
): Promise<PromotionItem[]> {
  try {
    const response = await fetch(
      `${API_URL}/promotions/for-placement?userId=${encodeURIComponent(userId)}&placement=${encodeURIComponent(placement)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch promotions: ${response.statusText}`);
    }

    const data = await response.json() as FetchPromotionsResponse;
    return data.items;
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return [];
  }
}

/**
 * Log a promotion impression
 */
export async function logPromotionImpression(
  userId: string,
  campaignId: string,
  placement: PromotionPlacement
): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/promotions/log-impression`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        campaignId,
        placement
      })
    });

    if (!response.ok) {
      console.warn('Failed to log impression:', response.statusText);
    }
  } catch (error) {
    console.error('Error logging impression:', error);
  }
}

/**
 * Log a promotion click
 */
export async function logPromotionClick(
  userId: string,
  campaignId: string,
  placement: PromotionPlacement
): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/promotions/log-click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        campaignId,
        placement
      })
    });

    if (!response.ok) {
      console.warn('Failed to log click:', response.statusText);
    }
  } catch (error) {
    console.error('Error logging click:', error);
  }
}

// ============================================================================
// CREATOR CAMPAIGN MANAGEMENT
// ============================================================================

export interface PromotionTargeting {
  minAge?: number;
  maxAge?: number;
  countries?: string[];
  genders?: string[];
}

export interface PromotionCampaign {
  campaignId: string;
  ownerUserId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  placementTypes: PromotionPlacement[];
  title: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
  targeting: PromotionTargeting;
  nsfw: boolean;
  startAt: string;
  endAt: string;
  budgetTokensTotal: number;
  budgetTokensSpent: number;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignParams {
  ownerUserId: string;
  name: string;
  placementTypes: PromotionPlacement[];
  title: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
  targeting?: PromotionTargeting;
  nsfw?: boolean;
  startAt: string;
  endAt: string;
  initialBudgetTokens: number;
}

export interface UpdateCampaignParams {
  ownerUserId: string;
  campaignId: string;
  status?: 'ACTIVE' | 'PAUSED';
  name?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  deepLink?: string;
}

/**
 * Get all campaigns for a creator
 */
export async function getMyCampaigns(userId: string): Promise<PromotionCampaign[]> {
  try {
    const response = await fetch(
      `${API_URL}/promotions/my-campaigns?userId=${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch campaigns: ${response.statusText}`);
    }

    const data = await response.json();
    return data.campaigns || [];
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return [];
  }
}

/**
 * Create a new promotion campaign
 */
export async function createCampaign(params: CreateCampaignParams): Promise<{ success: boolean; campaignId?: string; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/promotions/create-campaign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || response.statusText };
    }

    return { success: true, campaignId: data.campaignId };
  } catch (error: any) {
    console.error('Error creating campaign:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing campaign
 */
export async function updateCampaign(params: UpdateCampaignParams): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/promotions/update-campaign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || response.statusText };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating campaign:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add budget to an existing campaign
 */
export async function addCampaignBudget(
  ownerUserId: string,
  campaignId: string,
  additionalTokens: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/promotions/add-budget`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ownerUserId,
        campaignId,
        additionalTokens
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || response.statusText };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error adding budget:', error);
    return { success: false, error: error.message };
  }
}