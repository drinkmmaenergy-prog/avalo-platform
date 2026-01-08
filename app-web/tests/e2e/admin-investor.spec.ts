/**
 * Web E2E Tests - Admin & Investor Pages
 * Tests admin configuration and investor dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Investor Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test INVESTOR account
    await page.goto('/login');
    await page.fill('[name="email"]', 'investor.test@avalo.com');
    await page.fill('[name="password"]', 'TestInvestor123!');
    await page.click('[data-testid="login-submit"]');
    await page.waitForURL('/investor/dashboard');
  });

  test('should show investor dashboard with metrics', async ({ page }) => {
    // Verify dashboard loaded
    await expect(page.locator('h1')).toContainText(/Dashboard/i);
    
    // Check metrics cards
    const metricsCards = page.locator('[data-testid="metric-card"]');
    await expect(metricsCards).toHaveCount(4, { timeout: 10000 });
    
    // Verify cards contain data
    await expect(metricsCards.first()).toBeVisible();
  });

  test('should display aggregated data without PII', async ({ page }) => {
    // Check that no personal information is visible
    const piiPatterns = [
      /email.*@.*\.com/i,
      /\+\d{2,3}\s?\d{9,}/,  // Phone numbers
      /\b\d{3}-\d{2}-\d{4}\b/,  // SSN patterns
    ];
    
    const content = await page.textContent('body');
    
    for (const pattern of piiPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });

  test('should show revenue charts', async ({ page }) => {
    const chart = page.locator('[data-testid="revenue-chart"]');
    await expect(chart).toBeVisible();
  });
});

test.describe('Admin Configuration', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test ADMIN account
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin.test@avalo.com');
    await page.fill('[name="password"]', 'TestAdmin123!');
    await page.click('[data-testid="login-submit"]');
    await page.waitForURL(/admin/);
  });

  test('should access admin config page', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.locator('h1')).toContainText(/Configuration/i);
  });

  test('should toggle feature flag', async ({ page }) => {
    await page.goto('/admin/config');
    
    // Find a non-critical feature flag
    const testFlag = page.locator('[data-testid="flag-test-mode"]');
    const initialState = await testFlag.isChecked();
    
    // Toggle it
    await testFlag.click();
    
    // Save changes
    await page.click('[data-testid="save-config"]');
    
    // Wait for success message
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();
    
    // Verify state changed
    const newState = await testFlag.isChecked();
    expect(newState).not.toBe(initialState);
  });

  test('should create audit log on config change', async ({ page }) => {
    await page.goto('/admin/config');
    
    // Make a change
    await page.locator('[data-testid="flag-test-mode"]').click();
    await page.click('[data-testid="save-config"]');
    
    // Navigate to audit logs
    await page.goto('/admin/audit-logs');
    
    // Verify recent log entry
    const recentLog = page.locator('[data-testid="audit-log"]').first();
    await expect(recentLog).toContainText(/Config/i);
  });

  test('should not allow unauthorized access', async ({ page }) => {
    // Logout
    await page.click('[data-testid="logout"]');
    
    // Try to access admin page
    await page.goto('/admin/config');
    
    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});