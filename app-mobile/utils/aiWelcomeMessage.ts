/**
 * AI Welcome Message Generator
 * Phase 32-3: Adaptive AI Welcome Messages
 * 
 * Rule-based deterministic generation of welcome messages
 * No network calls, no API keys required
 */

import { ProfileData } from '../lib/profileService';
import { QuizAnswers } from '../services/onboardingProfileService';

export interface WelcomeMessageBundle {
  short: string;
  medium: string;
  long: string;
}

interface MessageGenerationContext {
  selfGender: 'male' | 'female' | 'non-binary' | 'prefer-not-to-say';
  matchedName: string;
  matchedAge?: number;
  matchedGender?: 'male' | 'female' | 'non-binary' | 'prefer-not-to-say';
  matchedBio?: string;
  matchedInterests?: string[];
  matchedCity?: string;
  quizAnswers?: QuizAnswers;
  language: 'en' | 'pl';
}

/**
 * Generate three welcome message options based on user profiles and quiz data
 */
export function generateWelcomeMessages(
  selfProfile: Partial<ProfileData>,
  matchedProfile: Partial<ProfileData>,
  language: 'en' | 'pl' = 'en',
  quizAnswers?: QuizAnswers
): WelcomeMessageBundle {
  const context: MessageGenerationContext = {
    selfGender: selfProfile.gender || 'prefer-not-to-say',
    matchedName: matchedProfile.name || 'there',
    matchedAge: matchedProfile.age,
    matchedGender: matchedProfile.gender,
    matchedBio: matchedProfile.bio,
    matchedInterests: matchedProfile.interests,
    matchedCity: matchedProfile.city,
    quizAnswers,
    language,
  };

  return {
    short: generateShortMessage(context),
    medium: generateMediumMessage(context),
    long: generateLongMessage(context),
  };
}

/**
 * Generate a short, casual greeting (15-25 words)
 */
function generateShortMessage(ctx: MessageGenerationContext): string {
  const { matchedName, matchedInterests, language, selfGender } = ctx;

  // Find common interest if available
  const interest = matchedInterests?.[0];

  if (language === 'pl') {
    // Polish messages with gender-appropriate tone
    const greetings = [
      `Hej ${matchedName}! 👋 Twój profil przykuł moją uwagę`,
      `Cześć ${matchedName}! Miło Cię poznać`,
      `Witaj ${matchedName}! Fajnie, że się zgadzamy`,
    ];

    if (interest) {
      greetings.push(`Hej ${matchedName}! Widzę, że interesujesz się ${interest} – ja też!`);
    }

    return pickRandom(greetings);
  }

  // English messages with confident tone
  const greetings = [
    `Hey ${matchedName}! 👋 Your profile caught my attention`,
    `Hi ${matchedName}! Nice to match with you`,
    `Hello ${matchedName}! Great to connect`,
  ];

  if (interest) {
    greetings.push(`Hey ${matchedName}! I see you're into ${interest} – me too!`);
  }

  return pickRandom(greetings);
}

/**
 * Generate a medium-length, engaging message (25-45 words)
 */
function generateMediumMessage(ctx: MessageGenerationContext): string {
  const { matchedName, matchedInterests, matchedCity, language, selfGender, quizAnswers } = ctx;

  if (language === 'pl') {
    const messages: string[] = [];

    // Interest-based opening
    if (matchedInterests && matchedInterests.length > 0) {
      const interest = matchedInterests[0];
      messages.push(
        `Hej ${matchedName}! Zauważyłem/am ${interest} w Twoich zainteresowaniach i pomyślałem/am, że mamy podobne gusta. Co Cię w tym najbardziej fascynuje? 😊`
      );
    }

    // City-based opening
    if (matchedCity) {
      messages.push(
        `Cześć ${matchedName}! Widzę, że jesteś z ${matchedCity}. Jak tam życie? Mam nadzieję, że znajdziemy wspólny język 🌟`
      );
    }

    // Quiz-based opening (if looking for serious)
    if (quizAnswers?.goals?.includes('serious')) {
      messages.push(
        `Hej ${matchedName}! Szukam czegoś autentycznego i wydajesz się być interesującą osobą. Opowiedz mi coś o sobie?`
      );
    }

    // Generic elegant opening
    messages.push(
      `Witaj ${matchedName}! Twój profil wyróżnia się na tle innych – jest w nim coś, co przyciąga uwagę. Chętnie poznałbym/poznałabym Cię lepiej ✨`
    );

    return pickRandom(messages);
  }

  // English messages
  const messages: string[] = [];

  // Interest-based opening
  if (matchedInterests && matchedInterests.length > 0) {
    const interest = matchedInterests[0];
    messages.push(
      `Hey ${matchedName}! I noticed ${interest} in your interests and thought we might vibe. What's your favorite thing about it? 😊`
    );
  }

  // City-based opening
  if (matchedCity) {
    messages.push(
      `Hi ${matchedName}! I see you're from ${matchedCity}. How's life treating you there? Looking forward to getting to know you 🌟`
    );
  }

  // Quiz-based opening (if looking for serious)
  if (quizAnswers?.goals?.includes('serious')) {
    messages.push(
      `Hey ${matchedName}! I'm looking for something real and you seem like an interesting person. Tell me about yourself?`
    );
  }

  // Generic confident opening
  messages.push(
    `Hi ${matchedName}! Your profile stands out – there's something intriguing about it. I'd love to get to know you better ✨`
  );

  return pickRandom(messages);
}

/**
 * Generate a long, thoughtful message (45-70 words)
 */
function generateLongMessage(ctx: MessageGenerationContext): string {
  const { matchedName, matchedInterests, matchedBio, matchedCity, language, selfGender, quizAnswers } = ctx;

  if (language === 'pl') {
    const messages: string[] = [];

    // Interest + lifestyle based
    if (matchedInterests && matchedInterests.length >= 2) {
      const [interest1, interest2] = matchedInterests;
      messages.push(
        `Hej ${matchedName}! Twój profil naprawdę mnie zaciekawił – ${interest1} i ${interest2} to też moje pasje. Wydaje mi się, że moglibyśmy mieć świetne rozmowy na te tematy. Szukam kogoś, z kim można budować autentyczne połączenie. Co powiesz na to, żebyśmy się lepiej poznali? 😊`
      );
    }

    // Bio + city based
    if (matchedBio && matchedCity) {
      messages.push(
        `Cześć ${matchedName}! Przeczytałem/am Twój opis i muszę przyznać, że brzmi naprawdę interesująco. Bycie z ${matchedCity} dodaje tylko uroku! Szukam prawdziwych relacji i wydaje mi się, że moglibyśmy się dobrze dogadać. Chętnie dowiem się więcej o Tobie – może opowiesz coś o swoich pasjach? ✨`
      );
    }

    // Quiz-based deep
    if (quizAnswers?.lifestyle || quizAnswers?.values) {
      messages.push(
        `Witaj ${matchedName}! Twój profil wyróżnia się autentycznością – to rzadkość w dzisiejszych czasach. Szukam kogoś, z kim można prowadzić głębokie rozmowy i budować coś prawdziwego. Z tego co widzę, mamy podobne podejście do życia. Może podzielisz się ze mną swoją historią?`
      );
    }

    // Generic premium/elegant
    messages.push(
      `Hej ${matchedName}! Muszę przyznać, że Twój profil przykuł moją uwagę od pierwszej chwili. Jest w nim coś wyjątkowego, co wyróżnia Cię na tle innych. Wierzę w autentyczne połączenia i jakość nad ilość – wydaje mi się, że możemy mieć ze sobą świetną chemię. Co powiesz na dobry początek rozmowy? 💫`
    );

    return pickRandom(messages);
  }

  // English messages
  const messages: string[] = [];

  // Interest + lifestyle based
  if (matchedInterests && matchedInterests.length >= 2) {
    const [interest1, interest2] = matchedInterests;
    messages.push(
      `Hey ${matchedName}! Your profile really caught my eye – ${interest1} and ${interest2} are passions of mine too. I think we could have some great conversations about these topics. I'm looking for someone I can build an authentic connection with. What do you say we get to know each other? 😊`
    );
  }

  // Bio + city based
  if (matchedBio && matchedCity) {
    messages.push(
      `Hi ${matchedName}! I read your bio and I have to say, it sounds genuinely interesting. Being from ${matchedCity} just adds to the appeal! I'm all about real connections and I feel like we could really click. I'd love to learn more about you – maybe you could tell me about your passions? ✨`
    );
  }

  // Quiz-based deep
  if (quizAnswers?.lifestyle || quizAnswers?.values) {
    messages.push(
      `Hello ${matchedName}! Your profile stands out for its authenticity – that's rare these days. I'm looking for someone I can have deep conversations with and build something real. From what I can see, we have a similar approach to life. Would you share your story with me?`
    );
  }

  // Generic premium/confident
  messages.push(
    `Hey ${matchedName}! I have to admit, your profile caught my attention from the first moment. There's something special about it that makes you stand out. I believe in authentic connections and quality over quantity – I think we might have great chemistry together. How about we start with a good conversation? 💫`
  );

  return pickRandom(messages);
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a personalized greeting based on time of day (optional enhancement)
 */
export function getTimeBasedGreeting(language: 'en' | 'pl' = 'en'): string {
  const hour = new Date().getHours();

  if (language === 'pl') {
    if (hour < 12) return 'Dzień dobry';
    if (hour < 18) return 'Cześć';
    return 'Dobry wieczór';
  }

  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Hey';
  return 'Good evening';
}