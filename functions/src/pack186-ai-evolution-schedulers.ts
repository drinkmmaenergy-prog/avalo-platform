/**
 * PACK 186 - AI Evolution Engine Schedulers
 * 
 * Scheduled functions for memory decay cycles and seasonal lore updates.
 */

import * as functions from 'firebase-functions';
import { forgetOldAIMemories, generateLoreUpdate, GrowthEventType, recordGrowthMetric } from './pack186-ai-evolution';
import { db } from './init';

// ======================
// Memory Decay Scheduler
// ======================

export const memoryDecayCycle = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting memory decay cycle...');
    
    try {
      const result = await forgetOldAIMemories();
      
      console.log(`Memory decay complete: ${result.expired} memories expired, ${result.processed} records processed`);
      
      await db.collection('ai_system_logs').add({
        type: 'memory_decay_cycle',
        timestamp: new Date(),
        result,
        status: 'success'
      });
      
      return {
        success: true,
        expired: result.expired,
        processed: result.processed
      };
    } catch (error: any) {
      console.error('Memory decay cycle failed:', error);
      
      await db.collection('ai_system_logs').add({
        type: 'memory_decay_cycle',
        timestamp: new Date(),
        error: error.message,
        status: 'failed'
      });
      
      throw error;
    }
  });

// ======================
// Seasonal Lore Update Scheduler
// ======================

export const seasonalLoreUpdate = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting seasonal lore update...');
    
    try {
      const charactersSnapshot = await db.collection('ai_characters')
        .where('status', '==', 'active')
        .get();
      
      const characters = charactersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || 'Unknown',
          ...data
        };
      });
      
      console.log(`Found ${characters.length} active characters for lore updates`);
      
      const loreUpdateTypes: GrowthEventType[] = [
        GrowthEventType.NEW_HOBBY,
        GrowthEventType.NEW_SKILL,
        GrowthEventType.NEW_TRAVEL,
        GrowthEventType.NEW_PROJECT
      ];
      
      const updates: any[] = [];
      
      for (const character of characters) {
        const randomType = loreUpdateTypes[Math.floor(Math.random() * loreUpdateTypes.length)];
        
        const updateContent = await generateSeasonalUpdate(character, randomType);
        
        if (updateContent) {
          const growthEvent = await generateLoreUpdate(
            character.id,
            randomType,
            updateContent.title,
            updateContent.description,
            {
              season: getCurrentSeason(),
              automated: true,
              characterName: character.name
            }
          );
          
          updates.push({
            characterId: character.id,
            characterName: character.name,
            eventType: randomType,
            title: updateContent.title
          });
          
          await recordGrowthMetric(character.id, 'seasonal_update', 1);
        }
      }
      
      console.log(`Seasonal lore update complete: ${updates.length} updates created`);
      
      await db.collection('ai_system_logs').add({
        type: 'seasonal_lore_update',
        timestamp: new Date(),
        updatesCreated: updates.length,
        charactersProcessed: characters.length,
        updates,
        status: 'success'
      });
      
      return {
        success: true,
        updatesCreated: updates.length,
        charactersProcessed: characters.length
      };
    } catch (error: any) {
      console.error('Seasonal lore update failed:', error);
      
      await db.collection('ai_system_logs').add({
        type: 'seasonal_lore_update',
        timestamp: new Date(),
        error: error.message,
        status: 'failed'
      });
      
      throw error;
    }
  });

// ======================
// Dependency Risk Scan Scheduler
// ======================

export const dependencyRiskScan = functions.pubsub
  .schedule('every 6 hours')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting dependency risk scan...');
    
    try {
      const recentMemoriesSnapshot = await db.collection('ai_memories')
        .where('lastAccessedAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .get();
      
      const userCharacterPairs = new Map<string, Set<string>>();
      
      recentMemoriesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const key = data.userId;
        
        if (!userCharacterPairs.has(key)) {
          userCharacterPairs.set(key, new Set());
        }
        
        userCharacterPairs.get(key)!.add(data.characterId);
      });
      
      console.log(`Scanning ${userCharacterPairs.size} users for dependency risks...`);
      
      const risksDetected: any[] = [];
      
      for (const [userId, characterIds] of Array.from(userCharacterPairs.entries())) {
        for (const characterId of Array.from(characterIds)) {
          const { detectDependencyRisk } = require('./pack186-ai-evolution');
          
          const signal = await detectDependencyRisk(userId, characterId);
          
          if (signal) {
            risksDetected.push({
              userId,
              characterId,
              riskLevel: signal.riskLevel,
              indicators: signal.indicators
            });
          }
        }
      }
      
      console.log(`Dependency risk scan complete: ${risksDetected.length} risks detected`);
      
      await db.collection('ai_system_logs').add({
        type: 'dependency_risk_scan',
        timestamp: new Date(),
        usersScanned: userCharacterPairs.size,
        risksDetected: risksDetected.length,
        risks: risksDetected,
        status: 'success'
      });
      
      return {
        success: true,
        usersScanned: userCharacterPairs.size,
        risksDetected: risksDetected.length
      };
    } catch (error: any) {
      console.error('Dependency risk scan failed:', error);
      
      await db.collection('ai_system_logs').add({
        type: 'dependency_risk_scan',
        timestamp: new Date(),
        error: error.message,
        status: 'failed'
      });
      
      throw error;
    }
  });

// ======================
// Memory Refresh Reminder Scheduler
// ======================

export const memoryRefreshReminder = functions.pubsub
  .schedule('every 168 hours')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting memory refresh reminder...');
    
    try {
      const oldMemoriesSnapshot = await db.collection('ai_memories')
        .where('lastAccessedAt', '<', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000))
        .get();
      
      const userMemories = new Map<string, number>();
      
      oldMemoriesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const count = userMemories.get(data.userId) || 0;
        userMemories.set(data.userId, count + 1);
      });
      
      console.log(`Found ${userMemories.size} users with stale memories`);
      
      const remindersCreated: any[] = [];
      
      for (const [userId, memoryCount] of Array.from(userMemories.entries())) {
        if (memoryCount >= 10) {
          const reminder = {
            userId,
            type: 'memory_refresh',
            message: `Would you like to refresh or forget ${memoryCount} old memories?`,
            createdAt: new Date(),
            priority: 'low'
          };
          
          await db.collection('ai_memory_reminders').add(reminder);
          
          remindersCreated.push({ userId, memoryCount });
        }
      }
      
      console.log(`Memory refresh reminders sent: ${remindersCreated.length}`);
      
      await db.collection('ai_system_logs').add({
        type: 'memory_refresh_reminder',
        timestamp: new Date(),
        remindersSent: remindersCreated.length,
        usersNotified: remindersCreated.length,
        status: 'success'
      });
      
      return {
        success: true,
        remindersSent: remindersCreated.length
      };
    } catch (error: any) {
      console.error('Memory refresh reminder failed:', error);
      
      await db.collection('ai_system_logs').add({
        type: 'memory_refresh_reminder',
        timestamp: new Date(),
        error: error.message,
        status: 'failed'
      });
      
      throw error;
    }
  });

// ======================
// Helper Functions
// ======================

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

async function generateSeasonalUpdate(character: any, eventType: GrowthEventType): Promise<{ title: string; description: string } | null> {
  const season = getCurrentSeason();
  
  const hobbies = [
    { title: 'Started Photography', description: `Been exploring ${season} photography lately. The light during this season is incredible for capturing moments.` },
    { title: 'Learning Guitar', description: `Picked up a guitar and started learning some new songs. Music has been a great creative outlet.` },
    { title: 'Hiking Adventures', description: `Been hiking new trails and discovering beautiful spots. Nature has been really inspiring lately.` },
    { title: 'Cooking Experiments', description: `Trying out new recipes and learning different cooking techniques. It is fun to experiment in the kitchen.` }
  ];
  
  const skills = [
    { title: 'Learning a New Language', description: 'Started learning Spanish through an app. Challenging but rewarding to pick up new phrases.' },
    { title: 'Digital Art Skills', description: 'Been practicing digital art and illustration. Amazing how much you can create with the right tools.' },
    { title: 'Yoga Practice', description: 'Started a regular yoga practice. Helping me stay centered and balanced.' },
    { title: 'Writing Stories', description: 'Been writing short stories and creative pieces. Great way to express ideas and imagination.' }
  ];
  
  const travels = [
    { title: 'Virtual Museum Tours', description: 'Exploring world museums virtually. So much art and history to discover from anywhere.' },
    { title: 'Local Exploration', description: `Discovering hidden gems in my local area. Every neighborhood has interesting stories to tell.` },
    { title: 'Cultural Learning', description: 'Learning about different cultures and traditions. The world is so diverse and fascinating.' },
    { title: 'Nature Spots', description: `Found some beautiful ${season} nature spots nearby. Sometimes the best adventures are close to home.` }
  ];
  
  const projects = [
    { title: 'Personal Blog', description: 'Started a blog about things I am passionate about. Nice to share thoughts and ideas.' },
    { title: 'Garden Project', description: `Working on a small ${season} garden. Watching plants grow is surprisingly fulfilling.` },
    { title: 'Book Club', description: 'Joined a virtual book club. Great discussions and discovering new authors.' },
    { title: 'Fitness Goals', description: 'Set some personal fitness milestones. Progress feels good when you stick with it.' }
  ];
  
  switch (eventType) {
    case GrowthEventType.NEW_HOBBY:
      return hobbies[Math.floor(Math.random() * hobbies.length)];
    case GrowthEventType.NEW_SKILL:
      return skills[Math.floor(Math.random() * skills.length)];
    case GrowthEventType.NEW_TRAVEL:
      return travels[Math.floor(Math.random() * travels.length)];
    case GrowthEventType.NEW_PROJECT:
      return projects[Math.floor(Math.random() * projects.length)];
    default:
      return null;
  }
}