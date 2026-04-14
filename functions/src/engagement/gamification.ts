import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

export interface Mission{
 id:string
 type:string
 rewardTokens:number
 completed:boolean
}

export interface UserGamification{
 userId:string
 missions:Mission[]
 xp:number
}


















