'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  Send,
  Sparkles,
  AlertCircle,
  FileText,
  User,
  Shield,
  Lightbulb,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

const quickActions: QuickAction[] = [
  {
    label: 'Explain the violation',
    prompt: 'Explain the violation in simple terms.',
    icon: FileText,
  },
  {
    label: 'Check for false positive',
    prompt: 'Could this be a false positive?',
    icon: AlertCircle,
  },
  {
    label: 'Safety risk ranking',
    prompt: 'Rate the threat level from 1–10 and explain.',
    icon: Shield,
  },
  {
    label: 'Propose next steps',
    prompt: 'Suggest next steps for a moderator to consider.',
    icon: Lightbulb,
  },
];

export default function AssistantPage() {
  const searchParams = useSearchParams();
  const incidentId = searchParams.get('incidentId');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextInfo, setContextInfo] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load context if incidentId is provided
  useEffect(() => {
    if (incidentId) {
      loadIncidentContext(incidentId);
    }
  }, [incidentId]);

  const loadIncidentContext = async (id: string) => {
    try {
      setContextLoading(true);
      const db = getFirestore();

      // Fetch incident
      const incidentDoc = await getDoc(doc(db, 'contentIncidents', id));
      if (!incidentDoc.exists()) {
        setContextInfo('Incident not found');
        return;
      }

      const incidentData = incidentDoc.data();
      
      // Fetch user data if available
      let userData = null;
      if (incidentData.userId) {
        const userDoc = await getDoc(doc(db, 'users', incidentData.userId));
        if (userDoc.exists()) {
          userData = userDoc.data();
        }
      }

      // Fetch appeals if any exist
      const appealsQuery = query(
        collection(db, 'appeals'),
        where('incidentId', '==', id)
      );
      const appealsSnapshot = await getDocs(appealsQuery);
      const appeals = appealsSnapshot.docs.map(doc => doc.data());

      // Build context string
      let context = `INCIDENT CONTEXT:\n\n`;
      context += `Incident ID: ${id}\n`;
      context += `Category: ${incidentData.category || 'Unknown'}\n`;
      context += `Severity: ${incidentData.severity || 'Unknown'}\n`;
      context += `Status: ${incidentData.status || 'Pending'}\n`;
      context += `Timestamp: ${incidentData.timestamp?.toDate?.()?.toLocaleString() || 'Unknown'}\n`;
      
      if (incidentData.description) {
        context += `\nDescription: ${incidentData.description}\n`;
      }
      
      if (incidentData.snippet) {
        context += `\nContent Snippet: "${incidentData.snippet}"\n`;
      }

      if (userData) {
        context += `\nUser: ${userData.username || 'Unknown'} (${incidentData.userId})\n`;
        if (userData.accountStatus) {
          context += `Account Status: ${userData.accountStatus}\n`;
        }
      }

      if (appeals.length > 0) {
        context += `\nAppeals: ${appeals.length} appeal(s) filed\n`;
      }

      setContextInfo(context);

      // Auto-send analysis request
      const autoMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: `Provide a full analysis for incident ${id}.`,
        timestamp: new Date(),
      };

      setMessages([autoMessage]);
      await sendMessageToAI(`Provide a full analysis for incident ${id}.`, context);
    } catch (error) {
      console.error('Error loading context:', error);
      setContextInfo('Error loading context');
    } finally {
      setContextLoading(false);
    }
  };

  const sendMessageToAI = async (messageContent: string, additionalContext?: string) => {
    try {
      setLoading(true);

      // Check if API key is available
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      if (!apiKey) {
        setAiAvailable(false);
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'AI unavailable. OpenAI API key not configured.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }

      // Build system prompt
      let systemPrompt = `You are an AI assistant for Avalo's moderation team. Your role is to analyze content incidents and provide recommendations.

IMPORTANT RULES:
- You MUST NEVER execute any actions
- You MUST NEVER call any Firebase functions
- You MUST NEVER generate ban text automatically
- You provide ANALYSIS and RECOMMENDATIONS only
- Moderators make ALL final decisions

RESPONSE FORMAT:
Always structure your responses as follows:

Summary:
[Brief overview of the situation]

Key Policy Matches:
- [List relevant policy violations or concerns]

Risk Factors:
- [List potential risks or concerns]

Recommendation (non-binding):
[One-sentence recommendation for moderator consideration]

Use Avalo's policy terminology when possible. Be precise, objective, and helpful.`;

      if (additionalContext) {
        systemPrompt += `\n\nCONTEXT INFORMATION:\n${additionalContext}`;
      }

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: messageContent },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content || 'No response from AI';

      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error calling OpenAI:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    await sendMessageToAI(input, contextInfo || undefined);
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prev => prev ? `${prev} ${prompt}` : prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30">
        {/* Header */}
        <div className="p-6 border-b border-[#40E0D0]/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-[#0F0F0F]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
              <p className="text-sm text-gray-400">
                {aiAvailable ? 'Ready to help with moderation analysis' : 'AI currently unavailable'}
              </p>
            </div>
          </div>

          {/* Context Info */}
          {contextLoading && (
            <div className="mt-4 p-3 bg-[#40E0D0]/10 border border-[#40E0D0]/30 rounded-lg">
              <p className="text-sm text-[#40E0D0]">Loading incident context...</p>
            </div>
          )}

          {contextInfo && !contextLoading && (
            <div className="mt-4 p-3 bg-[#40E0D0]/10 border border-[#40E0D0]/30 rounded-lg">
              <p className="text-xs text-[#40E0D0] font-mono whitespace-pre-wrap">
                {contextInfo.substring(0, 200)}...
              </p>
            </div>
          )}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !contextLoading && (
            <div className="text-center py-12">
              <Sparkles className="w-16 h-16 text-[#40E0D0] mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-white mb-2">Start a conversation</h3>
              <p className="text-gray-400">
                Ask questions about incidents, policy violations, or request analysis
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-xl p-4 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-[#40E0D0] to-[#2A9D8F] text-white'
                    : 'bg-[#0F0F0F] border border-[#D4AF37]/30 text-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  {message.role === 'assistant' && (
                    <Sparkles className="w-5 h-5 text-[#D4AF37] flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold mb-1">
                      {message.role === 'user' ? 'Moderator' : 'AI Assistant'}
                    </p>
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    <p className="text-xs opacity-60 mt-2">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl p-4 bg-[#0F0F0F] border border-[#D4AF37]/30">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-[#D4AF37] animate-pulse" />
                  <p className="text-sm text-gray-400">AI is thinking...</p>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="p-6 border-t border-[#40E0D0]/30">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={aiAvailable ? "Ask about an incident, policy, or request analysis..." : "AI is currently unavailable"}
              disabled={!aiAvailable || loading}
              className="flex-1 bg-[#0F0F0F] border border-[#40E0D0]/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#40E0D0] disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              rows={2}
            />
            <button
              type="submit"
              disabled={!input.trim() || !aiAvailable || loading}
              className="px-6 py-3 bg-gradient-to-br from-[#40E0D0] to-[#2A9D8F] text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-[#40E0D0]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Right Sidebar - Quick Actions */}
      <div className="w-80 space-y-4">
        {/* Quick Insert Buttons */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-[#D4AF37]" />
            Quick Actions
          </h3>
          <div className="space-y-2">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="w-full flex items-center gap-3 p-3 bg-[#0F0F0F] border border-[#40E0D0]/20 rounded-lg hover:border-[#40E0D0]/50 hover:bg-[#0F0F0F]/80 transition-all text-left group"
                >
                  <Icon className="w-5 h-5 text-[#40E0D0] group-hover:text-[#D4AF37] transition-colors" />
                  <span className="text-sm text-white">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Info */}
        <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/30 p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#D4AF37]" />
            AI Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {aiAvailable ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-white">AI Available</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-white">AI Unavailable</span>
                </>
              )}
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <p>• Model: GPT-4o-mini</p>
              <p>• Temperature: 0.3</p>
              <p>• Mode: Read-only recommendations</p>
            </div>
          </div>
        </div>

        {/* Guidelines */}
        <div className="bg-gradient-to-br from-[#D4AF37]/10 to-[#40E0D0]/10 rounded-xl border border-[#D4AF37]/30 p-6">
          <h3 className="text-lg font-bold text-white mb-3">⚠️ Important</h3>
          <ul className="text-xs text-gray-300 space-y-2">
            <li>• AI provides suggestions only</li>
            <li>• You make all final decisions</li>
            <li>• No automatic actions taken</li>
            <li>• Review all recommendations</li>
            <li>• Use judgment and experience</li>
          </ul>
        </div>
      </div>
    </div>
  );
}