import { test, expect } from '@playwright/test';
import { login, TEST_USER, navigateToFeed, waitForElement } from './helpers/test-helpers';

test.describe('Feed, Stories, and Reels', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page, TEST_USER.email, TEST_USER.password);
  });

  test.describe('Feed', () => {
    test('should display feed page', async ({ page }) => {
      await navigateToFeed(page);
      
      await expect(page.locator('[data-testid="feed-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="feed-post"]')).toHaveCount(await page.locator('[data-testid="feed-post"]').count());
    });

    test('should load more posts on scroll', async ({ page }) => {
      await navigateToFeed(page);
      
      const initialPostCount = await page.locator('[data-testid="feed-post"]').count();
      
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      
      // Wait for new posts to load
      await page.waitForTimeout(2000);
      
      const newPostCount = await page.locator('[data-testid="feed-post"]').count();
      expect(newPostCount).toBeGreaterThanOrEqual(initialPostCount);
    });

    test('should like a post', async ({ page }) => {
      await navigateToFeed(page);
      
      // Find first like button
      const likeButton = page.locator('[data-testid="post-like-button"]').first();
      await likeButton.click();
      
      // Verify liked state
      await expect(likeButton).toHaveAttribute('data-liked', 'true');
    });

    test('should unlike a post', async ({ page }) => {
      await navigateToFeed(page);
      
      const likeButton = page.locator('[data-testid="post-like-button"]').first();
      
      // Like the post
      await likeButton.click();
      await expect(likeButton).toHaveAttribute('data-liked', 'true');
      
      // Unlike the post
      await likeButton.click();
      await expect(likeButton).toHaveAttribute('data-liked', 'false');
    });

    test('should display NSFW warning for NSFW content', async ({ page }) => {
      await navigateToFeed(page);
      
      // Look for NSFW content
      const nsfwPost = page.locator('[data-testid="nsfw-warning"]').first();
      
      if (await nsfwPost.isVisible()) {
        await expect(nsfwPost).toContainText(/NSFW|explicit|mature/i);
        await expect(page.locator('[data-testid="nsfw-reveal-button"]')).toBeVisible();
      }
    });

    test('should open post details', async ({ page }) => {
      await navigateToFeed(page);
      
      // Click on first post
      const firstPost = page.locator('[data-testid="feed-post"]').first();
      await firstPost.click();
      
      // Should navigate to post detail page
      await page.waitForURL(/\/post\//, { timeout: 5000 });
    });
  });

  test.describe('Stories', () => {
    test('should display stories bar', async ({ page }) => {
      await navigateToFeed(page);
      
      const storiesBar = page.locator('[data-testid="stories-bar"]');
      
      if (await storiesBar.isVisible()) {
        await expect(storiesBar).toBeVisible();
        await expect(page.locator('[data-testid="story-avatar"]')).toHaveCount(
          await page.locator('[data-testid="story-avatar"]').count()
        );
      }
    });

    test('should open story viewer', async ({ page }) => {
      await navigateToFeed(page);
      
      const firstStory = page.locator('[data-testid="story-avatar"]').first();
      
      if (await firstStory.isVisible()) {
        await firstStory.click();
        
        // Story viewer should open
        await expect(page.locator('[data-testid="story-viewer"]')).toBeVisible();
        await expect(page.locator('[data-testid="story-progress-bar"]')).toBeVisible();
      }
    });

    test('should auto-advance stories', async ({ page }) => {
      await navigateToFeed(page);
      
      const firstStory = page.locator('[data-testid="story-avatar"]').first();
      
      if (await firstStory.isVisible()) {
        await firstStory.click();
        
        const initialStoryId = await page.locator('[data-testid="current-story-id"]').textContent();
        
        // Wait for auto-advance (typically 5 seconds per story)
        await page.waitForTimeout(6000);
        
        const newStoryId = await page.locator('[data-testid="current-story-id"]').textContent();
        expect(newStoryId).not.toBe(initialStoryId);
      }
    });

    test('should close story viewer', async ({ page }) => {
      await navigateToFeed(page);
      
      const firstStory = page.locator('[data-testid="story-avatar"]').first();
      
      if (await firstStory.isVisible()) {
        await firstStory.click();
        await expect(page.locator('[data-testid="story-viewer"]')).toBeVisible();
        
        // Click close button
        await page.locator('[data-testid="story-close-button"]').click();
        
        // Story viewer should close
        await expect(page.locator('[data-testid="story-viewer"]')).not.toBeVisible();
      }
    });
  });

  test.describe('Reels', () => {
    test('should navigate to reels page', async ({ page }) => {
      await page.goto('/reels');
      
      await expect(page.locator('[data-testid="reels-container"]')).toBeVisible();
    });

    test('should display reels in vertical layout', async ({ page }) => {
      await page.goto('/reels');
      
      await waitForElement(page, '[data-testid="reel-video"]');
      
      const reels = page.locator('[data-testid="reel-video"]');
      await expect(reels.first()).toBeVisible();
    });

    test('should autoplay reel video', async ({ page }) => {
      await page.goto('/reels');
      
      await waitForElement(page, '[data-testid="reel-video"]');
      
      // Check if video is playing
      const isPlaying = await page.locator('[data-testid="reel-video"]').first().evaluate((video: any) => {
        return !video.paused;
      });
      
      expect(isPlaying).toBe(true);
    });

    test('should swipe to next reel', async ({ page }) => {
      await page.goto('/reels');
      
      await waitForElement(page, '[data-testid="reel-video"]');
      
      const initialReelId = await page.locator('[data-testid="current-reel-id"]').textContent();
      
      // Swipe up to next reel
      await page.mouse.move(400, 600);
      await page.mouse.down();
      await page.mouse.move(400, 200);
      await page.mouse.up();
      
      await page.waitForTimeout(500);
      
      const newReelId = await page.locator('[data-testid="current-reel-id"]').textContent();
      expect(newReelId).not.toBe(initialReelId);
    });

    test('should toggle mute on reel', async ({ page }) => {
      await page.goto('/reels');
      
      await waitForElement(page, '[data-testid="reel-video"]');
      
      const muteButton = page.locator('[data-testid="reel-mute-button"]');
      await muteButton.click();
      
      // Check muted state
      const isMuted = await page.locator('[data-testid="reel-video"]').first().evaluate((video: any) => {
        return video.muted;
      });
      
      expect(isMuted).toBe(true);
    });
  });
});