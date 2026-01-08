/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Notification Templates for Soft Restrictions
 * 
 * Provides neutral, non-revealing messages for users
 * under collusion/spam investigation
 * 
 * NON-NEGOTIABLE:
 * - Never reveal other users in cluster
 * - Never reveal specific detection methods
 * - Always provide appeal option
 * - Messages are generic and neutral
 */

import { CollusionEnforcementLevel } from './pack104-types';

// ============================================================================
// NOTIFICATION MESSAGE TEMPLATES
// ============================================================================

/**
 * Get notification message for enforcement level
 */
export function getEnforcementNotificationMessage(
  level: CollusionEnforcementLevel
): {
  title: string;
  message: string;
  canAppeal: boolean;
  supportMessage: string;
} {
  switch (level) {
    case 'VISIBILITY_REDUCED':
      return {
        title: 'Account Review',
        message: 'Your account visibility has been temporarily adjusted while we review recent activity patterns. You can continue using Avalo normally.',
        canAppeal: true,
        supportMessage: 'If you believe this is a mistake, you can submit an appeal through the Help Center.',
      };
    
    case 'MONETIZATION_THROTTLED':
      return {
        title: 'Temporary Feature Limitation',
        message: 'Your ability to use some features has been temporarily limited while we review activity linked to your account. This is a precautionary measure and will be resolved after review.',
        canAppeal: true,
        supportMessage: 'You can submit an appeal if you believe this action was taken in error. Our team will review your case promptly.',
      };
    
    case 'MANUAL_REVIEW_REQUIRED':
      return {
        title: 'Account Under Review',
        message: 'Your account is currently under review due to unusual activity patterns detected by our security systems. Some features are temporarily restricted until the review is complete.',
        canAppeal: true,
        supportMessage: 'Our safety team will review your account as soon as possible. You can provide additional context through an appeal to help expedite the review.',
      };
    
    case 'NONE':
    default:
      return {
        title: 'Account Status',
        message: 'Your account is in good standing.',
        canAppeal: false,
        supportMessage: '',
      };
  }
}

/**
 * Get localized notification message
 */
export function getLocalizedEnforcementMessage(
  level: CollusionEnforcementLevel,
  locale: string = 'en'
): {
  title: string;
  message: string;
  canAppeal: boolean;
  supportMessage: string;
} {
  // English messages
  if (locale === 'en') {
    return getEnforcementNotificationMessage(level);
  }
  
  // Polish messages
  if (locale === 'pl') {
    switch (level) {
      case 'VISIBILITY_REDUCED':
        return {
          title: 'Przegląd Konta',
          message: 'Widoczność Twojego konta została tymczasowo dostosowana podczas sprawdzania ostatnich wzorców aktywności. Możesz normalnie korzystać z Avalo.',
          canAppeal: true,
          supportMessage: 'Jeśli uważasz, że to pomyłka, możesz złożyć odwołanie przez Centrum Pomocy.',
        };
      
      case 'MONETIZATION_THROTTLED':
        return {
          title: 'Tymczasowe Ograniczenie Funkcji',
          message: 'Twoja możliwość korzystania z niektórych funkcji została tymczasowo ograniczona podczas sprawdzania aktywności związanej z Twoim kontem. To środek ostrożności, który zostanie rozwiązany po przeglądzie.',
          canAppeal: true,
          supportMessage: 'Możesz złożyć odwołanie, jeśli uważasz, że to działanie zostało podjęte przez pomyłkę. Nasz zespół szybko przeanalizuje Twoją sprawę.',
        };
      
      case 'MANUAL_REVIEW_REQUIRED':
        return {
          title: 'Konto w Trakcie Przeglądu',
          message: 'Twoje konto jest obecnie sprawdzane z powodu nietypowych wzorców aktywności wykrytych przez nasze systemy bezpieczeństwa. Niektóre funkcje są tymczasowo ograniczone do czasu zakończenia przeglądu.',
          canAppeal: true,
          supportMessage: 'Nasz zespół bezpieczeństwa przejrzy Twoje konto tak szybko, jak to możliwe. Możesz dostarczyć dodatkowy kontekst przez odwołanie, aby przyspieszyć przegląd.',
        };
      
      case 'NONE':
      default:
        return {
          title: 'Status Konta',
          message: 'Twoje konto jest w dobrym stanie.',
          canAppeal: false,
          supportMessage: '',
        };
    }
  }
  
  // Default to English
  return getEnforcementNotificationMessage(level);
}

/**
 * Get enforcement reason code for display
 */
export function getEnforcementReasonDisplay(
  reasonCode: string
): {
  code: string;
  displayText: string;
  category: 'COLLUSION_RISK' | 'SPAM_RISK' | 'GENERAL';
} {
  // Map internal reason codes to user-friendly display text
  const reasonMap: Record<string, { displayText: string; category: any }> = {
    'COLLUSION_RISK': {
      displayText: 'Unusual activity pattern detected',
      category: 'COLLUSION_RISK',
    },
    'COMMERCIAL_SPAM_RISK': {
      displayText: 'Automated behavior detected',
      category: 'SPAM_RISK',
    },
    'COLLUSION_RISK_LOW': {
      displayText: 'Activity under review',
      category: 'COLLUSION_RISK',
    },
    'COLLUSION_RISK_MEDIUM': {
      displayText: 'Suspicious activity detected',
      category: 'COLLUSION_RISK',
    },
    'COLLUSION_RISK_HIGH': {
      displayText: 'High-risk activity detected',
      category: 'COLLUSION_RISK',
    },
  };
  
  const mapped = reasonMap[reasonCode];
  
  if (mapped) {
    return {
      code: reasonCode,
      displayText: mapped.displayText,
      category: mapped.category,
    };
  }
  
  return {
    code: reasonCode,
    displayText: 'Account under review',
    category: 'GENERAL',
  };
}

/**
 * Format enforcement notification for push notification
 */
export function formatPushNotification(
  level: CollusionEnforcementLevel,
  locale: string = 'en'
): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  const message = getLocalizedEnforcementMessage(level, locale);
  
  return {
    title: message.title,
    body: message.message,
    data: {
      type: 'ENFORCEMENT_UPDATE',
      enforcementLevel: level,
      canAppeal: message.canAppeal.toString(),
      screen: 'EnforcementInfo',
    },
  };
}

/**
 * Format enforcement notification for in-app display
 */
export function formatInAppNotification(
  level: CollusionEnforcementLevel,
  locale: string = 'en'
): {
  id: string;
  type: 'WARNING' | 'INFO';
  title: string;
  message: string;
  actions: Array<{ label: string; action: string }>;
  dismissible: boolean;
} {
  const message = getLocalizedEnforcementMessage(level, locale);
  
  const actions: Array<{ label: string; action: string }> = [
    {
      label: locale === 'pl' ? 'Dowiedz się więcej' : 'Learn More',
      action: 'OPEN_ENFORCEMENT_INFO',
    },
  ];
  
  if (message.canAppeal) {
    actions.push({
      label: locale === 'pl' ? 'Złóż odwołanie' : 'Submit Appeal',
      action: 'OPEN_APPEAL_FORM',
    });
  }
  
  return {
    id: `enforcement_${level}_${Date.now()}`,
    type: level === 'MANUAL_REVIEW_REQUIRED' ? 'WARNING' : 'INFO',
    title: message.title,
    message: message.message,
    actions,
    dismissible: level === 'VISIBILITY_REDUCED',  // Only soft restrictions are dismissible
  };
}

/**
 * Get help center article IDs for different enforcement types
 */
export function getHelpArticleForEnforcement(
  level: CollusionEnforcementLevel
): {
  articleId: string;
  articleTitle: string;
  url: string;
} {
  switch (level) {
    case 'VISIBILITY_REDUCED':
      return {
        articleId: 'enforcement-visibility',
        articleTitle: 'Why was my account visibility reduced?',
        url: 'https://help.avalo.app/enforcement/visibility-reduced',
      };
    
    case 'MONETIZATION_THROTTLED':
      return {
        articleId: 'enforcement-throttled',
        articleTitle: 'Why are my features limited?',
        url: 'https://help.avalo.app/enforcement/features-limited',
      };
    
    case 'MANUAL_REVIEW_REQUIRED':
      return {
        articleId: 'enforcement-review',
        articleTitle: 'Account under review',
        url: 'https://help.avalo.app/enforcement/under-review',
      };
    
    default:
      return {
        articleId: 'enforcement-general',
        articleTitle: 'Account enforcement',
        url: 'https://help.avalo.app/enforcement',
      };
  }
}