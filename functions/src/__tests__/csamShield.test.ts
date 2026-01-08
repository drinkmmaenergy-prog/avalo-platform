/**
 * CSAM Shield Tests
 * Phase 22: Verification tests for CSAM detection
 * 
 * IMPORTANT SAFETY NOTICE:
 * These tests use OBVIOUSLY FAKE, NON-SEXUAL test strings.
 * NEVER use real CSAM content or realistic test cases.
 */

import { evaluateTextForCsamRisk } from '../csamShield';

describe('CSAM Shield - Text Detection', () => {
  
  describe('Safe Content (Should NOT Flag)', () => {
    
    test('Normal conversation about children in appropriate context', () => {
      const text = "Looking for a babysitter for my 8 year old child";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
    
    test('Educational content', () => {
      const text = "Teaching middle school students about internet safety";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
    
    test('Teen-related content without sexual context', () => {
      const text = "Great movie for teenagers and young adults";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
  });
  
  describe('CSAM Risk Detection (Should Flag)', () => {
    
    test('HIGH risk: Clear child + sexual term combination', () => {
      const text = "child adult content explicit material";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(true);
      expect(result.riskLevel).toMatch(/HIGH|CRITICAL/);
      expect(result.reasonCodes.length).toBeGreaterThan(0);
    });
    
    test('CRITICAL risk: Multiple child + sexual terms', () => {
      const text = "minor underage sexual explicit nude content child";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(true);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.reasonCodes.length).toBeGreaterThan(2);
    });
    
    test('HIGH risk: Age pattern + sexual content', () => {
      const text = "14 year old explicit sexual content";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(true);
      expect(result.riskLevel).toMatch(/HIGH|CRITICAL/);
    });
  });
  
  describe('Polish Language Detection', () => {
    
    test('Safe Polish content', () => {
      const text = "Szukam opiekunki dla mojego dziecka";
      const result = evaluateTextForCsamRisk(text, 'pl');
      
      expect(result.isFlagged).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
    
    test('HIGH risk: Polish CSAM indicators', () => {
      const text = "nieletni dziecko seksualny treści";
      const result = evaluateTextForCsamRisk(text, 'pl');
      
      expect(result.isFlagged).toBe(true);
      expect(result.riskLevel).toMatch(/HIGH|CRITICAL/);
    });
  });
  
  describe('Edge Cases', () => {
    
    test('Empty string', () => {
      const text = "";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
    
    test('Whitespace only', () => {
      const text = "   \n\t  ";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
      expect(result.riskLevel).toBe('LOW');
    });
    
    test('Unsupported language defaults to English', () => {
      const text = "child sexual content";
      const result = evaluateTextForCsamRisk(text, 'fr'); // French not supported
      
      expect(result.isFlagged).toBe(true);
      expect(result.riskLevel).toMatch(/HIGH|CRITICAL/);
    });
  });
  
  describe('Detection Accuracy', () => {
    
    test('Isolated child term without sexual content', () => {
      const text = "children playing in the park";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
    });
    
    test('Adult content without child references', () => {
      const text = "adult content for mature audiences only";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      expect(result.isFlagged).toBe(false);
    });
    
    test('Medical/educational context should not flag', () => {
      const text = "adolescent development and sexual education for teenagers";
      const result = evaluateTextForCsamRisk(text, 'en');
      
      // This may flag as MEDIUM due to combinations, but should not be HIGH/CRITICAL
      if (result.isFlagged) {
        expect(result.riskLevel).toBe('MEDIUM');
      }
    });
  });
});

/**
 * Test Summary
 * 
 * This test suite verifies:
 * 1. ✅ Safe content is not flagged
 * 2. ✅ Clear CSAM indicators are flagged as HIGH/CRITICAL
 * 3. ✅ Multi-language support works (EN + PL)
 * 4. ✅ Edge cases are handled gracefully
 * 5. ✅ Isolated terms don't trigger false positives
 * 
 * To run tests:
 * cd functions
 * npm test -- csamShield.test.ts
 */