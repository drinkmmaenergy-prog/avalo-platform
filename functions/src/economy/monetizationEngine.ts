type MonetizationSurface=string
import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";


export interface MonetizationResult{
 earnerAmount:number
 platformAmount:number
}

export function splitTokens(surface:MonetizationSurface,tokens:number):MonetizationResult{

 const split=SPLITS[surface]

 const earnerAmount=Math.floor(tokens*split.earner)
 const platformAmount=tokens-earnerAmount

 return{earnerAmount,platformAmount}
}




















