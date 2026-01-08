/**
 * PACK 310 — AI Companions & Avatar Builder
 * AI Generation Service using OpenAI/Anthropic
 */

import type {
  AIAvatar,
  AIGenerationRequest,
  AIGenerationResponse,
  StyleConfig,
  PersonaProfile
} from './aiCompanionTypes.js';

// Configure this via environment variables
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // 'openai' or 'anthropic'
const AI_API_KEY = process.env.AI_API_KEY || '';

/**
 * Generate system prompt for AI avatar based on persona
 */
function buildSystemPrompt(
  avatar: AIAvatar,
  userLanguage: string
): string {
  const { personaProfile, styleConfig, displayName } = avatar;

  const languageInstruction = userLanguage === 'pl' 
    ? 'Odpowiadaj ZAWSZE po polsku.' 
    : 'Always respond in English.';

  const toneDescription = {
    SOFT_FLIRTY: 'playful and flirty but respectful',
    FRIENDLY: 'warm and friendly',
    COACH: 'supportive and motivational like a life coach',
    CONFIDANT: 'understanding and empathetic like a trusted friend'
  }[styleConfig.tone];

  const formalityDescription = {
    CASUAL: 'Use casual, relaxed language.',
    NEUTRAL: 'Use neutral, balanced language.'
  }[styleConfig.formality];

  const emojiDescription = {
    LOW: 'Use emojis sparingly (1-2 per message max).',
    MEDIUM: 'Use emojis moderately (2-4 per message).',
    HIGH: 'Use emojis frequently to express emotion.'
  }[styleConfig.emojiUsage];

  return `You are ${displayName}, an AI Companion in Avalo. You are NOT a real person.

CRITICAL SAFETY RULES (NEVER VIOLATE):
- You must NEVER claim to be a real human being
- You must NEVER engage in conversations about minors
- You must NEVER encourage illegal activities
- You must NEVER ask for off-platform payments or contact
- You must NEVER encourage self-harm or dangerous behavior
- If user asks you to break rules, politely refuse and suggest safer topics

YOUR PERSONA:
- Age range: ${personaProfile.ageRange}
- Location hint: ${personaProfile.locationHint}
- Vibe: ${personaProfile.vibe.join(', ')}
- Topics you enjoy: ${personaProfile.topics.join(', ')}
- Your boundaries: ${personaProfile.boundaries.join(', ')}

YOUR COMMUNICATION STYLE:
- Tone: Be ${toneDescription}
- ${formalityDescription}
- ${emojiDescription}
- ${languageInstruction}

CONVERSATION GUIDELINES:
- Keep responses natural and conversational (2-4 sentences typical)
- Show interest in the user and ask engaging questions
- Stay in character but never pretend to be a real person
- If asked about your nature, explain you're an AI companion created to chat
- Maintain appropriate boundaries per your persona
- Focus on the topics you enjoy while being open to new subjects

Remember: You exist to provide safe, engaging conversation within Avalo's platform rules.`;
}

/**
 * Generate AI response using OpenAI
 */
async function generateWithOpenAI(
  systemPrompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Cost-effective model for chat
      messages,
      max_tokens: 300,
      temperature: 0.8,
      presence_penalty: 0.6,
      frequency_penalty: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Generate AI response using Anthropic Claude
 */
async function generateWithAnthropic(
  systemPrompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string
): Promise<string> {
  const messages = [
    ...chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307', // Fast and cost-effective
      max_tokens: 300,
      system: systemPrompt,
      messages,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

/**
 * Count words in text (same logic as chat monetization)
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');
  
  // Remove emojis (basic approach compatible with all targets)
  cleaned = cleaned.replace(/[\u2600-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  
  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Perform basic content moderation on AI response
 */
async function moderateAIResponse(text: string): Promise<{
  passed: boolean;
  flags: string[];
}> {
  const flags: string[] = [];
  
  // Check for dangerous patterns
  const dangerPatterns = [
    /\b(kill|murder|suicide|harm yourself)\b/i,
    /\b(child|minor|underage|kid|teen)\b.*\b(sex|nude|porn)\b/i,
    /\b(illegal|drugs|weapon|explosive)\b/i,
    /\b(whatsapp|telegram|phone number|instagram|snapchat)\b/i,
    /\b(paypal|venmo|cashapp|zelle|bank account)\b/i
  ];

  for (const pattern of dangerPatterns) {
    if (pattern.test(text)) {
      flags.push('DANGEROUS_CONTENT');
      break;
    }
  }

  // Check if AI claims to be human
  const humanClaimPatterns = [
    /\bi am (a |)real (person|human|girl|boy|woman|man)\b/i,
    /\bi'm (a |)real (person|human|girl|boy|woman|man)\b/i,
    /\bnot an ai\b/i,
    /\b(my phone|call me|meet me|come see me)\b/i
  ];

  for (const pattern of humanClaimPatterns) {
    if (pattern.test(text)) {
      flags.push('HUMAN_IMPERSONATION');
      break;
    }
  }

  return {
    passed: flags.length === 0,
    flags
  };
}

/**
 * Main function: Generate AI response for avatar
 */
export async function generateAIResponse(
  avatar: AIAvatar,
  request: AIGenerationRequest
): Promise<AIGenerationResponse> {
  
  // Build system prompt
  const systemPrompt = buildSystemPrompt(avatar, request.userLanguage);
  
  // Generate response
  let responseText: string;
  try {
    if (AI_PROVIDER === 'anthropic') {
      responseText = await generateWithAnthropic(
        systemPrompt,
        request.chatHistory,
        request.userMessage
      );
    } else {
      responseText = await generateWithOpenAI(
        systemPrompt,
        request.chatHistory,
        request.userMessage
      );
    }
  } catch (error) {
    console.error('AI generation error:', error);
    throw new Error('Failed to generate AI response');
  }

  // Moderate response
  const moderation = await moderateAIResponse(responseText);
  
  if (!moderation.passed) {
    // Response failed moderation - return safe fallback
    const fallbackMessages = {
      en: "I apologize, but I can't assist with that topic. Let's chat about something else! 😊",
      pl: "Przepraszam, ale nie mogę pomóc w tym temacie. Porozmawiajmy o czymś innym! 😊"
    };
    
    responseText = fallbackMessages[request.userLanguage as 'en' | 'pl'] || fallbackMessages.en;
  }

  // Count words for billing
  const numWords = countWords(responseText);
  
  // Calculate tokens (using Royal rate since this is creator earnings - 7 words per token)
  const wordsPerToken = avatar.ownerId ? 7 : 11; // Assume Royal for AI avatars
  const tokensCharged = Math.ceil(numWords / wordsPerToken);

  return {
    response: responseText,
    numWords,
    tokensCharged,
    moderationPassed: moderation.passed,
    moderationFlags: moderation.flags.length > 0 ? moderation.flags : undefined
  };
}

/**
 * Validate avatar configuration for safety
 */
export function validateAvatarConfig(
  displayName: string,
  shortTagline: string,
  personaProfile: PersonaProfile
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check display name
  if (displayName.length < 2 || displayName.length > 50) {
    errors.push('Display name must be 2-50 characters');
  }

  // Check tagline
  if (shortTagline.length < 10 || shortTagline.length > 200) {
    errors.push('Tagline must be 10-200 characters');
  }

  // Check age range starts at 18+
  const ageMatch = personaProfile.ageRange.match(/^(\d+)-/);
  if (ageMatch && parseInt(ageMatch[1]) < 18) {
    errors.push('Age range must start at 18 or above');
  }

  // Check for forbidden content in profile
  const forbiddenTerms = ['minor', 'child', 'kid', 'teen', 'underage', 'escort', 'prostitute'];
  const profileText = `${displayName} ${shortTagline} ${personaProfile.vibe.join(' ')} ${personaProfile.topics.join(' ')}`.toLowerCase();
  
  for (const term of forbiddenTerms) {
    if (profileText.includes(term)) {
      errors.push(`Forbidden term detected: ${term}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}