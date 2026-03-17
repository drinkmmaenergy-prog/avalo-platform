'use client';

/**
 * PACK 343 — Profile Edit Page
 * Route: /account/profile
 * Renders the ProfileEditor component within AccountLayout.
 */
import React from 'react';
import { AccountLayout } from '../../../components/account/AccountLayout';
import ProfileEditor from '../../../components/profile/ProfileEditor';
import MediaUpload from '../../../components/upload/MediaUpload';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from '@/components/ui/Toaster';

export default function ProfileEditPage() {
  const { firebaseUser, loading } = useAuth();

  const handleAdditionalPhotoUploaded = async (url: string) => {
    toast({
      type: 'info',
      title: 'Photo uploaded',
      description: 'Additional photo has been uploaded to your gallery.',
    });
  };

  if (loading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading profile...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (!firebaseUser) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600 mb-6">Please sign in to edit your profile.</p>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile Editor */}
        <ProfileEditor />

        {/* Additional Photos Upload */}
        <MediaUpload
          storagePath={`users/${firebaseUser.uid}/photos`}
          onUploadComplete={handleAdditionalPhotoUploaded}
          onUploadError={(error) => {
            toast({
              type: 'error',
              title: 'Upload failed',
              description: error.message,
            });
          }}
          maxFiles={6}
          maxSizeMB={10}
          acceptTypes={['image/jpeg', 'image/png', 'image/webp']}
        />
      </div>
    </AccountLayout>
  );
}
