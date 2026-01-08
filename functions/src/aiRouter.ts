/**
 * ========================================================================
 * AVALO AI ROUTER - PRODUCTION GRADE
 * ========================================================================
 *
 * Multi-provider AI routing with automatic fallback and retry logic
 * Supports: OpenAI GPT-4, Anthropic Claude, with extensible provider system
 *
 * Features:
 * - Provider health monitoring
 * - Automatic fallback on failure
 * - Exponential backoff retry
 * - Token usage tracking
 * - Cost optimization
 * - Streaming support
 *
 * @version 3.0.0
 * @module aiRouter
 */

;
;
;
import { FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

// Provider priorities (lower = higher priority)
const PROVIDER_PRIORITY = {
  openai: 1,
  anthropic: 2,
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Model costs per 1K tokens (USD)
const MODEL_COSTS = {
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
};

// ============================================================================
// TYPES
// ============================================================================

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  userId?: string;
  conversationId?: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  latencyMs: number;
  cached?: boolean;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

type AIProvider = "openai" | "anthropic";

// ============================================================================
// PROVIDER HEALTH TRACKING
// ============================================================================

interface ProviderHealth {
  provider: AIProvider;
  isHealthy: boolean;
  lastFailure?: Date;
  consecutiveFailures: number;
  lastSuccess?: Date;
  avgLatencyMs: number;
}

const providerHealth = new Map<AIProvider, ProviderHealth>();

// Initialize provider health
providerHealth.set("openai", {
  provider: "openai",
  isHealthy: true,
  consecutiveFailures: 0,
  avgLatencyMs: 0,
});

providerHealth.set("anthropic", {
  provider: "anthropic",
  isHealthy: true,
  consecutiveFailures: 0,
  avgLatencyMs: 0,
});

/**
 * Mark provider as failed
 */
function markProviderFailure(provider: AIProvider): void {
  const health = providerHealth.get(provider);
  if (health) {
    health.consecutiveFailures++;
    health.lastFailure = new Date();

    // Mark unhealthy after 3 consecutive failures
    if (health.consecutiveFailures >= 3) {
      health.isHealthy = false;
      logger.warn(`Provider ${provider} marked as unhealthy after ${health.consecutiveFailures} failures`);
    }
  }
}

/**
 * Mark provider as successful
 */
function markProviderSuccess(provider: AIProvider, latencyMs: number): void {
  const health = providerHealth.get(provider);
  if (health) {
    health.consecutiveFailures = 0;
    health.lastSuccess = new Date();
    health.isHealthy = true;

    // Update rolling average latency
    health.avgLatencyMs = health.avgLatencyMs === 0
      ? latencyMs
      : (health.avgLatencyMs * 0.8 + latencyMs * 0.2);
  }
}

/**
 * Get available providers sorted by priority and health
 */
function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = ["openai", "anthropic"];

  return providers
    .filter((provider) => {
      const health = providerHealth.get(provider);
      if (!health?.isHealthy) {
        // Retry if last failure was more than 5 minutes ago
        const minutesSinceFailure = health?.lastFailure
          ? (Date.now() - health.lastFailure.getTime()) / 60000
          : Infinity;

        if (minutesSinceFailure > 5) {
          health.isHealthy = true;
          health.consecutiveFailures = 0;
          return true;
        }
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const priorityDiff = PROVIDER_PRIORITY[a] - PROVIDER_PRIORITY[b];
      if (priorityDiff !== 0) return priorityDiff;

      // If same priority, prefer lower latency
      const healthA = providerHealth.get(a);
      const healthB = providerHealth.get(b);
      return (healthA?.avgLatencyMs || 0) - (healthB?.avgLatencyMs || 0);
    });
}

// ============================================================================
// OPENAI IMPLEMENTATION
// ============================================================================

async function callOpenAI(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();

  const model = request.model || "gpt-4-turbo";
  const temperature = request.temperature ?? 0.7;
  const maxTokens = request.maxTokens || 1000;

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: request.messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const latencyMs = Date.now() - startTime;

  const tokensUsed = {
    input: data.usage.prompt_tokens,
    output: data.usage.completion_tokens,
    total: data.usage.total_tokens,
  };

  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS["gpt-4-turbo"];
  const cost = (tokensUsed.input / 1000) * costs.input + (tokensUsed.output / 1000) * costs.output;

  markProviderSuccess("openai", latencyMs);

  return {
    content: data.choices[0].message.content,
    model,
    provider: "openai",
    tokensUsed,
    cost,
    latencyMs,
  };
}

/**
 * Stream OpenAI response
 */
async function* streamOpenAI(request: AIRequest): AsyncGenerator<StreamChunk> {
  const model = request.model || "gpt-4-turbo";
  const temperature = request.temperature ?? 0.7;
  const maxTokens = request.maxTokens || 1000;

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: request.messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body reader");
  }

  try {
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        yield { content: "", done: true };
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          if (data === "[DONE]") {
            yield { content: "", done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || "";

            if (content) {
              yield { content, done: false };
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// ANTHROPIC IMPLEMENTATION
// ============================================================================

async function callAnthropic(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();

  const model = request.model || "claude-3-sonnet-20240229";
  const temperature = request.temperature ?? 0.7;
  const maxTokens = request.maxTokens || 1000;

  // Convert messages to Anthropic format
  const systemMessage = request.messages.find((m) => m.role === "system");
  const messages = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage?.content,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const latencyMs = Date.now() - startTime;

  const tokensUsed = {
    input: data.usage.input_tokens,
    output: data.usage.output_tokens,
    total: data.usage.input_tokens + data.usage.output_tokens,
  };

  const modelKey = model.startsWith("claude-3-opus") ? "claude-3-opus" :
                   model.startsWith("claude-3-sonnet") ? "claude-3-sonnet" : "claude-3-haiku";
  const costs = MODEL_COSTS[modelKey];
  const cost = (tokensUsed.input / 1000) * costs.input + (tokensUsed.output / 1000) * costs.output;

  markProviderSuccess("anthropic", latencyMs);

  return {
    content: data.content[0].text,
    model,
    provider: "anthropic",
    tokensUsed,
    cost,
    latencyMs,
  };
}

// ============================================================================
// ROUTER LOGIC
// ============================================================================

/**
 * Route AI request with automatic fallback
 */
export async function routeAIRequest(request: AIRequest): Promise<AIResponse> {
  const availableProviders = getAvailableProviders();

  if (availableProviders.length === 0) {
    logger.error("No healthy AI providers available");
    throw new Error("AI service temporarily unavailable");
  }

  let lastError: Error | null = null;

  for (const provider of availableProviders) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        logger.info(`Routing AI request to ${provider} (attempt ${attempt + 1}/${MAX_RETRIES})`);

        let response: AIResponse;

        if (provider === "openai") {
          if (!OPENAI_API_KEY) {
            throw new Error("OpenAI API key not configured");
          }
          response = await callOpenAI(request);
        } else if (provider === "anthropic") {
          if (!ANTHROPIC_API_KEY) {
            throw new Error("Anthropic API key not configured");
          }
          response = await callAnthropic(request);
        } else {
          throw new Error(`Unknown provider: ${provider}`);
        }

        // Log token usage for billing
        if (request.userId) {
          await logTokenUsage(request.userId, response, request.conversationId);
        }

        return response;
      } catch (error: any) {
        lastError = error;
        logger.error(`AI request failed for ${provider} (attempt ${attempt + 1}):`, error);

        markProviderFailure(provider);

        // Exponential backoff before retry
        if (attempt < MAX_RETRIES - 1) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  // All providers and retries exhausted
  logger.error("All AI providers failed", { lastError });
  throw new Error(`AI request failed: ${lastError?.message || "Unknown error"}`);
}

/**
 * Stream AI response with fallback
 */
export async function* streamAIRequest(
  request: AIRequest
): AsyncGenerator<StreamChunk> {
  const availableProviders = getAvailableProviders();

  if (availableProviders.length === 0) {
    throw new Error("AI service temporarily unavailable");
  }

  // For streaming, we don't do fallback - just use the first available provider
  const provider = availableProviders[0];

  logger.info(`Streaming AI request to ${provider}`);

  if (provider === "openai") {
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }
    yield* streamOpenAI(request);
  } else {
    // Anthropic doesn't support streaming in this implementation
    // Fall back to non-streaming
    const response = await routeAIRequest({ ...request, stream: false });
    yield { content: response.content, done: false };
    yield { content: "", done: true };
  }
}

// ============================================================================
// TOKEN USAGE & BILLING
// ============================================================================

/**
 * Log token usage for billing
 */
async function logTokenUsage(
  userId: string,
  response: AIResponse,
  conversationId?: string
): Promise<void> {
  try {
    await db.collection("ai_usage").add({
      userId,
      conversationId,
      provider: response.provider,
      model: response.model,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
      latencyMs: response.latencyMs,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Update user's total AI usage
    await db.collection("users").doc(userId).update({
      "ai.totalTokensUsed": FieldValue.increment(response.tokensUsed.total),
      "ai.totalCost": FieldValue.increment(response.cost),
    });
  } catch (error) {
    logger.error("Failed to log token usage:", error);
    // Don't throw - logging failure shouldn't affect the request
  }
}

/**
 * Get user's AI usage statistics
 */
export async function getUserAIUsage(
  userId: string,
  period: "day" | "month" | "all" = "month"
): Promise<{
  totalTokens: number;
  totalCost: number;
  conversationCount: number;
  avgTokensPerConversation: number;
}> {
  let startDate: Date;
  const now = new Date();

  if (period === "day") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    startDate = new Date(0);
  }

  const snapshot = await db
    .collection("ai_usage")
    .where("userId", "==", userId)
    .where("timestamp", ">=", startDate)
    .get();

  let totalTokens = 0;
  let totalCost = 0;
  const conversations = new Set<string>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    totalTokens += data.tokensUsed?.total || 0;
    totalCost += data.cost || 0;
    if (data.conversationId) {
      conversations.add(data.conversationId);
    }
  });

  return {
    totalTokens,
    totalCost,
    conversationCount: conversations.size,
    avgTokensPerConversation: conversations.size > 0 ? totalTokens / conversations.size : 0,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  routeAIRequest,
  streamAIRequest,
  getUserAIUsage,
};

