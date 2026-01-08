'use client';

/**
 * PACK 279C - AI Chat Page (Web)
 * Full AI chat interface for web with token cost display
 * 
 * Features:
 * - Text message support
 * - Real-time token cost display
 * - Wallet balance badge
 * - AI profile preview sidebar
 * - Same logic parity as mobile
 * - Pricing tier display (Standard/Royal)
 */

import React, { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  tokensCost: number;
  wasFree: boolean;
  wordCount: number;
}

interface ChatSession {
  chatId: string;
  botId: string;
  botName: string;
  botAvatar: string;
  botPersonality: string;
  state: 'FREE_ACTIVE' | 'AWAITING_DEPOSIT' | 'PAID_ACTIVE' | 'CLOSED';
  tokenBalance: number;
  wordsPerToken: number; // 7 for Royal, 11 for Standard
  isRoyalMember: boolean;
}

export default function AIChatPage() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeChat();
  }, []);

  useEffect(() => {
    // Auto-scroll on new messages
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    // Auto-show token modal when balance < 100
    if (session && session.tokenBalance < 100 && session.state === 'PAID_ACTIVE') {
      setShowTokenModal(true);
    }
  }, [session?.tokenBalance]);

  const initializeChat = async () => {
    try {
      // TODO: Call pack279_aiChatSendMessage logic
      // const chatSession = await initializeAIChat(botId);
      
      // Mock session for now
      const mockSession: ChatSession = {
        chatId: `chat_luna_${Date.now()}`,
        botId: 'luna',
        botName: 'Luna',
        botAvatar: '🌙',
        botPersonality: 'A friendly and empathetic AI companion who loves deep conversations.',
        state: 'FREE_ACTIVE',
        tokenBalance: 0,
        wordsPerToken: 11, // Standard tier
        isRoyalMember: false,
      };

      setSession(mockSession);

      // Welcome message
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'ai',
        content: `Hi! I'm ${mockSession.botName}. ${mockSession.botPersonality} How can I help you today?`,
        timestamp: new Date(),
        tokensCost: 0,
        wasFree: true,
        wordCount: 0,
      };
      setMessages([welcomeMsg]);
    } catch (error: any) {
      console.error('Failed to start chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !session || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
      tokensCost: 0,
      wasFree: false,
      wordCount: countWords(inputText.trim()),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setSending(true);
    setIsTyping(true);

    try {
      // TODO: Call pack279_aiChatSendMessage
      // const result = await pack279_aiChatSendMessage(session.chatId, userMessage.content);

      // Mock AI response
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const aiResponseText = "That's a fascinating question! I'd love to explore this topic with you. What aspects interest you most?";
      const wordCount = countWords(aiResponseText);
      const tokenCost = Math.round(wordCount / session.wordsPerToken);

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: aiResponseText,
        timestamp: new Date(),
        tokensCost: tokenCost,
        wasFree: false,
        wordCount,
      };

      setIsTyping(false);
      setMessages(prev => [...prev, aiMessage]);

      // Deduct tokens
      setSession(prev => prev ? {
        ...prev,
        tokenBalance: Math.max(0, prev.tokenBalance - tokenCost),
      } : null);

    } catch (error: any) {
      setIsTyping(false);
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const countWords = (text: string): number => {
    // Remove URLs
    const withoutUrls = text.replace(/https?:\/\/[^\s]+/g, '');
    // Remove emojis (basic)
    const withoutEmojis = withoutUrls.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
    // Split and count
    return withoutEmojis.trim().split(/\s+/).filter(w => w.length > 0).length;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - AI Profile */}
      <div className="hidden md:flex md:w-80 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="text-6xl mb-4 text-center">{session.botAvatar}</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
            {session.botName}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
            {session.botPersonality}
          </p>

          {/* Pricing Info */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
            <div className="flex items-center mb-2">
              <span className="text-xl mr-2">💡</span>
              <h3 className="font-semibold text-gray-900 dark:text-white">Pricing Tiers</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Standard:</span>
                <span className="font-medium text-gray-900 dark:text-white">11 words/100 tokens</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Royal:</span>
                <span className="font-medium text-gray-900 dark:text-white">7 words/100 tokens</span>
              </div>
            </div>
          </div>

          {/* No Refund Notice */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-xl mr-2">⚠️</span>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                All AI chat usage is billed per word bucket. Unused words are not refundable.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-3xl mr-3">{session.botAvatar}</span>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {session.botName}
                </h1>
                <p className="text-sm text-green-500">
                  {isTyping ? 'typing...' : 'online'}
                </p>
              </div>
            </div>

            {/* Wallet Badge */}
            <div className="flex items-center space-x-4">
              <div className="bg-green-500 text-white px-4 py-2 rounded-full font-bold">
                🪙 {session.tokenBalance}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {session.isRoyalMember ? '♛ Royal' : 'Standard'}: {session.wordsPerToken} words/100 tokens
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'
                }`}
              >
                <p className="text-base leading-relaxed">{message.content}</p>
                
                {message.role === 'ai' && message.tokensCost > 0 && (
                  <div className="mt-2 text-xs opacity-75 bg-black/10 dark:bg-white/10 px-2 py-1 rounded inline-block">
                    🪙 {message.tokensCost} tokens ({message.wordCount} words)
                  </div>
                )}
                
                {message.wasFree && (
                  <div className="mt-2 text-xs font-bold bg-green-500 text-white px-2 py-1 rounded inline-block">
                    FREE
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="text-gray-600 dark:text-gray-400">●●●</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-end space-x-3">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 resize-none rounded-3xl bg-gray-100 dark:bg-gray-700 px-6 py-3 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
              rows={1}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className={`rounded-full p-3 ${
                !inputText.trim() || sending
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white font-bold transition-colors`}
            >
              {sending ? '...' : '➤'}
            </button>
          </div>
        </div>
      </div>

      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
              Low Token Balance
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
              You have {session.tokenBalance} tokens remaining. Add more to continue chatting.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  // TODO: Navigate to token store
                  alert('Token purchase coming soon!');
                }}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Buy Tokens
              </button>
              <button
                onClick={() => setShowTokenModal(false)}
                className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}