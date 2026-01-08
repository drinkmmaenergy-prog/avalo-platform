import { admin, db, serverTimestamp } from '../init';
import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

interface BrandProfile {
  name: string;
  category: string;
  description: string;
  owner_id: string;
  logo_url?: string;
  website_url?: string;
  contact_email?: string;
  status: 'pending' | 'active' | 'suspended' | 'banned';
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata?: {
    total_products?: number;
    total_collaborations?: number;
    total_sales?: number;
  };
}

const NSFW_KEYWORDS = [
  'lingerie', 'erotic', 'sexy', 'sensual', 'seductive',
  'intimate', 'adult', 'nsfw', 'xxx', 'porn', 'escort'
];

const ROMANCE_KEYWORDS = [
  'romance', 'dating', 'girlfriend', 'boyfriend',
  'love package', 'attention', 'relationship reward'
];

function hasNSFWContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return NSFW_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

function hasRomanceContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ROMANCE_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export const createBrandProfile = functions.https.onCall(
  async (data: {
    name: string;
    category: string;
    description: string;
    logo_url?: string;
    website_url?: string;
    contact_email?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { name, category, description, logo_url, website_url, contact_email } = data;

    if (!name || !category || !description) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Name, category, and description are required'
      );
    }

    if (name.length > 100) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand name must be 100 characters or less'
      );
    }

    if (description.length > 2000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Description must be 2000 characters or less'
      );
    }

    const contentToCheck = `${name} ${description}`;
    if (hasNSFWContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Brand profile contains prohibited NSFW content'
      );
    }

    if (hasRomanceContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Brand profile contains prohibited romance-coded content'
      );
    }

    const validCategories = [
      'physical_merch', 'fitness_wellness', 'beauty',
      'education', 'art_creativity', 'tech',
      'home_decor', 'tools', 'hobby_kits'
    ];

    if (!validCategories.includes(category)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid category'
      );
    }

    const now = Timestamp.now();
    const brandProfile: BrandProfile = {
      name,
      category,
      description,
      owner_id: context.auth.uid,
      status: 'pending',
      created_at: now,
      updated_at: now,
      metadata: {
        total_products: 0,
        total_collaborations: 0,
        total_sales: 0
      }
    };

    if (logo_url) brandProfile.logo_url = logo_url;
    if (website_url) brandProfile.website_url = website_url;
    if (contact_email) brandProfile.contact_email = contact_email;

    const brandRef = await db.collection('brand_profiles').add(brandProfile);

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'brand_profile_created',
      brand_id: brandRef.id,
      timestamp: now,
      metadata: {
        brand_name: name,
        category
      }
    });

    return {
      success: true,
      brand_id: brandRef.id,
      message: 'Brand profile created successfully. Awaiting review.'
    };
  }
);

export const updateBrandProfile = functions.https.onCall(
  async (data: {
    brand_id: string;
    name?: string;
    description?: string;
    logo_url?: string;
    website_url?: string;
    contact_email?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { brand_id, ...updates } = data;

    if (!brand_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand ID is required'
      );
    }

    const brandRef = db.collection('brand_profiles').doc(brand_id);
    const brandDoc = await brandRef.get();

    if (!brandDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Brand profile not found'
      );
    }

    const brandData = brandDoc.data() as BrandProfile;

    const isAdmin = await db.collection('admin_users').doc(context.auth.uid).get()
      .then(doc => doc.exists);

    if (brandData.owner_id !== context.auth.uid && !isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not authorized to update this brand profile'
      );
    }

    if (updates.name && updates.name.length > 100) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand name must be 100 characters or less'
      );
    }

    if (updates.description && updates.description.length > 2000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Description must be 2000 characters or less'
      );
    }

    const contentToCheck = `${updates.name || ''} ${updates.description || ''}`;
    if (hasNSFWContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Brand profile contains prohibited NSFW content'
      );
    }

    if (hasRomanceContent(contentToCheck)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Brand profile contains prohibited romance-coded content'
      );
    }

    const updateData: any = {
      ...updates,
      updated_at: Timestamp.now()
    };

    await brandRef.update(updateData);

    await db.collection('activity_logs').add({
      user_id: context.auth.uid,
      action: 'brand_profile_updated',
      brand_id,
      timestamp: Timestamp.now(),
      metadata: { updates: Object.keys(updates) }
    });

    return {
      success: true,
      message: 'Brand profile updated successfully'
    };
  }
);

export const getBrandProfile = functions.https.onCall(
  async (data: { brand_id: string }, context) => {
    const { brand_id } = data;

    if (!brand_id) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brand ID is required'
      );
    }

    const brandDoc = await db.collection('brand_profiles').doc(brand_id).get();

    if (!brandDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Brand profile not found'
      );
    }

    const brandData = brandDoc.data() as BrandProfile;

    return {
      success: true,
      brand: {
        id: brandDoc.id,
        ...brandData,
        created_at: brandData.created_at.toMillis(),
        updated_at: brandData.updated_at.toMillis()
      }
    };
  }
);

export const searchBrands = functions.https.onCall(
  async (data: {
    category?: string;
    search_term?: string;
    limit?: number;
    offset?: number;
  }, context) => {
    const { category, search_term, limit = 20, offset = 0 } = data;

    let query = db.collection('brand_profiles')
      .where('status', '==', 'active');

    if (category) {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const snapshot = await query.get();
    const brands = snapshot.docs.map(doc => {
      const data = doc.data() as BrandProfile;
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at.toMillis(),
        updated_at: data.updated_at.toMillis()
      };
    });

    let filteredBrands = brands;
    if (search_term) {
      const lowerSearch = search_term.toLowerCase();
      filteredBrands = brands.filter(brand =>
        brand.name.toLowerCase().includes(lowerSearch) ||
        brand.description.toLowerCase().includes(lowerSearch)
      );
    }

    return {
      success: true,
      brands: filteredBrands,
      total: filteredBrands.length,
      has_more: snapshot.size === limit
    };
  }
);