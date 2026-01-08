/**
 * Mock AI Service for Local Development
 * Simulates OpenAI API responses
 */

import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

interface MockAIConfig {
  port: number;
  latency: number;
  errorRate: number;
}

const config: MockAIConfig = {
  port: parseInt(process.env.MOCK_AI_PORT || '7001'),
  latency: parseInt(process.env.MOCK_AI_LATENCY || '200'),
  errorRate: parseFloat(process.env.MOCK_AI_ERROR_RATE || '0'),
};

// Mock responses
const mockResponses = {
  friendly: [
    "Hi! It's so nice to meet you! How has your day been?",
    "That's wonderful! I love hearing about your interests!",
    "Tell me more! I'm really enjoying our conversation.",
  ],
  flirty: [
    "Well hello there! You've certainly caught my attention 😉",
    "I have to say, chatting with you is the highlight of my day",
    "You really know how to make a conversation interesting!",
  ],
  professional: [
    "Hello! I'm here to assist you with any questions you might have.",
    "I understand. Let me help you with that.",
    "That's an excellent question. Here's what I think...",
  ],
};

// Moderate content
app.post('/v1/moderations', async (req: Request, res: Response) => {
  await simulateLatency();

  if (shouldSimulateError()) {
    return res.status(500).json({ error: { message: 'Mock AI error' } });
  }

  const { input } = req.body;
  const flagged = containsInappropriateContent(input);

  res.json({
    id: `modr_${Date.now()}`,
    model: 'text-moderation-latest',
    results: [{
      flagged,
      categories: {
        sexual: flagged && input.toLowerCase().includes('sex'),
        hate: flagged && input.toLowerCase().includes('hate'),
        violence: flagged && input.toLowerCase().includes('kill'),
        'self-harm': false,
        'sexual/minors': false,
        'hate/threatening': false,
        'violence/graphic': false,
      },
      category_scores: {
        sexual: flagged ? 0.9 : 0.01,
        hate: flagged ? 0.8 : 0.01,
        violence: flagged ? 0.7 : 0.01,
        'self-harm': 0.01,
        'sexual/minors': 0.01,
        'hate/threatening': 0.01,
        'violence/graphic': 0.01,
      },
    }],
  });
});

// Chat completions
app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  await simulateLatency();

  if (shouldSimulateError()) {
    return res.status(500).json({ error: { message: 'Mock AI error' } });
  }

  const { messages, model } = req.body;
  const lastMessage = messages[messages.length - 1];
  
  // Determine personality from system message
  const systemMessage = messages.find((m: any) => m.role === 'system');
  let personality = 'friendly';
  if (systemMessage?.content.toLowerCase().includes('flirt')) {
    personality = 'flirty';
  } else if (systemMessage?.content.toLowerCase().includes('professional')) {
    personality = 'professional';
  }

  const responses = mockResponses[personality as keyof typeof mockResponses];
  const response = responses[Math.floor(Math.random() * responses.length)];

  res.json({
    id: `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: response,
      },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 20,
      total_tokens: 70,
    },
  });
});

// Embeddings
app.post('/v1/embeddings', async (req: Request, res: Response) => {
  await simulateLatency();

  if (shouldSimulateError()) {
    return res.status(500).json({ error: { message: 'Mock AI error' } });
  }

  const { input } = req.body;
  const inputs = Array.isArray(input) ? input : [input];

  res.json({
    object: 'list',
    data: inputs.map((text: string, i: number) => ({
      object: 'embedding',
      embedding: generateMockEmbedding(),
      index: i,
    })),
    model: 'text-embedding-ada-002',
    usage: {
      prompt_tokens: inputs.length * 8,
      total_tokens: inputs.length * 8,
    },
  });
});

function containsInappropriateContent(text: string): boolean {
  const inappropriate = ['sex', 'porn', 'nude', 'kill', 'hate', 'drug'];
  const lower = text.toLowerCase();
  return inappropriate.some(word => lower.includes(word));
}

function generateMockEmbedding(): number[] {
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}

async function simulateLatency(): Promise<void> {
  const jitter = Math.random() * 100 - 50;
  const delay = Math.max(0, config.latency + jitter);
  return new Promise(resolve => setTimeout(resolve, delay));
}

function shouldSimulateError(): boolean {
  return Math.random() < config.errorRate;
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mock-ai', port: config.port });
});

// Start server
app.listen(config.port, () => {
  console.log(`🤖 Mock AI Service running on port ${config.port}`);
  console.log(`   Latency: ${config.latency}ms`);
  console.log(`   Error Rate: ${config.errorRate * 100}%`);
});

export default app;