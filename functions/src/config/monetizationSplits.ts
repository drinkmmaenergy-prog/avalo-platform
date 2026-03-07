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
 CHAT:{creator:MONETIZATION_SPLITS.CHAT.creator,avalo:MONETIZATION_SPLITS.CHAT.avalo},
 CALL:{creator:MONETIZATION_SPLITS.CHAT.creator,avalo:MONETIZATION_SPLITS.CHAT.avalo},
 VIDEO_CALL:{creator:MONETIZATION_SPLITS.CHAT.creator,avalo:MONETIZATION_SPLITS.CHAT.avalo},
 TIPS:{creator:MONETIZATION_SPLITS.CHAT.creator,avalo:MONETIZATION_SPLITS.CHAT.avalo},
 UNLOCK_MEDIA:{creator:MONETIZATION_SPLITS.CHAT.creator,avalo:MONETIZATION_SPLITS.CHAT.avalo},
 LIVE_GIFTS:{creator:MONETIZATION_SPLITS.CHAT.creator,avalo:MONETIZATION_SPLITS.CHAT.avalo},

 EVENT_TICKET:{creator:0.80,avalo:0.20},
 CALENDAR_MEETING:{creator:0.80,avalo:0.20},

 SUBSCRIPTION:{creator:0.70,avalo:0.30}
}

