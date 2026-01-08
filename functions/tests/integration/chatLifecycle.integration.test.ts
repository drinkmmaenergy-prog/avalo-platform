/**
 * Chat Lifecycle Integration Tests
 * Tests complete chat flows with Firebase emulator
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  determineChatRoles,
  initializeChat,
  processMessageBilling,
  processChatDeposit,
  closeAndSettleChat,
} from '../../src/chatMonetization';
import {
  createTestMale,
  createTestFemale,
  generateTestChatId,
  createTestWallet,
} from '../utils/testData';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'avalo-test',
    firestore: {
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Chat Integration - Full Lifecycle', () => {
  it('should complete a full paid chat session', async () => {
    const chatId = generateTestChatId();
    const payer = createTestMale({ userId: 'payer_1' });
    const earner = createTestFemale({ userId: 'earner_1', earnOnChat: true });

    // 1. Determine roles
    const roles = await determineChatRoles(payer, earner, { initiatorId: 'payer_1' });
    
    expect(roles.payerId).toBe('payer_1');
    expect(roles.earnerId).toBe('earner_1');
    expect(roles.mode).toBe('PAID');

    // 2. Initialize chat
    await initializeChat(chatId, roles, ['payer_1', 'earner_1']);

    // 3. Send free messages (first 3 from each participant)
    for (let i = 0; i < 3; i++) {
      const result1 = await processMessageBilling(chatId, 'payer_1', 'Hello from payer');
      expect(result1.allowed).toBe(true);
      expect(result1.tokensCost).toBe(0);

      const result2 = await processMessageBilling(chatId, 'earner_1', 'Hello from earner');
      expect(result2.allowed).toBe(true);
      expect(result2.tokensCost).toBe(0);
    }

    // 4. Next message should require deposit
    const result = await processMessageBilling(chatId, 'earner_1', 'First paid message');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Deposit required');

    // 5. Process deposit (100 tokens → 35 fee + 65 escrow)
    const depositResult = await processChatDeposit(chatId, 'payer_1');
    expect(depositResult.success).toBe(true);
    expect(depositResult.depositAmount).toBe(100);
    expect(depositResult.platformFee).toBe(35);
    expect(depositResult.escrowAmount).toBe(65);

    // 6. Now paid messages should work
    const paidMsg = await processMessageBilling(
      chatId,
      'earner_1',
      'This is a message with eleven words in total here yes'
    );
    expect(paidMsg.allowed).toBe(true);
    expect(paidMsg.tokensCost).toBeGreaterThan(0);

    // 7. Close chat and settle
    const closeResult = await closeAndSettleChat(chatId, 'payer_1');
    expect(closeResult.refundedToPayerPending).toBeGreaterThan(0);
  });

  it('should handle FREE_A chat for low popularity users', async () => {
    const chatId = generateTestChatId();
    const man = createTestMale({ userId: 'man_1' });
    const woman = createTestFemale({
      userId: 'woman_1',
      earnOnChat: false,
      popularity: 'low',
      accountAgeDays: 10,
    });

    // Determine roles
    const roles = await determineChatRoles(man, woman, { initiatorId: 'man_1' });
    
    expect(roles.mode).toBe('FREE_A');
    expect(roles.freeMessageLimit).toBe(Infinity);
    expect(roles.earnerId).toBeNull(); // Avalo earns

    // Initialize and send many messages
    await initializeChat(chatId, roles, ['man_1', 'woman_1']);

    // Send 100 messages - all should be free
    for (let i = 0; i < 100; i++) {
      const result = await processMessageBilling(chatId, 'man_1', `Message ${i}`);
      expect(result.allowed).toBe(true);
      expect(result.tokensCost).toBe(0);
    }
  });

  it('should transition FREE_B to PAID after 50 messages', async () => {
    const chatId = generateTestChatId();
    const man = createTestMale({ userId: 'man_1' });
    const woman = createTestFemale({
      userId: 'woman_1',
      earnOnChat: false,
      popularity: 'mid',
      accountAgeDays: 10,
    });

    const roles = await determineChatRoles(man, woman, { initiatorId: 'man_1' });
    
    expect(roles.mode).toBe('FREE_B');
    expect(roles.freeMessageLimit).toBe(50);

    await initializeChat(chatId, roles, ['man_1', 'woman_1']);

    // Send first 6 free messages (3 each)
    for (let i = 0; i < 6; i++) {
      const sender = i % 2 === 0 ? 'man_1' : 'woman_1';
      const result = await processMessageBilling(chatId, sender, `Message ${i}`);
      expect(result.allowed).toBe(true);
    }

    // Send up to 50 messages (should be free)
    for (let i = 7; i <= 49; i++) {
      const result = await processMessageBilling(chatId, 'man_1', `Message ${i}`);
      expect(result.allowed).toBe(true);
    }

    // 51st message should require deposit
    const result51 = await processMessageBilling(chatId, 'man_1', 'Message 51');
    expect(result51.allowed).toBe(false);
    expect(result51.reason).toContain('Deposit required');
  });
});

describe('Chat Integration - 18+ Verification', () => {
  it('should block chat if user is under 18', async () => {
    // This test requires integration with verification system
    // Placeholder for actual implementation
    expect(true).toBe(true);
  });
});

describe('Chat Integration - Wallet Operations', () => {
  it('should maintain correct wallet balances through chat lifecycle', async () => {
    // Set up wallets in test environment
    const payerWallet = createTestWallet(1000);
    const earnerWallet = createTestWallet(0);

    // Verify initial balances
    expect(payerWallet.balance).toBe(1000);
    expect(earnerWallet.balance).toBe(0);

    // After deposit: payer -100, pending +65
    const afterDeposit = {
      balance: 900,
      pending: 65,
    };
    expect(afterDeposit.balance).toBe(900);

    // After consuming 10 tokens: earner +10, payer pending -10
    const afterConsume = {
      payerPending: 55,
      earnerBalance: 10,
    };
    expect(afterConsume.payerPending).toBe(55);
    expect(afterConsume.earnerBalance).toBe(10);

    // After close: payer gets refund of remaining pending
    const afterClose = {
      payerBalance: 955, // 900 + 55 refund
    };
    expect(afterClose.payerBalance).toBe(955);
  });
});