import { Page, expect } from '@playwright/test';

/**
 * Test helpers for Avalo Web E2E tests
 */

export const TEST_USER = {
  email: 'test@avalo.app',
  password: 'TestPassword123!',
  displayName: 'Test User'
};

export const TEST_CREATOR = {
  email: 'creator@avalo.app',
  password: 'CreatorPass123!',
  displayName: 'Test Creator'
};

/**
 * Login helper
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for navigation to complete
  await page.waitForURL('/', { timeout: 10000 });
}

/**
 * Register helper
 */
export async function register(page: Page, email: string, password: string, displayName: string) {
  await page.goto('/auth/register');
  await page.fill('input[name="displayName"]', displayName);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for navigation
  await page.waitForURL('/', { timeout: 10000 });
}

/**
 * Wait for element to be visible with custom timeout
 */
export async function waitForElement(page: Page, selector: string, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Logout helper
 */
export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout-button"]');
  await page.waitForURL('/auth/login', { timeout: 5000 });
}

/**
 * Navigate to feed
 */
export async function navigateToFeed(page: Page) {
  await page.goto('/feed');
  await waitForElement(page, '[data-testid="feed-container"]');
}

/**
 * Navigate to chat
 */
export async function navigateToChat(page: Page, chatId?: string) {
  if (chatId) {
    await page.goto(`/messages/${chatId}`);
  } else {
    await page.goto('/messages');
  }
  await waitForElement(page, '[data-testid="chat-container"]');
}

/**
 * Navigate to profile
 */
export async function navigateToProfile(page: Page, userId?: string) {
  if (userId) {
    await page.goto(`/profile/${userId}`);
  } else {
    await page.goto('/profile');
  }
  await waitForElement(page, '[data-testid="profile-container"]');
}

/**
 * Navigate to events
 */
export async function navigateToEvents(page: Page) {
  await page.goto('/events');
  await waitForElement(page, '[data-testid="events-container"]');
}

/**
 * Wait for API response
 */
export async function waitForAPIResponse(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse(
    response => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout: 10000 }
  );
}

/**
 * Check for error messages
 */
export async function hasErrorMessage(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector('[role="alert"]', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get error message text
 */
export async function getErrorMessage(page: Page): Promise<string | null> {
  try {
    const errorElement = await page.waitForSelector('[role="alert"]', { timeout: 2000 });
    return await errorElement.textContent();
  } catch {
    return null;
  }
}

/**
 * Simulate offline mode
 */
export async function goOffline(page: Page) {
  await page.context().setOffline(true);
}

/**
 * Simulate online mode
 */
export async function goOnline(page: Page) {
  await page.context().setOffline(false);
}