/**
 * PACK 335: User Support System - AI Help Assistant
 * AI-powered FAQ search and support assistance
 */

import * as functions from "firebase-functions";
import { db } from "./init";
import {
  AiSupportRequest,
  AiSupportResponse,
  SupportFaqArticle,
  SupportSystemSettings,
} from "./pack335-support-types";

/**
 * AI Support Assistant (Stub implementation)
 * Provides FAQ search and basic support
 */
export const pack335_aiSupportAssistant = functions.https.onCall(
  async (data: AiSupportRequest, context): Promise<AiSupportResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    const { userId, message, locale } = data;
    
    // Verify user
    if (userId !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Invalid user");
    }
    
    // Check if AI assistant is enabled
    const settingsDoc = await db.collection("supportSystemSettings").doc("GLOBAL").get();
    const settings = settingsDoc.exists
      ? (settingsDoc.data() as SupportSystemSettings)
      : { aiAssistantEnabled: false };
    
    if (!settings.aiAssistantEnabled) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "AI assistant is currently disabled"
      );
    }
    
    // Search FAQ articles
    const faqQuery = await db
      .collection("supportFaqArticles")
      .where("isPublished", "==", true)
      .where("language", "==", locale)
      .limit(10)
      .get();
    
    const faqs = faqQuery.docs.map(doc => doc.data() as SupportFaqArticle);
    
    // Simple keyword matching (stub - real implementation would use AI)
    const keywords = message.toLowerCase().split(/\s+/);
    const matchingFaqs: Array<{ article: SupportFaqArticle; score: number }> = [];
    
    for (const faq of faqs) {
      let score = 0;
      const searchableText = `${faq.title} ${faq.bodyMarkdown} ${faq.tags.join(" ")}`.toLowerCase();
      
      for (const keyword of keywords) {
        if (searchableText.includes(keyword)) {
          score++;
        }
      }
      
      if (score > 0) {
        matchingFaqs.push({ article: faq, score });
      }
    }
    
    // Sort by relevance
    matchingFaqs.sort((a, b) => b.score - a.score);
    
    // Generate response based on matches
    let answer = "";
    const relatedFaqIds: string[] = [];
    const suggestedActions: string[] = [];
    
    if (matchingFaqs.length > 0) {
      const topMatch = matchingFaqs[0].article;
      answer = `I found information that might help:\n\n**${topMatch.title}**\n\n${topMatch.bodyMarkdown.substring(0, 300)}...`;
      relatedFaqIds.push(topMatch.id);
      
      if (matchingFaqs.length > 1) {
        for (let i = 1; i < Math.min(3, matchingFaqs.length); i++) {
          relatedFaqIds.push(matchingFaqs[i].article.id);
        }
      }
      
      suggestedActions.push("View full article");
      if (relatedFaqIds.length > 1) {
        suggestedActions.push("See related articles");
      }
    } else {
      // No matching FAQs - suggest creating ticket
      answer = "I couldn't find specific information about your question in our FAQ. Would you like to create a support ticket so our team can help you?";
      suggestedActions.push("Create support ticket");
      
      // Suggest FAQ categories based on common keywords
      if (keywords.some(k => ["payment", "pay", "wallet", "token"].includes(k))) {
        answer += "\n\nYou might also want to check our Payments FAQ section.";
        suggestedActions.push("View Payments FAQ");
      } else if (keywords.some(k => ["refund", "money", "back"].includes(k))) {
        answer += "\n\nYou might also want to check our Refunds FAQ section.";
        suggestedActions.push("View Refunds FAQ");
      } else if (keywords.some(k => ["verify", "verification", "kyc", "identity"].includes(k))) {
        answer += "\n\nYou might also want to check our Verification FAQ section.";
        suggestedActions.push("View Verification FAQ");
      } else if (keywords.some(k => ["safety", "report", "block", "harassment"].includes(k))) {
        answer += "\n\nYou might also want to check our Safety FAQ section.";
        suggestedActions.push("View Safety FAQ");
      }
    }
    
    // Log interaction for analytics
    await db.collection("supportAiInteractions").add({
      userId,
      message,
      locale,
      matchingFaqCount: matchingFaqs.length,
      topFaqId: matchingFaqs.length > 0 ? matchingFaqs[0].article.id : null,
      timestamp: new Date(),
    });
    
    return {
      answer,
      relatedFaqs: relatedFaqIds,
      suggestedActions,
    };
  }
);

/**
 * Search FAQ articles
 */
export const pack335_searchFaqArticles = functions.https.onCall(
  async (
    data: { query: string; category?: string; language?: string; limit?: number },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    const { query, category, language, limit = 10 } = data;
    
    let faqQuery = db
      .collection("supportFaqArticles")
      .where("isPublished", "==", true) as any;
    
    if (category) {
      faqQuery = faqQuery.where("category", "==", category);
    }
    
    if (language) {
      faqQuery = faqQuery.where("language", "==", language);
    }
    
    faqQuery = faqQuery.limit(limit);
    
    const snapshot = await faqQuery.get();
    const articles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Simple text search (in production, use Algolia or similar)
    if (query) {
      const keywords = query.toLowerCase().split(/\s+/);
      const scored = articles
        .map(article => {
          let score = 0;
          const searchText = `${article.title} ${article.bodyMarkdown} ${article.tags.join(" ")}`.toLowerCase();
          
          for (const keyword of keywords) {
            if (searchText.includes(keyword)) {
              score++;
            }
          }
          
          return { article, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.article);
      
      return { articles: scored };
    }
    
    return { articles };
  }
);

/**
 * Get FAQ article by ID
 */
export const pack335_getFaqArticle = functions.https.onCall(
  async (data: { articleId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    const { articleId } = data;
    
    const doc = await db.collection("supportFaqArticles").doc(articleId).get();
    
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", "Article not found");
    }
    
    const article = doc.data() as SupportFaqArticle;
    
    // Only return published articles to non-admins
    const isAdmin = await db.collection("adminUsers").doc(context.auth.uid).get();
    
    if (!article.isPublished && !isAdmin.exists) {
      throw new functions.https.HttpsError("not-found", "Article not found");
    }
    
    // Track view
    await db.collection("supportFaqViews").add({
      articleId,
      userId: context.auth.uid,
      timestamp: new Date(),
    });
    
    return { article: { id: doc.id, ...article } };
  }
);

/**
 * Get FAQ categories with article counts
 */
export const pack335_getFaqCategories = functions.https.onCall(
  async (data: { language?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    const { language = "en" } = data;
    
    let query = db
      .collection("supportFaqArticles")
      .where("isPublished", "==", true)
      .where("language", "==", language) as any;
    
    const snapshot = await query.get();
    const articles = snapshot.docs.map(doc => doc.data() as SupportFaqArticle);
    
    // Count by category
    const categories: Record<string, number> = {};
    
    for (const article of articles) {
      categories[article.category] = (categories[article.category] || 0) + 1;
    }
    
    return { categories };
  }
);

/**
 * Admin: Create or update FAQ article
 */
export const pack335_manageFaqArticle = functions.https.onCall(
  async (
    data: {
      articleId?: string;
      title: string;
      bodyMarkdown: string;
      category: string;
      tags: string[];
      language: string;
      isPublished: boolean;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    // Verify admin
    const isAdmin = await db.collection("adminUsers").doc(context.auth.uid).get();
    if (!isAdmin.exists) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }
    
    const { articleId, title, bodyMarkdown, category, tags, language, isPublished } = data;
    
    const now = new Date();
    
    if (articleId) {
      // Update existing
      await db.collection("supportFaqArticles").doc(articleId).update({
        title,
        bodyMarkdown,
        category,
        tags,
        language,
        isPublished,
        updatedAt: now,
      });
      
      return { success: true, articleId };
    } else {
      // Create new
      const docRef = await db.collection("supportFaqArticles").add({
        title,
        bodyMarkdown,
        category,
        tags,
        language,
        isPublished,
        createdAt: now,
        updatedAt: now,
      });
      
      return { success: true, articleId: docRef.id };
    }
  }
);

/**
 * Admin: Delete FAQ article
 */
export const pack335_deleteFaqArticle = functions.https.onCall(
  async (data: { articleId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    // Verify admin
    const isAdmin = await db.collection("adminUsers").doc(context.auth.uid).get();
    if (!isAdmin.exists) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }
    
    const { articleId } = data;
    
    await db.collection("supportFaqArticles").doc(articleId).delete();
    
    return { success: true };
  }
);