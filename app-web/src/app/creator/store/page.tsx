'use client';

/**
 * Creator Store Management — /creator/store
 *
 * FIX 125: Product management for creator digital store.
 * Creators can add, edit, and delete digital products.
 * Products: photos, videos, presets, guides, audio, documents.
 *
 * Features:
 *   - Add new products with title, description, type, price, preview, content file
 *   - List existing products with status toggle
 *   - Edit/delete products
 *   - Per-product sales stats
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses requireStorage() for file uploads.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Revenue split: up to reference rate creator / 35% Avalo (UNLOCK_MEDIA).
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';

/** Supported product types */
const PRODUCT_TYPES = [
  { value: 'photo', label: '📸 Photo', accept: 'image/*' },
  { value: 'video', label: '🎬 Video', accept: 'video/*' },
  { value: 'audio', label: '🎵 Audio', accept: 'audio/*' },
  { value: 'preset', label: '🎨 Preset', accept: '*' },
  { value: 'guide', label: '📖 Guide', accept: '.pdf,.doc,.docx' },
  { value: 'document', label: '📄 Document', accept: '.pdf,.doc,.docx,.txt' },
];

interface StoreProduct {
  id: string;
  title: string;
  description: string;
  type: string;
  price: number;
  previewURL: string;
  contentURL: string;
  status: 'active' | 'inactive';
  sales: number;
  revenue: number;
  createdAt: any;
}

export default function CreatorStoreManagementPage() {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const currentUserId = firebaseUser?.uid;

  // Product list state
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('photo');
  const [formPrice, setFormPrice] = useState(10);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Stats
  const [totalSales, setTotalSales] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const previewInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);

  // Load products
  useEffect(() => {
    if (!currentUserId) return;
    const db = requireDb();
    let active = true;

    const loadProducts = async () => {
      try {
        const productsQuery = query(
          collection(db, 'shops', currentUserId, 'items'),
          orderBy('createdAt', 'desc'),
        );
        const snap = await getDocs(productsQuery);
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          sales: d.data().sales || 0,
          revenue: d.data().revenue || 0,
        })) as StoreProduct[];

        if (active) {
          setProducts(items);
          setTotalSales(items.reduce((sum, p) => sum + (p.sales || 0), 0));
          setTotalRevenue(items.reduce((sum, p) => sum + (p.revenue || 0), 0));
        }

        // Also load aggregated sales per product from media_purchases
        try {
          const purchasesQuery = query(
            collection(db, 'media_purchases'),
            where('creatorId', '==', currentUserId),
          );
          const purchasesSnap = await getDocs(purchasesQuery);
          const salesMap: Record<string, { count: number; revenue: number }> = {};
          purchasesSnap.docs.forEach((d) => {
            const data = d.data();
            const itemId = data.itemId;
            if (!salesMap[itemId]) salesMap[itemId] = { count: 0, revenue: 0 };
            salesMap[itemId].count += 1;
            salesMap[itemId].revenue += (data.creatorAmount || 0);
          });

          if (active) {
            setProducts((prev) =>
              prev.map((p) => ({
                ...p,
                sales: salesMap[p.id]?.count || p.sales || 0,
                revenue: salesMap[p.id]?.revenue || p.revenue || 0,
              })),
            );
            const sumSales = Object.values(salesMap).reduce((s, v) => s + v.count, 0);
            const sumRevenue = Object.values(salesMap).reduce((s, v) => s + v.revenue, 0);
            setTotalSales(sumSales);
            setTotalRevenue(sumRevenue);
          }
        } catch {
          // Non-critical — use product-level stats
        }
      } catch (err) {
        console.error('[CreatorStore] Load products error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProducts();
    return () => { active = false; };
  }, [currentUserId]);

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormType('photo');
    setFormPrice(10);
    setPreviewFile(null);
    setContentFile(null);
    setEditingProduct(null);
    setShowForm(false);
  };

  const openEditForm = (product: StoreProduct) => {
    setEditingProduct(product);
    setFormTitle(product.title);
    setFormDescription(product.description);
    setFormType(product.type);
    setFormPrice(product.price);
    setPreviewFile(null);
    setContentFile(null);
    setShowForm(true);
  };

  const handleSaveProduct = async () => {
    if (!currentUserId) return;
    if (!formTitle.trim()) { alert('Title is required'); return; }
    if (formPrice < 1) { alert('Price must be at least 1 token'); return; }
    if (!editingProduct && !contentFile) { alert('Content file is required for new products'); return; }

    setSaving(true);
    try {
      const db = requireDb();
      const storage = requireStorage();
      let previewURL = editingProduct?.previewURL || '';
      let contentURL = editingProduct?.contentURL || '';

      // Upload preview image
      if (previewFile) {
        const previewRef = ref(storage, `shops/${currentUserId}/previews/${Date.now()}_${previewFile.name}`);
        await uploadBytes(previewRef, previewFile);
        previewURL = await getDownloadURL(previewRef);
      }

      // Upload content file
      if (contentFile) {
        const contentRef = ref(storage, `shops/${currentUserId}/content/${Date.now()}_${contentFile.name}`);
        await uploadBytes(contentRef, contentFile);
        contentURL = await getDownloadURL(contentRef);
      }

      const productData = {
        title: formTitle.trim(),
        description: formDescription.trim(),
        type: formType,
        price: formPrice,
        previewURL,
        contentURL,
        status: 'active' as const,
        updatedAt: serverTimestamp(),
      };

      if (editingProduct) {
        // Update existing product
        await updateDoc(doc(db, 'shops', currentUserId, 'items', editingProduct.id), productData);
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? { ...p, ...productData } : p)),
        );
      } else {
        // Create new product
        const docRef = await addDoc(collection(db, 'shops', currentUserId, 'items'), {
          ...productData,
          creatorId: currentUserId,
          sales: 0,
          revenue: 0,
          createdAt: serverTimestamp(),
        });
        setProducts((prev) => [
          { id: docRef.id, ...productData, sales: 0, revenue: 0, createdAt: new Date() } as StoreProduct,
          ...prev,
        ]);
      }

      resetForm();
    } catch (err) {
      console.error('[CreatorStore] Save product error:', err);
      alert('Failed to save product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!currentUserId) return;
    if (!confirm('Delete this product? This action cannot be undone.')) return;

    try {
      const db = requireDb();
      await deleteDoc(doc(db, 'shops', currentUserId, 'items', productId));
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      console.error('[CreatorStore] Delete product error:', err);
      alert('Failed to delete product');
    }
  };

  const handleToggleStatus = async (product: StoreProduct) => {
    if (!currentUserId) return;
    const newStatus = product.status === 'active' ? 'inactive' : 'active';

    try {
      const db = requireDb();
      await updateDoc(doc(db, 'shops', currentUserId, 'items', product.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p)),
      );
    } catch (err) {
      console.error('[CreatorStore] Toggle status error:', err);
      alert('Failed to update product status');
    }
  };

  if (!currentUserId) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24 text-center py-20">
        <p className="text-gray-400">Please sign in to manage your store</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🛍️ My Store</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sell digital products — you keep up to reference rate of each sale
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-[#E4458F] text-white rounded-xl text-sm font-medium hover:bg-[#D03A7D] transition-colors"
        >
          + Add Product
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold">{products.length}</p>
          <p className="text-xs text-gray-500">Products</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold">{totalSales}</p>
          <p className="text-xs text-gray-500">Total Sales</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4 text-center">
          <p className="text-2xl font-bold">{totalRevenue} 🪙</p>
          <p className="text-xs text-gray-500">Revenue</p>
        </div>
      </div>

      {/* View store link */}
      <a
        href={`/store/${currentUserId}`}
        className="block text-center text-sm text-[#E4458F] hover:underline mb-6"
      >
        👁️ View my public store
      </a>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4">
              {editingProduct ? '✏️ Edit Product' : '➕ Add New Product'}
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Product title..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  maxLength={100}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe your product..."
                  className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-none"
                  maxLength={500}
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRODUCT_TYPES.map((pt) => (
                    <button
                      key={pt.value}
                      onClick={() => setFormType(pt.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border ${
                        formType === pt.value
                          ? 'border-[#E4458F] bg-pink-50 dark:bg-pink-900/20 text-[#E4458F]'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium mb-1">Price (tokens)</label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={10000}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Reference payout preview only: estimated creator payout per sale before applicable deductions. Final payout may be lower.
                </p>
              </div>

              {/* Preview image */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Preview Image {editingProduct ? '(leave empty to keep current)' : '(optional)'}
                </label>
                <input
                  ref={previewInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPreviewFile(e.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
              </div>

              {/* Content file */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Content File {editingProduct ? '(leave empty to keep current)' : '(required)'}
                </label>
                <input
                  ref={contentInputRef}
                  type="file"
                  accept={PRODUCT_TYPES.find((pt) => pt.value === formType)?.accept || '*'}
                  onChange={(e) => setContentFile(e.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={resetForm}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProduct}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#E4458F] text-white rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingProduct ? 'Update' : 'Create Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E4458F]" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="text-gray-500 mb-2">No products yet</p>
          <p className="text-sm text-gray-400">
            Add your first digital product to start selling
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div key={product.id} className="bg-white dark:bg-gray-900 rounded-xl border p-4">
              <div className="flex gap-3">
                {/* Preview thumbnail */}
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                  {product.previewURL ? (
                    <img
                      src={product.previewURL}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl">
                      {PRODUCT_TYPES.find((pt) => pt.value === product.type)?.label?.split(' ')[0] || '📄'}
                    </div>
                  )}
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm truncate">{product.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      product.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {product.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{product.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="font-medium text-[#E4458F]">{product.price} tokens</span>
                    <span>{product.sales || 0} sales</span>
                    <span>{product.revenue || 0} 🪙 earned</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <button
                  onClick={() => openEditForm(product)}
                  className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleToggleStatus(product)}
                  className="flex-1 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium"
                >
                  {product.status === 'active' ? '⏸️ Deactivate' : '▶️ Activate'}
                </button>
                <button
                  onClick={() => handleDeleteProduct(product.id)}
                  className="py-1.5 px-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg text-xs font-medium"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}





