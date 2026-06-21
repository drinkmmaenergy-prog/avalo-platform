import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";


const WORDS_STANDARD = 11
const WORDS_ROYAL = 7

function simulateChat({
  depositTokens,
  wordsSent,
  isRoyal
}) {

  const wordsPerToken = isRoyal ? WORDS_ROYAL : WORDS_STANDARD
  const split = SPLITS.CHAT

  // 1 deposit split
  const platformFee = depositTokens * split.platform
  const escrowTokens = depositTokens * split.earner

  // 2 billing from escrow
  const tokensConsumed = Math.ceil(wordsSent / wordsPerToken)

  const escrowRemaining = escrowTokens - tokensConsumed

  const refund = escrowRemaining > 0 ? escrowRemaining : 0

  const earnerEarned = tokensConsumed

  return {
    depositTokens,
    platformFee,
    escrowInitial: escrowTokens,
    tokensConsumed,
    earnerEarned,
    refund
  }
}

const result = simulateChat({
  depositTokens: 100,
  wordsSent: 120,
  isRoyal: false
})

console.log("AVALO CHAT ECONOMY TEST")
console.log(result)


















