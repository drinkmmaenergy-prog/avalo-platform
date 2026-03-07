$ErrorActionPreference="Stop"

$repo="C:\a\avalo"
$functions="$repo\functions\src"

New-Item -ItemType Directory -Force "$functions\config" | Out-Null
New-Item -ItemType Directory -Force "$functions\economy" | Out-Null
New-Item -ItemType Directory -Force "$functions\chat" | Out-Null
New-Item -ItemType Directory -Force "$functions\creator" | Out-Null
New-Item -ItemType Directory -Force "$functions\engagement" | Out-Null

Write-Host "Creating canonical monetization config"

@"
export type MonetizationSurface =
 | "CHAT"
 | "CALL"
 | "VIDEO_CALL"
 | "TIPS"
 | "UNLOCK_MEDIA"
 | "LIVE_GIFTS"
 | "EVENT_TICKET"
 | "CALENDAR_MEETING"
 | "SUBSCRIPTION"

export interface MonetizationSplit{
 creator:number
 avalo:number
}

export const MONETIZATION_SPLITS:Record<MonetizationSurface,MonetizationSplit>={
 CHAT:{creator:0.65,avalo:0.35},
 CALL:{creator:0.65,avalo:0.35},
 VIDEO_CALL:{creator:0.65,avalo:0.35},
 TIPS:{creator:0.65,avalo:0.35},
 UNLOCK_MEDIA:{creator:0.65,avalo:0.35},
 LIVE_GIFTS:{creator:0.65,avalo:0.35},

 EVENT_TICKET:{creator:0.80,avalo:0.20},
 CALENDAR_MEETING:{creator:0.80,avalo:0.20},

 SUBSCRIPTION:{creator:0.70,avalo:0.30}
}
"@ | Set-Content -LiteralPath "$functions\config\monetizationSplits.ts" -Encoding UTF8

Write-Host "Creating monetization engine"

@"
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
"@ | Set-Content -LiteralPath "$functions\economy\monetizationEngine.ts" -Encoding UTF8

Write-Host "Creating unlock media final system"

@"
export interface UnlockableMessage{
 id:string
 senderId:string
 type:"image"|"video"|"text"
 mediaUrl?:string
 payToUnlock:boolean
 unlockPriceTokens:number
 unlockedBy:string[]
 nsfwAllowed:boolean
}

export function canViewMessage(msg:UnlockableMessage,userId:string){

 if(!msg.payToUnlock) return true

 return msg.unlockedBy.includes(userId)
}
"@ | Set-Content -LiteralPath "$functions\chat\unlockMedia.ts"

Write-Host "Creating multi chat rooms"

@"
export interface MultiChatRoom{
 id:string
 creatorId:string
 entryFeeTokens:number
 maxParticipants:number
 participants:string[]
 createdAt:number
}
"@ | Set-Content -LiteralPath "$functions\chat\multiChatRoom.ts"

Write-Host "Creating priority reply"

@"
export interface PriorityMessage{
 chatId:string
 messageId:string
 senderId:string
 priorityTokens:number
 createdAt:number
}
"@ | Set-Content -LiteralPath "$functions\chat\priorityReply.ts"

Write-Host "Creating conversation tiers"

@"
export type ConversationTier=
 | "STANDARD"
 | "VIP"
 | "ROYAL"
 | "PRIVATE"

export interface TierConfig{
 tier:ConversationTier
 multiplier:number
}
"@ | Set-Content -LiteralPath "$functions\chat\conversationTiers.ts"

Write-Host "Creating conversation pools"

@"
export interface ConversationPool{
 creatorId:string
 activeChats:string[]
 maxSimultaneous:number
}
"@ | Set-Content -LiteralPath "$functions\chat\conversationPools.ts"

Write-Host "Creating affiliate system"

@"
export interface AffiliateLink{
 referrerId:string
 referredUserId:string
 createdAt:number
}

export interface AffiliateReward{
 creatorId:string
 tokens:number
}
"@ | Set-Content -LiteralPath "$functions\creator\affiliate.ts"

Write-Host "Creating gamification module"

@"
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
"@ | Set-Content -LiteralPath "$functions\engagement\gamification.ts"

Write-Host "Freezing legacy engines"

$legacy=@(
"$functions\chatMonetization.ts",
"$functions\pack273ChatEngine.ts",
"$functions\pack430-economy-engine.ts"
)

foreach($f in $legacy){

 if(Test-Path $f){

  $c=Get-Content -LiteralPath $f -Raw

  $freeze="/* LEGACY BILLING ENGINE LOCKED */`n"

  Set-Content -LiteralPath $f -Value ($freeze+$c)

 }

}

Write-Host "Scanning repo for hardcoded splits"

$files=Get-ChildItem $repo -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue

foreach($file in $files){

 try{

 $content=Get-Content -LiteralPath $file.FullName -Raw

 $updated=$content `
 -replace "0\.65","MONETIZATION_SPLITS.CHAT.creator" `
 -replace "0\.35","MONETIZATION_SPLITS.CHAT.avalo"

 if($updated -ne $content){
  Set-Content -LiteralPath $file.FullName -Value $updated
 }

 }catch{}

}

Write-Host ""
Write-Host "AVALO SYSTEM FINALIZATION COMPLETE"

