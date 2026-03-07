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
