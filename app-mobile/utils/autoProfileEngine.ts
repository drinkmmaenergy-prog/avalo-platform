/**
 * Auto Profile Engine
 * Pure deterministic profile generation based on quiz answers and user data
 * NO network calls, NO AI APIs - all local template-based generation
 */

import { QuizAnswers, AutoProfileSuggestion } from '../services/onboardingProfileService';

export type AutoProfileInput = {
  gender?: 'male' | 'female' | 'other';
  age?: number;
  city?: string;
  country?: string;
  membershipTier?: 'FREE' | 'VIP' | 'ROYAL';
  quiz?: QuizAnswers;
  locale?: 'en' | 'pl';  // Language for generation
};

/**
 * Generate profile suggestion based on input
 */
export function generateProfileSuggestion(input: AutoProfileInput): AutoProfileSuggestion {
  const locale = input.locale || 'en';
  
  return {
    tagline: generateTagline(input, locale),
    bio: generateBio(input, locale),
    interests: generateInterests(input, locale),
    lookingFor: generateLookingFor(input, locale),
  };
}

/**
 * Generate tagline (one-liner)
 */
function generateTagline(input: AutoProfileInput, locale: 'en' | 'pl'): string {
  const { quiz, age, city } = input;
  
  // Build tagline from lifestyle and goals
  const lifestyle = quiz?.lifestyle || [];
  const goals = quiz?.goals || [];
  
  if (locale === 'pl') {
    // Polish taglines
    if (lifestyle.includes('Ambitious') || lifestyle.includes('Ambitny/a')) {
      if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
        return 'Ambitny/a, ciekawy/a świata i gotowy/a na prawdziwe relacje';
      }
      return 'Ambitny/a i skupiony/a na celach, ale zawsze znajduję czas na właściwe osoby';
    }
    
    if (lifestyle.includes('Adventurous') || lifestyle.includes('Przygodowy/a')) {
      return 'Przygoda to moje drugie imię — szukam kogoś, kto podziela moją pasję';
    }
    
    if (lifestyle.includes('Chill') || lifestyle.includes('Na luzie')) {
      return 'Spokojne życie, autentyczne rozmowy i prawdziwe połączenia';
    }
    
    // Default Polish
    if (age && city) {
      return `${age} lat z ${city} — tutaj dla czegoś realnego`;
    }
    return 'Tutaj dla autentycznych relacji i znaczących spotkań';
  } else {
    // English taglines
    if (lifestyle.includes('Ambitious') || lifestyle.includes('Ambitny/a')) {
      if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
        return 'Driven, curious and ready to meet someone real';
      }
      return 'Ambitious and focused, but always make time for the right people';
    }
    
    if (lifestyle.includes('Adventurous') || lifestyle.includes('Przygodowy/a')) {
      return 'Adventure is my middle name — looking for someone who shares the passion';
    }
    
    if (lifestyle.includes('Chill') || lifestyle.includes('Na luzie')) {
      return 'Easy-going life, authentic conversations and real connections';
    }
    
    // Default English
    if (age && city) {
      return `${age} from ${city} — here for something real`;
    }
    return 'Here for authentic relationships and meaningful connections';
  }
}

/**
 * Generate bio (3-6 sentences)
 */
function generateBio(input: AutoProfileInput, locale: 'en' | 'pl'): string {
  const { quiz, age, city, membershipTier } = input;
  const parts: string[] = [];
  
  if (locale === 'pl') {
    // Polish bio
    
    // Opening based on goals
    const goals = quiz?.goals || [];
    if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
      parts.push('Jestem tutaj dla czegoś realnego — nie dla wiecznego pisania bez spotkania.');
    } else if (goals.includes('Something casual') || goals.includes('Coś luźnego')) {
      parts.push('Szukam luźnych, autentycznych połączeń bez presji.');
    } else if (goals.includes('New friends') || goals.includes('Nowi znajomi')) {
      parts.push('Zawsze otwarty/a na poznawanie ciekawych ludzi i budowanie znaczących przyjaźni.');
    } else {
      parts.push('Ciekaw/a ciebie i gotowy/a na nowe doświadczenia.');
    }
    
    // Lifestyle
    const lifestyle = quiz?.lifestyle || [];
    if (lifestyle.length > 0) {
      const traits = lifestyle.slice(0, 2).join(', ').toLowerCase();
      parts.push(`Opisuję siebie jako osobę ${traits}.`);
    }
    
    // Values
    const values = quiz?.values || [];
    if (values.length > 0) {
      const valueList = values.slice(0, 3).join(', ');
      parts.push(`Dla mnie ważne są: ${valueList}.`);
    }
    
    // Weekend
    if (quiz?.weekend) {
      parts.push(`Mój idealny weekend to: ${quiz.weekend}.`);
    } else if (lifestyle.includes('Adventurous') || lifestyle.includes('Przygodowy/a')) {
      parts.push('Idealny weekend? Odkrywanie nowych miejsc i tworzenie wspomnień.');
    }
    
    // Location if available
    if (city) {
      parts.push(`Mieszkam w ${city}.`);
    }
    
    // Closing
    if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
      parts.push('Jeśli szukasz kogoś autentycznego, kto wie czego chce — napisz.');
    } else {
      parts.push('Jeśli brzmi to interesująco — daj znać!');
    }
    
  } else {
    // English bio
    
    // Opening based on goals
    const goals = quiz?.goals || [];
    if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
      parts.push("I'm here for something real — not endless chatting with no meeting.");
    } else if (goals.includes('Something casual') || goals.includes('Coś luźnego')) {
      parts.push('Looking for genuine, easy-going connections without pressure.');
    } else if (goals.includes('New friends') || goals.includes('Nowi znajomi')) {
      parts.push('Always open to meeting interesting people and building meaningful friendships.');
    } else {
      parts.push('Curious about you and ready for new experiences.');
    }
    
    // Lifestyle
    const lifestyle = quiz?.lifestyle || [];
    if (lifestyle.length > 0) {
      const traits = lifestyle.slice(0, 2).join(', ').toLowerCase();
      parts.push(`I'd describe myself as ${traits}.`);
    }
    
    // Values
    const values = quiz?.values || [];
    if (values.length > 0) {
      const valueList = values.slice(0, 3).join(', ');
      parts.push(`What matters most to me: ${valueList}.`);
    }
    
    // Weekend
    if (quiz?.weekend) {
      parts.push(`My ideal weekend is: ${quiz.weekend}.`);
    } else if (lifestyle.includes('Adventurous') || lifestyle.includes('Przygodowy/a')) {
      parts.push('Perfect weekend? Exploring new places and making memories.');
    }
    
    // Location if available
    if (city) {
      parts.push(`I live in ${city}.`);
    }
    
    // Closing
    if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
      parts.push("If you're looking for someone authentic who knows what they want — let's talk.");
    } else {
      parts.push('If this sounds interesting — reach out!');
    }
  }
  
  // Return first 6 parts max
  return parts.slice(0, 6).join(' ');
}

/**
 * Generate interests/tags
 */
function generateInterests(input: AutoProfileInput, locale: 'en' | 'pl'): string[] {
  const interests: string[] = [];
  const { quiz } = input;
  
  // Map from lifestyle and values
  const lifestyle = quiz?.lifestyle || [];
  const values = quiz?.values || [];
  const goals = quiz?.goals || [];
  
  if (locale === 'pl') {
    // Polish interests
    if (lifestyle.includes('Ambitious') || lifestyle.includes('Ambitny/a')) {
      interests.push('Kariera', 'Rozwój osobisty');
    }
    if (lifestyle.includes('Adventurous') || lifestyle.includes('Przygodowy/a')) {
      interests.push('Podróże', 'Przygoda');
    }
    if (lifestyle.includes('Chill') || lifestyle.includes('Na luzie')) {
      interests.push('Relaks', 'Kultura');
    }
    if (lifestyle.includes('Family-oriented') || lifestyle.includes('Rodzinny/a')) {
      interests.push('Rodzina', 'Stabilność');
    }
    if (lifestyle.includes('Nightlife lover') || lifestyle.includes('Kocham nocne życie')) {
      interests.push('Życie nocne', 'Imprezy');
    }
    
    // From values
    if (values.includes('Career')) interests.push('Kariera');
    if (values.includes('Health')) interests.push('Zdrowie', 'Fitness');
    if (values.includes('Travel')) interests.push('Podróże');
    if (values.includes('Luxury')) interests.push('Luksus', 'Styl');
    
    // Defaults if empty
    if (interests.length === 0) {
      interests.push('Muzyka', 'Kultura', 'Spotkania', 'Rozmowy');
    }
  } else {
    // English interests
    if (lifestyle.includes('Ambitious') || lifestyle.includes('Ambitny/a')) {
      interests.push('Career', 'Personal Growth');
    }
    if (lifestyle.includes('Adventurous') || lifestyle.includes('Przygodowy/a')) {
      interests.push('Travel', 'Adventure');
    }
    if (lifestyle.includes('Chill') || lifestyle.includes('Na luzie')) {
      interests.push('Relaxation', 'Culture');
    }
    if (lifestyle.includes('Family-oriented') || lifestyle.includes('Rodzinny/a')) {
      interests.push('Family', 'Stability');
    }
    if (lifestyle.includes('Nightlife lover') || lifestyle.includes('Kocham nocne życie')) {
      interests.push('Nightlife', 'Parties');
    }
    
    // From values
    if (values.includes('Career')) interests.push('Career');
    if (values.includes('Health')) interests.push('Health', 'Fitness');
    if (values.includes('Travel')) interests.push('Travel');
    if (values.includes('Luxury')) interests.push('Luxury', 'Style');
    
    // Defaults if empty
    if (interests.length === 0) {
      interests.push('Music', 'Culture', 'Meeting people', 'Deep talks');
    }
  }
  
  // Deduplicate and limit to 8
  return Array.from(new Set(interests)).slice(0, 8);
}

/**
 * Generate "looking for" statement
 */
function generateLookingFor(input: AutoProfileInput, locale: 'en' | 'pl'): string {
  const { quiz } = input;
  const goals = quiz?.goals || [];
  const peopleType = quiz?.peopleType || [];
  
  if (locale === 'pl') {
    // Polish
    let base = '';
    
    if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
      base = 'Szukam kogoś autentycznego dla poważnej relacji';
    } else if (goals.includes('Something casual') || goals.includes('Coś luźnego')) {
      base = 'Kogoś luźnego i spontanicznego na dobre chwile';
    } else if (goals.includes('New friends') || goals.includes('Nowi znajomi')) {
      base = 'Nowych przyjaciół i interesujących rozmów';
    } else if (goals.includes('Networking')) {
      base = 'Profesjonalnych kontaktów i networking';
    } else {
      base = 'Kogoś interesującego do poznania';
    }
    
    // Add people type
    if (peopleType.length > 0) {
      const types = peopleType[0].toLowerCase();
      base += ` — preferuję osoby ${types}`;
    }
    
    return base + '.';
    
  } else {
    // English
    let base = '';
    
    if (goals.includes('Serious relationship') || goals.includes('Poważna relacja')) {
      base = 'Looking for someone authentic for a serious relationship';
    } else if (goals.includes('Something casual') || goals.includes('Coś luźnego')) {
      base = 'Someone easy-going and spontaneous for good times';
    } else if (goals.includes('New friends') || goals.includes('Nowi znajomi')) {
      base = 'New friends and interesting conversations';
    } else if (goals.includes('Networking')) {
      base = 'Professional contacts and networking';
    } else {
      base = 'Someone interesting to get to know';
    }
    
    // Add people type
    if (peopleType.length > 0) {
      const types = peopleType[0].toLowerCase();
      base += ` — I prefer ${types} people`;
    }
    
    return base + '.';
  }
}