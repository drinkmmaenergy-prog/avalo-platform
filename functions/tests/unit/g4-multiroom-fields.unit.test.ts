/**
 * G4 — Multi-room reservation field normalization tests
 * Run WITHOUT emulator — verifies field names and isolation invariants in source.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '../../src/rooms/canonicalMultiRoomV2.ts');
const src = fs.readFileSync(SRC, 'utf8');

describe('G4-T01: ParticipantDocument uses canonical G4 field names', () => {
  it('interface declares entryReservationTokens', () => {
    expect(src).toContain('entryReservationTokens');
  });
  it('interface declares remainingRoomBudgetTokens', () => {
    expect(src).toContain('remainingRoomBudgetTokens');
  });
  it('interface declares roomSpentTokens', () => {
    expect(src).toContain('roomSpentTokens');
  });
  it('legacy field reservedTokens is absent', () => {
    expect(src).not.toContain('reservedTokens');
  });
});

describe('G4-T02: joinRoom initializes all three G4 fields', () => {
  it('sets entryReservationTokens = entryTokens at join', () => {
    expect(src).toContain('entryReservationTokens:    entryTokens');
  });
  it('sets remainingRoomBudgetTokens = entryTokens at join', () => {
    expect(src).toContain('remainingRoomBudgetTokens: entryTokens');
  });
  it('sets roomSpentTokens = 0 at join', () => {
    expect(src).toContain('roomSpentTokens:           0');
  });
});

describe('G4-T03: Refund uses remainingRoomBudgetTokens, not entryReservationTokens', () => {
  it('tokensToReturn references remainingRoomBudgetTokens', () => {
    expect(src).toContain('p.remainingRoomBudgetTokens');
  });
  it('tokensToReturn is zero when earnedByCreator is true', () => {
    // Pattern: ternary that returns 0 for earned, remaining for not-earned
    expect(src).toMatch(/earnedByCreator.*?0.*?remainingRoomBudgetTokens|remainingRoomBudgetTokens.*?earnedByCreator/);
  });
});

describe('G4-T04: Creator earning uses entryReservationTokens', () => {
  it('tokensEarned uses entryReservationTokens for escrow settlement', () => {
    expect(src).toContain('p.entryReservationTokens');
  });
});

describe('G4-T05: wallets/{uid} is the only wallet collection touched', () => {
  it('no forbidden Firestore collection paths', () => {
    // Forbidden collections from the canonical economic rules
    expect(src).not.toContain("user_wallets");
    expect(src).not.toContain("wallet/main");
    expect(src).not.toContain("wallet/current");
    // Forbidden wallet field names on user docs
    expect(src).not.toContain(".tokenBalance");
    expect(src).not.toContain("users/{uid}.wallet");
  });
  it('canonical walletRef() helper is used for wallet access', () => {
    expect(src).toContain("walletRef(");
  });
});

describe('G4-T06: Creator cannot join own room (generic creator message isolation)', () => {
  it('creator join guard is present', () => {
    expect(src).toContain("Creator cannot join their own room as participant");
  });
});
