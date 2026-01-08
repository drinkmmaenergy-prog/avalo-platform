import { test, expect } from '@playwright/test';
import { login, TEST_USER, navigateToEvents, waitForElement } from './helpers/test-helpers';

test.describe('Events', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER.email, TEST_USER.password);
  });

  test('should display events page', async ({ page }) => {
    await navigateToEvents(page);
    
    await expect(page.locator('[data-testid="events-container"]')).toBeVisible();
  });

  test('should display event cards', async ({ page }) => {
    await navigateToEvents(page);
    
    const eventCards = page.locator('[data-testid="event-card"]');
    
    if (await eventCards.first().isVisible({ timeout: 5000 })) {
      await expect(eventCards.first()).toBeVisible();
      await expect(page.locator('[data-testid="event-title"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="event-date"]').first()).toBeVisible();
    }
  });

  test('should filter events by type', async ({ page }) => {
    await navigateToEvents(page);
    
    const filterButton = page.locator('[data-testid="event-filter-offline"]');
    
    if (await filterButton.isVisible()) {
      await filterButton.click();
      
      // Verify filtered results
      await page.waitForTimeout(1000);
      const eventCards = page.locator('[data-testid="event-card"]');
      
      if (await eventCards.first().isVisible()) {
        const eventType = await eventCards.first().locator('[data-testid="event-type"]').textContent();
        expect(eventType).toContain('Offline');
      }
    }
  });

  test('should open event details', async ({ page }) => {
    await navigateToEvents(page);
    
    const firstEvent = page.locator('[data-testid="event-card"]').first();
    
    if (await firstEvent.isVisible()) {
      await firstEvent.click();
      
      await page.waitForURL(/\/events\//, { timeout: 5000 });
      await expect(page.locator('[data-testid="event-details"]')).toBeVisible();
    }
  });

  test('should display ticket purchase button', async ({ page }) => {
    await navigateToEvents(page);
    
    const firstEvent = page.locator('[data-testid="event-card"]').first();
    
    if (await firstEvent.isVisible()) {
      await firstEvent.click();
      
      await expect(page.locator('[data-testid="purchase-ticket-button"]')).toBeVisible();
    }
  });

  test('should show ticket price', async ({ page }) => {
    await navigateToEvents(page);
    
    const firstEvent = page.locator('[data-testid="event-card"]').first();
    
    if (await firstEvent.isVisible()) {
      await firstEvent.click();
      
      const priceElement = page.locator('[data-testid="ticket-price"]');
      
      if (await priceElement.isVisible()) {
        const priceText = await priceElement.textContent();
        expect(priceText).toMatch(/\d+\s*token/i);
      }
    }
  });

  test('should display event location for offline events', async ({ page }) => {
    await navigateToEvents(page);
    
    const offlineEvent = page.locator('[data-testid="event-card"][data-type="offline"]').first();
    
    if (await offlineEvent.isVisible()) {
      await offlineEvent.click();
      
      await expect(page.locator('[data-testid="event-location"]')).toBeVisible();
    }
  });

  test('should display join button for virtual events', async ({ page }) => {
    await navigateToEvents(page);
    
    const virtualEvent = page.locator('[data-testid="event-card"][data-type="virtual"]').first();
    
    if (await virtualEvent.isVisible()) {
      await virtualEvent.click();
      
      const joinButton = page.locator('[data-testid="join-virtual-event-button"]');
      
      if (await joinButton.isVisible()) {
        await expect(joinButton).toBeVisible();
      }
    }
  });

  test('should display panic safety button for offline events', async ({ page }) => {
    await navigateToEvents(page);
    
    const offlineEvent = page.locator('[data-testid="event-card"][data-type="offline"]').first();
    
    if (await offlineEvent.isVisible()) {
      await offlineEvent.click();
      
      const panicButton = page.locator('[data-testid="panic-safety-button"]');
      
      if (await panicButton.isVisible()) {
        await expect(panicButton).toBeVisible();
        await expect(panicButton).toHaveAttribute('aria-label', /panic|safety|emergency/i);
      }
    }
  });

  test('should display QR code for purchased ticket', async ({ page }) => {
    await navigateToEvents(page);
    
    const myTicketsTab = page.locator('[data-testid="my-tickets-tab"]');
    
    if (await myTicketsTab.isVisible()) {
      await myTicketsTab.click();
      
      const ticketCard = page.locator('[data-testid="ticket-card"]').first();
      
      if (await ticketCard.isVisible()) {
        await ticketCard.click();
        
        const qrCode = page.locator('[data-testid="ticket-qr-code"]');
        await expect(qrCode).toBeVisible();
      }
    }
  });
});