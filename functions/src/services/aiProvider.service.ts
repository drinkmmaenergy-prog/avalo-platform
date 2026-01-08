/**
 * PACK 279A — AI Provider Service
 * Unified adapter for OpenAI and Claude API calls
 * Supports multiple AI providers with fallback
 */

import { logger } from 'firebase-functions';

// ============================================================================
// TYPES
// ============================================================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateAIReplyRequest {
  systemPrompt: string;
  contextMessages: string[];  // Previous conversation context
  userMessage: string;
  nsfwEnabled?: boolean;
  isMinor?: boolean;
}

export interface GenerateAIReplyResponse {
  reply: string;
  provider: 'openai' | 'claude';
  tokensUsed: number;
}

export type AIProvider = 'openai' | 'claude';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Preferred provider (can be configured per companion)
const DEFAULT_PROVIDER: AIProvider = 'openai';
const FALLBACK_PROVIDER: AIProvider = 'claude';

// Model configurations
const OPENAI_MODEL = 'gpt-4o-mini'; // Cost-effective for chat
const CLAUDE_MODEL = 'claude-sonnet-3-5-20241022'; // Claude Sonnet 4.5 (latest)

// Safety prompts
const MINOR_SAFETY_SUFFIX = `

IMPORTANT: This user is under 18 years old. You MUST:
- Keep all content strictly age-appropriate
- Never discuss sexual topics, dating, or romance
- Avoid profanity and mature themes
- Be supportive, educational, and friendly
- If inappropriate topics are raised, politely redirect`;

const NSFW_DISABLED_SUFFIX = `

CONTENT POLICY: NSFW content is disabled for this conversation. Keep all responses:
- Family-friendly and appropriate
- Focused on casual conversation
- Free from sexual or explicit content`;

// ============================================================================
// MAIN FUNCTION: generateAIReply
// ============================================================================

/**
 * Generate AI reply using configured provider with automatic fallback
 */
export async function generateAIReply(
  request: GenerateAIReplyRequest
): Promise<GenerateAIReplyResponse> {
  
  // Apply safety modifiers to system prompt
  let finalSystemPrompt = request.systemPrompt;
  
  if (request.isMinor) {
    finalSystemPrompt += MINOR_SAFETY_SUFFIX;
  } else if (!request.nsfwEnabled) {
    finalSystemPrompt += NSFW_DISABLED_SUFFIX;
  }
  
  // Try primary provider
  try {
    if (DEFAULT_PROVIDER === 'openai' && OPENAI_API_KEY) {
      return await generateWithOpenAI(finalSystemPrompt, request.contextMessages, request.userMessage);
    } else if (DEFAULT_PROVIDER === 'claude' && CLAUDE_API_KEY) {
      return await generateWithClaude(finalSystemPrompt, request.contextMessages, request.userMessage);
    }
  } catch (error) {
    logger.warn(`Primary AI provider (${DEFAULT_PROVIDER}) failed, trying fallback:`, error);
    
    // Try fallback provider
    try {
      if (FALLBACK_PROVIDER === 'openai' && OPENAI_API_KEY) {
        return await generateWithOpenAI(finalSystemPrompt, request.contextMessages, request.userMessage);
      } else if (FALLBACK_PROVIDER === 'claude' && CLAUDE_API_KEY) {
        return await generateWithClaude(finalSystemPrompt, request.contextMessages, request.userMessage);
      }
    } catch (fallbackError) {
      logger.error('AI fallback provider also failed:', fallbackError);
    }
  }
  
  // If both providers failed, return error message
  throw new Error('AI_UNAVAILABLE: All AI providers failed');
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

async function generateWithOpenAI(
  systemPrompt: string,
  contextMessages: string[],
  userMessage: string
): Promise<GenerateAIReplyResponse> {
  
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  // Build messages array
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt }
  ];
  
  // Add context messages (alternating user/assistant)
  for (let i = 0; i < contextMessages.length; i++) {
    const msg = contextMessages[i];
    if (msg.startsWith('User: ')) {
      messages.push({
        role: 'user',
        content: msg.substring(6)
      });
    } else if (msg.startsWith('Bot: ')) {
      messages.push({
        role: 'assistant',
        content: msg.substring(5)
      });
    }
  }
  
  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage
  });
  
  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 500,
      presence_penalty: 0.6,
      frequency_penalty: 0.3,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logger.error('OpenAI API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json() as any;
  const reply = data.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response.';
  const tokensUsed = data.usage?.total_tokens || 0;
  
  return {
    reply: reply.trim(),
    provider: 'openai',
    tokensUsed,
  };
}

// ============================================================================
// CLAUDE PROVIDER
// ============================================================================

async function generateWithClaude(
  systemPrompt: string,
  contextMessages: string[],
  userMessage: string
): Promise<GenerateAIReplyResponse> {
  
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API key not configured');
  }
  
  // Build messages array for Claude
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // Add context messages
  for (let i = 0; i < contextMessages.length; i++) {
    const msg = contextMessages[i];
    if (msg.startsWith('User: ')) {
      messages.push({
        role: 'user',
        content: msg.substring(6)
      });
    } else if (msg.startsWith('Bot: ')) {
      messages.push({
        role: 'assistant',
        content: msg.substring(5)
      });
    }
  }
  
  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage
  });
  
  const response = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      system: systemPrompt,
      messages,
      temperature: 0.8,
      max_tokens: 500,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Claude API error:', response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }
  
  const data = await response.json() as any;
  const reply = data.content[0]?.text || 'I apologize, but I couldn\'t generate a response.';
  const tokensUsed = data.usage?.input_tokens + data.usage?.output_tokens || 0;
  
  return {
    reply: reply.trim(),
    provider: 'claude',
    tokensUsed,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateAIReply,
};