/**
 * PACK 300B - Support System Unit Tests
 * Tests for safety classification, escalation, and admin operations
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  classifyTicketSafety,
  calculateTicketSeverity,
  isSafetyTicketType,
  checkSLABreach,
  TicketSeverity,
} from '../../../shared/types/support-300b';
import { TicketType, TicketPriority, SupportTicket, MessageAuthorType } from '../../../shared/types/support';

// ============================================================================
// SAFETY CLASSIFICATION TESTS
// ============================================================================

describe('Safety Classification', () => {
  test('Panic button triggers CRITICAL severity', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      'I need help',
      {},
      true // fromPanic
    );
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('CRITICAL');
    expect(result?.safetyType).toBe('PANIC');
    expect(result?.autoClassified).toBe(true);
    expect(result?.isSafety).toBe(true);
  });

  test('Violence keywords trigger CRITICAL severity', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      'Someone is threatening me with violence',
      {},
      false
    );
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('CRITICAL');
    expect(result?.isSafety).toBe(true);
  });

  test('Harassment keywords trigger HIGH severity', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      'User is harassing me constantly',
      {},
      false
    );
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('HIGH');
    expect(result?.isSafety).toBe(true);
  });

  test('Safety ticket types are at least HIGH', () => {
    const result = classifyTicketSafety(
      'SAFETY_REPORT_FOLLOWUP',
      'Following up on my report',
      {},
      false
    );
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('HIGH');
    expect(result?.isSafety).toBe(true);
  });

  test('Normal tickets without safety keywords return null', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      'How do I change my profile picture?',
      {},
      false
    );
    
    expect(result).toBeNull();
  });

  test('Multiple danger keywords trigger CRITICAL', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      'Emergency! Someone is stalking me and I feel in danger',
      {},
      false
    );
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('CRITICAL');
  });
});

// ============================================================================
// SEVERITY CALCULATION TESTS
// ============================================================================

describe('Severity Calculation', () => {
  test('Panic always returns CRITICAL', () => {
    const severity = calculateTicketSeverity(
      'GENERAL_QUESTION',
      'Just testing',
      true
    );
    expect(severity).toBe('CRITICAL');
  });

  test('SAFETY_REPORT_FOLLOWUP returns HIGH', () => {
    const severity = calculateTicketSeverity(
      'SAFETY_REPORT_FOLLOWUP',
      'Following up',
      false
    );
    expect(severity).toBe('HIGH');
  });

  test('Critical keywords return CRITICAL', () => {
    const keywords = ['danger', 'emergency', 'threat', 'violence', 'assault'];
    
    keywords.forEach(keyword => {
      const severity = calculateTicketSeverity(
        'GENERAL_QUESTION',
        `There is a ${keyword} situation`,
        false
      );
      expect(severity).toBe('CRITICAL');
    });
  });

  test('High keywords return HIGH', () => {
    const keywords = ['harassment', 'abuse', 'scared', 'unsafe'];
    
    keywords.forEach(keyword => {
      const severity = calculateTicketSeverity(
        'GENERAL_QUESTION',
        `I feel ${keyword}`,
        false
      );
      expect(severity).toBe('HIGH');
    });
  });

  test('Normal ticket returns MEDIUM', () => {
    const severity = calculateTicketSeverity(
      'GENERAL_QUESTION',
      'How do I use this feature?',
      false
    );
    expect(severity).toBe('MEDIUM');
  });
});

// ============================================================================
// TICKET TYPE TESTS
// ============================================================================

describe('Safety Ticket Type Detection', () => {
  test('SAFETY_REPORT_FOLLOWUP is safety ticket', () => {
    expect(isSafetyTicketType('SAFETY_REPORT_FOLLOWUP')).toBe(true);
  });

  test('CONTENT_TAKEDOWN is safety ticket', () => {
    expect(isSafetyTicketType('CONTENT_TAKEDOWN')).toBe(true);
  });

  test('GENERAL_QUESTION is not safety ticket', () => {
    expect(isSafetyTicketType('GENERAL_QUESTION')).toBe(false);
  });

  test('PAYMENT_ISSUE is not safety ticket', () => {
    expect(isSafetyTicketType('PAYMENT_ISSUE')).toBe(false);
  });
});

// ============================================================================
// SLA BREACH TESTS
// ============================================================================

describe('SLA Breach Detection', () => {
  function createMockTicket(
    priority: TicketPriority,
    createdMinutesAgo: number
  ): SupportTicket {
    const now = new Date();
    const createdAt = new Date(now.getTime() - createdMinutesAgo * 60000);
    
    return {
      ticketId: 'test-ticket-1',
      userId: 'user-123',
      status: 'OPEN',
      priority,
      type: 'GENERAL_QUESTION',
      subject: 'Test ticket',
      description: 'Test description',
      related: {},
      userLocale: 'en-US',
      userCountry: 'US',
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      lastMessageAt: createdAt.toISOString(),
    };
  }

  test('CRITICAL ticket breaches SLA after 15 minutes without response', () => {
    const ticket = createMockTicket('CRITICAL', 20);
    const breach = checkSLABreach(ticket, []);
    
    expect(breach.breached).toBe(true);
    expect(breach.type).toBe('RESPONSE');
    expect(breach.overdue).toBeGreaterThan(0);
  });

  test('CRITICAL ticket does not breach within 15 minutes', () => {
    const ticket = createMockTicket('CRITICAL', 10);
    const breach = checkSLABreach(ticket, []);
    
    expect(breach.breached).toBe(false);
  });

  test('HIGH ticket breaches SLA after 60 minutes without response', () => {
    const ticket = createMockTicket('HIGH', 70);
    const breach = checkSLABreach(ticket, []);
    
    expect(breach.breached).toBe(true);
    expect(breach.type).toBe('RESPONSE');
  });

  test('Ticket with support reply does not breach response SLA', () => {
    const ticket = createMockTicket('CRITICAL', 20);
    const messages = [{
      authorType: 'SUPPORT' as MessageAuthorType,
      createdAt: new Date().toISOString(),
    }];
    
    const breach = checkSLABreach(ticket, messages);
    expect(breach.breached).toBe(false);
  });

  test('NORMAL ticket breaches SLA after 4 hours without response', () => {
    const ticket = createMockTicket('NORMAL', 250); // 4.17 hours
    const breach = checkSLABreach(ticket, []);
    
    expect(breach.breached).toBe(true);
    expect(breach.type).toBe('RESPONSE');
  });

  test('LOW ticket breaches SLA after 8 hours without response', () => {
    const ticket = createMockTicket('LOW', 500); // 8.33 hours
    const breach = checkSLABreach(ticket, []);
    
    expect(breach.breached).toBe(true);
    expect(breach.type).toBe('RESPONSE');
  });
});

// ============================================================================
// INTEGRATION SCENARIOS
// ============================================================================

describe('Integration Scenarios', () => {
  test('Panic button ticket creates correct safety metadata', () => {
    const related = {
      fromPanic: true,
      reportedUserId: 'dangerous-user-123',
    };
    
    const safety = classifyTicketSafety(
      'GENERAL_QUESTION',
      'Emergency situation',
      related,
      true
    );
    
    expect(safety).not.toBeNull();
    expect(safety?.isSafety).toBe(true);
    expect(safety?.severity).toBe('CRITICAL');
    expect(safety?.safetyType).toBe('PANIC');
    expect(safety?.reportedUserId).toBe('dangerous-user-123');
    expect(safety?.autoClassified).toBe(true);
    expect(safety?.classificationReason).toContain('panic');
  });

  test('Multiple safety indicators combine correctly', () => {
    const safety = classifyTicketSafety(
      'SAFETY_REPORT_FOLLOWUP',
      'User threatened violence and is stalking me',
      { reportedUserId: 'bad-user-456' },
      false
    );
    
    expect(safety).not.toBeNull();
    expect(safety?.isSafety).toBe(true);
    expect(safety?.severity).toBe('CRITICAL'); // Violence keyword overrides HIGH base
    expect(safety?.reportedUserId).toBe('bad-user-456');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  test('Empty description returns null', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      '',
      {},
      false
    );
    expect(result).toBeNull();
  });

  test('Case-insensitive keyword matching', () => {
    const testCases = [
      'DANGER',
      'Danger',
      'danger',
      'EMERGENCY',
      'Emergency',
    ];
    
    testCases.forEach(text => {
      const result = classifyTicketSafety(
        'GENERAL_QUESTION',
        text,
        {},
        false
      );
      expect(result).not.toBeNull();
      expect(result?.severity).toBe('CRITICAL');
    });
  });

  test('Keywords in context are detected', () => {
    const result = classifyTicketSafety(
      'GENERAL_QUESTION',
      'This user keeps harassing me every day',
      {},
      false
    );
    
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('HIGH');
  });

  test('Related reportId is captured', () => {
    const safety = classifyTicketSafety(
      'SAFETY_REPORT_FOLLOWUP',
      'Following up',
      { reportId: 'report-789' },
      false
    );
    
    expect(safety).not.toBeNull();
    expect(safety?.relatedReportId).toBe('report-789');
  });
});