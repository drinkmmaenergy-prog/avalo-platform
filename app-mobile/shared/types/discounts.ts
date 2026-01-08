// AUTO-GENERATED STUB FOR MVP BUILD FIX

export interface DiscountOffer {
  id: string;
  code?: string;
  percentage?: number;
  validUntil?: Date;
  [key: string]: any;
}

export interface ActiveDiscount {
  offerId: string;
  appliedAt: Date;
  [key: string]: any;
}
