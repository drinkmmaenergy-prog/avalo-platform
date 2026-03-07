import {MONETIZATION_SPLITS,MonetizationSurface} from "../config/monetizationSplits"

export interface MonetizationResult{
 creatorAmount:number
 avaloAmount:number
}

export function splitTokens(surface:MonetizationSurface,tokens:number):MonetizationResult{

 const split=MONETIZATION_SPLITS[surface]

 const creatorAmount=Math.floor(tokens*split.creator)
 const avaloAmount=tokens-creatorAmount

 return{creatorAmount,avaloAmount}
}
