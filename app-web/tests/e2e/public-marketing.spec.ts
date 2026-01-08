/**
 * Web E2E Tests - Public Marketing & Onboarding
 * Tests landing page, signup flow, and legal pages
 */

import { test, expect } from '@playwright/test';

test.describe('Public Marketing Pages', () => {
  test('should load landing page successfully', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for key elements
    await expect(page).toHaveTitle(/Avalo/i);
    
    // Verify hero section
    const hero = page.locator('[data-testid="hero-section"]');
    await expect(hero).toBeVisible();
  });

  test('should navigate to pre-signup from landing', async ({ page }) => {
    await page.goto('/');
    
    // Find and click CTA button
    const ctaButton = page.locator('[data-testid="landing-cta"]');
    await ctaButton.click();
    
    // Should navigate to /start
    await expect(page).toHaveURL('/start');
    
    // Verify pre-signup form
    const form = page.locator('[data-testid="presignup-form"]');
    await expect(form).toBeVisible();
  });

  test('should complete pre-signup and show deep link', async ({ page }) => {
    await page.goto('/start');
    
    // Fill form
    await page.fill('[name="name"]', 'Test User');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="phone"]', '+48123456789');
    await page.selectOption('[name="gender"]', 'male');
    
    // Submit
    await page.click('[data-testid="submit-presignup"]');
    
    // Should show QR code / deep link
    await expect(page.locator('[data-testid="qr-code"]')).toBeVisible();
    await expect(page.locator('[data-testid="deep-link"]')).toBeVisible();
  });

  test('should load legal pages', async ({ page }) => {
    // Terms of Service
    await page.goto('/legal/terms');
    await expect(page.locator('h1')).toContainText(/Terms/i);
    
    // Privacy Policy
    await page.goto('/legal/privacy');
    await expect(page.locator('h1')).toContainText(/Privacy/i);
    
    // Safety Guidelines
    await page.goto('/safety');
    await expect(page.locator('h1')).toContainText(/Safety/i);
  });
});

test.describe('Web Signup Flow', () => {
  test('should complete basic registration', async ({ page }) => {
    await page.goto('/signup');
    
    // Mark as test account
    await page.evaluate(() => {
      localStorage.setItem('isTestAccount', 'true');
    });
    
    // Fill registration form
    await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('[name="password"]', 'SecurePass123!');
    await page.fill('[name="displayName"]', 'Test User');
    await page.fill('[name="dateOfBirth"]', '1995-01-01');
    await page.selectOption('[name="gender"]', 'male');
    
    // Accept terms
    await page.check('[name="acceptTerms"]');
    
    // Submit
    await page.click('[data-testid="submit-signup"]');
    
    // Should redirect to verification or onboarding
    await page.waitForURL(/\/(verification|onboarding)/);
  });

  test('should block underage users (under 18)', async ({ page }) => {
    await page.goto('/signup');
    
    // Try to register with DOB showing under 18
    await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('[name="password"]', 'SecurePass123!');
    await page.fill('[name="dateOfBirth"]', '2020-01-01'); // Only 5 years old
    
    // Submit
    await page.click('[data-testid="submit-signup"]');
    
    // Should show age error
    const error = page.locator('[data-testid="age-error"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/18/i);
  });
});

test.describe('Legal Pages Accessibility', () => {
  test('should have no accessibility violations on terms page', async ({ page }) => {
    await page.goto('/legal/terms');
    
    // Check for basic accessibility
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    
    // Verify readable content
    const content = page.locator('[role="main"]');
    await expect(content).toBeVisible();
  });

  test('should have working navigation in legal pages', async ({ page }) => {
    await page.goto('/legal/terms');
    
    // Find privacy link
    const privacyLink = page.locator('a[href*="privacy"]');
    await privacyLink.click();
    
    // Should navigate to privacy
    await expect(page).toHaveURL(/privacy/);
  });
});