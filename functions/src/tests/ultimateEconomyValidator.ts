import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

type ChatMode = "STANDARD" | "ROYAL"

type SimulationInput = {
  depositTokens: number
  wordsSent: number
  mode: ChatMode
  chatMinutes: number
}

type SimulationResult = {
  mode: ChatMode
  depositTokens: number
  wordsSent: number
  wordsPerToken: number
  platformFee: number
  escrowInitial: number
  tokensConsumed: number
  earnerEarnedTokens: number
  refundTokens: number
  escrowUtilizationPct: number
  earnerUsd: number
  platformUsd: number
  effectiveEarnerUsdPerHour: number
}

const TOKEN_PAYOUT_USD = 0.04
const PLATFORM_FEE_PCT = 0.35

const WORDS_STANDARD = 11
const WORDS_ROYAL = 7

function simulateChat(input: SimulationInput): SimulationResult {

  const wordsPerToken = input.mode === "ROYAL"
    ? WORDS_ROYAL
    : WORDS_STANDARD

  const platformFee =
    Math.floor(input.depositTokens * PLATFORM_FEE_PCT)

  const escrowInitial =
    input.depositTokens - platformFee

  const rawTokens =
    Math.ceil(input.wordsSent / wordsPerToken)

  const tokensConsumed =
    Math.min(rawTokens, escrowInitial)

  const refundTokens =
    escrowInitial - tokensConsumed

  const earnerUsd =
    tokensConsumed * TOKEN_PAYOUT_USD

  const platformUsd =
    platformFee * TOKEN_PAYOUT_USD

  const hours =
    input.chatMinutes / 60

  const effectiveUsdPerHour =
    hours > 0
      ? earnerUsd / hours
      : 0

  const utilization =
    escrowInitial === 0
      ? 0
      : tokensConsumed / escrowInitial

  return {
    mode: input.mode,
    depositTokens: input.depositTokens,
    wordsSent: input.wordsSent,
    wordsPerToken,
    platformFee,
    escrowInitial,
    tokensConsumed,
    earnerEarnedTokens: tokensConsumed,
    refundTokens,
    escrowUtilizationPct: Number((utilization*100).toFixed(2)),
    earnerUsd: Number(earnerUsd.toFixed(2)),
    platformUsd: Number(platformUsd.toFixed(2)),
    effectiveEarnerUsdPerHour: Number(effectiveUsdPerHour.toFixed(2))
  }
}

function run() {

  const deposits = [100,150,200,300,500]
  const minutes = [5,10,15,20,30]
  const words = [20,40,80,120,180,260,400,700]

  const results:SimulationResult[] = []

  for (const deposit of deposits){

    for (const m of minutes){

      for (const w of words){

        results.push(
          simulateChat({
            depositTokens:deposit,
            wordsSent:w,
            chatMinutes:m,
            mode:"STANDARD"
          })
        )

        results.push(
          simulateChat({
            depositTokens:deposit,
            wordsSent:w,
            chatMinutes:m,
            mode:"ROYAL"
          })
        )

      }

    }

  }

  console.log("")
  console.log("AVALO ECONOMY VALIDATOR")
  console.log("Scenarios:",results.length)

  const avgEarner =
    results.reduce((a,b)=>a+b.earnerUsd,0)/results.length

  const avgPlatform =
    results.reduce((a,b)=>a+b.platformUsd,0)/results.length

  console.log("")
  console.log("AVG EARNER USD/CHAT:",avgEarner.toFixed(2))
  console.log("AVG PLATFORM USD/CHAT:",avgPlatform.toFixed(2))

}

run()



















