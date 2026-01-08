import { test, expect } from '@playwright/test';
import { login, register, logout, TEST_USER, isAuthenticated } from './helpers/test-helpers';

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies and storage before each test
    await page.context().clearCookies();
  });

  test('should display login page', async ({ page }) => {
    await page.goto('/auth/login');
    
    await expect(page).toHaveTitle(/Login/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with email and password', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Fill in credentials
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for redirect to home page
    await page.waitForURL('/', { timeout: 10000 });
    
    // Verify user is logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Wait for error message
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toContainText(/invalid|incorrect|wrong/i);
  });

  test('should display registration page', async ({ page }) => {
    await page.goto('/auth/register');
    
    await expect(page).toHaveTitle(/Register|Sign Up/i);
    await expect(page.locator('input[name="displayName"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should register new user', async ({ page }) => {
    const uniqueEmail = `test-${Date.now()}@avalo.app`;
    
    await page.goto('/auth/register');
    
    await page.fill('input[name="displayName"]', 'New User');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'Password123!');
    
    await page.click('button[type="submit"]');
    
    // Wait for successful registration
    await page.waitForURL('/', { timeout: 10000 });
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should show error on password mismatch', async ({ page }) => {
    await page.goto('/auth/register');
    
    await page.fill('input[name="displayName"]', 'Test User');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'DifferentPassword123!');
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test('should display Google OAuth button', async ({ page }) => {
    await page.goto('/auth/login');
    
    const googleButton = page.locator('button:has-text("Google")');
    await expect(googleButton).toBeVisible();
  });

  test('should display Apple Sign-In button', async ({ page }) => {
    await page.goto('/auth/login');
    
    const appleButton = page.locator('button:has-text("Apple")');
    await expect(appleButton).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Verify logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Should redirect to login
    await page.waitForURL('/auth/login', { timeout: 5000 });
    
    // Verify logged out
    await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible();
  });

  test('should redirect to login when accessing protected route', async ({ page }) => {
    await page.goto('/profile');
    
    // Should redirect to login
    await page.waitForURL(/auth\/login/, { timeout: 5000 });
  });

  test('should persist session across page reloads', async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Reload page
    await page.reload();
    
    // Should still be logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should display forgot password link', async ({ page }) => {
    await page.goto('/auth/login');
    
    const forgotPasswordLink = page.locator('a:has-text("Forgot Password")');
    await expect(forgotPasswordLink).toBeVisible();
  });

  test('should navigate to registration from login', async ({ page }) => {
    await page.goto('/auth/login');
    
    await page.click('a:has-text("Sign Up"), a:has-text("Register")');
    
    await page.waitForURL(/auth\/register/, { timeout: 5000 });
    await expect(page).toHaveURL(/auth\/register/);
  });
});