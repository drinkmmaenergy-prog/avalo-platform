/**
 * PHASE 31C - PromoCard Component (Web)
 * UI-only discount display component for web
 * Shows active discount offers with countdown timer
 */

'use client';

import React, { useState, useEffect } from 'react';
import { DiscountOffer, ActiveDiscount } from '../../shared/types/discounts';
import { 
  getActiveDiscount, 
  formatTimeRemaining,
  clearActiveDiscount 
} from '../../shared/utils/discountEngine';

interface PromoCardProps {
  offer: DiscountOffer | null;
  onActivate: () => void;
  onDismiss?: () => void;
  locale?: 'en' | 'pl';
  className?: string;
}

export const PromoCard: React.FC<PromoCardProps> = ({
  offer,
  onActivate,
  onDismiss,
  locale = 'en',
  className = '',
}) => {
  const [activeDiscount, setActiveDiscount] = useState<ActiveDiscount | null>(null);

  // Translations
  const t = {
    en: {
      limitedTime: 'Limited Time Offer',
      expiresIn: 'Expires in',
      save: 'Save',
      oldPrice: 'Original Price',
      newPrice: 'Your Price',
      activate: 'Activate Offer',
      noThanks: 'No Thanks',
    },
    pl: {
      limitedTime: 'Oferta Czasowa',
      expiresIn: 'Wygasa za',
      save: 'Oszczędź',
      oldPrice: 'Cena Oryginalna',
      newPrice: 'Twoja Cena',
      activate: 'Aktywuj Ofertę',
      noThanks: 'Nie, Dziękuję',
    },
  };

  const translations = t[locale];

  // Update active discount info every second
  useEffect(() => {
    if (!offer) return;

    const updateDiscount = () => {
      const active = getActiveDiscount(offer);
      setActiveDiscount(active);

      if (active?.isExpired) {
        clearActiveDiscount();
      }
    };

    updateDiscount();
    const interval = setInterval(updateDiscount, 1000);

    return () => clearInterval(interval);
  }, [offer]);

  if (!offer || !activeDiscount || activeDiscount.isExpired) return null;

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-black border-2 border-gold shadow-2xl ${className}`}>
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-turquoise/10" />
      
      {/* Content */}
      <div className="relative p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-turquoise">
            ⚡ {translations.limitedTime}
          </span>
          <span className="px-3 py-1 text-sm font-black bg-gold text-black rounded-full">
            {offer.discountPercent}% OFF
          </span>
        </div>

        {/* Title */}
        <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">
          {offer.displayText.title}
        </h3>
        <p className="text-gray-400 mb-6">
          {offer.displayText.description}
        </p>

        {/* Countdown Timer */}
        <div className="bg-gold/10 border border-gold rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gold text-center mb-2">
            {translations.expiresIn}
          </p>
          <p className="text-3xl sm:text-4xl font-black text-gold text-center font-mono">
            {formatTimeRemaining(activeDiscount.timeRemaining)}
          </p>
        </div>

        {/* Pricing */}
        <div className="bg-white/5 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-gray-400">{translations.oldPrice}</span>
            <span className="text-lg text-gray-500 line-through">
              ${offer.originalPrice.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">{translations.newPrice}</span>
            <span className="text-3xl font-black text-gold">
              ${offer.discountedPrice.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Savings Badge */}
        <div className="bg-turquoise/15 rounded-xl p-3 mb-6 text-center">
          <span className="text-lg font-bold text-turquoise">
            💰 {offer.displayText.savings}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onActivate}
            className="flex-1 bg-gold hover:bg-gold/90 text-black font-black text-lg py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-gold/50"
          >
            {translations.activate}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="sm:w-auto px-6 py-4 text-gray-400 hover:text-white font-semibold transition-colors duration-200"
            >
              {translations.noThanks}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromoCard;