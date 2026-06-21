import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

function calculateTokens(words:number, wordsPerToken:number){
return Math.ceil(words/wordsPerToken)
}

console.log("STANDARD MODEL (11 words/token)")

console.log("11 words ->",calculateTokens(11,11))
console.log("22 words ->",calculateTokens(22,11))
console.log("5 words ->",calculateTokens(5,11))

console.log("ROYAL MODEL (7 words/token)")

console.log("7 words ->",calculateTokens(7,7))
console.log("14 words ->",calculateTokens(14,7))
console.log("5 words ->",calculateTokens(5,7))


















