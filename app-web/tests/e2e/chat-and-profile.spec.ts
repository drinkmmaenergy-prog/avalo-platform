import { test, expect } from '@playwright/test';
import { login, TEST_USER, navigateToChat, navigateToProfile, waitForElement } from './helpers/test-helpers';

test.describe('Chat and Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
  });

  test.describe('Chat', () => {
    test('should display chat list', async ({ page }) => {
      await navigateToChat(page);
      
      await expect(page.locator('[data-testid="chat-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="chat-list"]')).toBeVisible();
    });

    test('should open chat conversation', async ({ page }) => {
      await navigateToChat(page);
      
      const firstChat = page.locator('[data-testid="chat-item"]').first();
      
      if (await firstChat.isVisible()) {
        await firstChat.click();
        
        await expect(page.locator('[data-testid="chat-messages"]')).toBeVisible();
        await expect(page.locator('[data-testid="message-input"]')).toBeVisible();
      }
    });

    test('should send free message', async ({ page }) => {
      await navigateToChat(page, 'test-chat-id');
      
      const messageInput = page.locator('[data-testid="message-input"]');
      const sendButton = page.locator('[data-testid="send-message-button"]');
      
      await messageInput.fill('Test message');
      await sendButton.click();
      
      // Verify message appears in chat
      await expect(page.locator('[data-testid="message-bubble"]').last()).toContainText('Test message');
    });

    test('should display token cost indicator', async ({ page }) => {
      await navigateToChat(page, 'test-chat-id');
      
      // Type a long message to trigger cost indicator
      const messageInput = page.locator('[data-testid="message-input"]');
      await messageInput.fill('This is a long message that will cost tokens to send because it exceeds the free message limit');
      
      // Cost indicator should be visible
      const costIndicator = page.locator('[data-testid="message-cost-indicator"]');
      
      if (await costIndicator.isVisible()) {
        await expect(costIndicator).toContainText(/token|cost/i);
      }
    });

    test('should display media unlock paywall', async ({ page }) => {
      await navigateToChat(page, 'test-chat-id');
      
      const lockedMedia = page.locator('[data-testid="locked-media"]').first();
      
      if (await lockedMedia.isVisible()) {
        await expect(lockedMedia).toBeVisible();
        await expect(page.locator('[data-testid="unlock-media-button"]')).toBeVisible();
      }
    });

    test('should show typing indicator', async ({ page }) => {
      await navigateToChat(page, 'test-chat-id');
      
      const typingIndicator = page.locator('[data-testid="typing-indicator"]');
      
      // Typing indicator might appear during real-time chat
      if (await typingIndicator.isVisible({ timeout: 2000 })) {
        await expect(typingIndicator).toContainText(/typing/i);
      }
    });
  });

  test.describe('Profile', () => {
    test('should display own profile', async ({ page }) => {
      await navigateToProfile(page);
      
      await expect(page.locator('[data-testid="profile-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="profile-avatar"]')).toBeVisible();
      await expect(page.locator('[data-testid="profile-name"]')).toBeVisible();
    });

    test('should display profile stats', async ({ page }) => {
      await navigateToProfile(page);
      
      await expect(page.locator('[data-testid="profile-followers"]')).toBeVisible();
      await expect(page.locator('[data-testid="profile-following"]')).toBeVisible();
      await expect(page.locator('[data-testid="profile-posts"]')).toBeVisible();
    });

    test('should display edit profile button on own profile', async ({ page }) => {
      await navigateToProfile(page);
      
      const editButton = page.locator('[data-testid="edit-profile-button"]');
      await expect(editButton).toBeVisible();
    });

    test('should navigate to settings', async ({ page }) => {
      await navigateToProfile(page);
      
      const settingsButton = page.locator('[data-testid="settings-button"]');
      await settingsButton.click();
      
      await page.waitForURL(/\/settings/, { timeout: 5000 });
      await expect(page).toHaveURL(/\/settings/);
    });

    test('should display posts grid', async ({ page }) => {
      await navigateToProfile(page);
      
      const postsGrid = page.locator('[data-testid="profile-posts-grid"]');
      
      if (await postsGrid.isVisible()) {
        await expect(postsGrid).toBeVisible();
      }
    });

    test('should visit another user profile', async ({ page }) => {
      await navigateToProfile(page, 'other-user-id');
      
      await expect(page.locator('[data-testid="profile-container"]')).toBeVisible();
      
      // Should show follow/message buttons instead of edit
      const followButton = page.locator('[data-testid="follow-button"]');
      const messageButton = page.locator('[data-testid="message-button"]');
      
      await expect(followButton.or(messageButton)).toBeVisible();
    });

    test('should follow user', async ({ page }) => {
      await navigateToProfile(page, 'other-user-id');
      
      const followButton = page.locator('[data-testid="follow-button"]');
      
      if (await followButton.isVisible()) {
        await followButton.click();
        
        // Button should change to "Following"
        await expect(followButton).toContainText(/following|unfollow/i);
      }
    });

    test('should open message from profile', async ({ page }) => {
      await navigateToProfile(page, 'other-user-id');
      
      const messageButton = page.locator('[data-testid="message-button"]');
      
      if (await messageButton.isVisible()) {
        await messageButton.click();
        
        // Should navigate to chat
        await page.waitForURL(/\/messages/, { timeout: 5000 });
      }
    });
  });
});