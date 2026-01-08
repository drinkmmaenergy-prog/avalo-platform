#!/usr/bin/env node

/**
 * Avalo Screenshot Generator
 * 
 * Generates marketing screenshots for App Store and Google Play
 * with gradient backgrounds, device frames, and localized captions.
 * 
 * Usage:
 *   node generate-screenshots.js [--locale en|pl] [--platform ios|android]
 * 
 * Requirements:
 *   npm install canvas
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Configuration
const CONFIG = {
  // Dimensions
  ios: {
    width: 1290,
    height: 2796,
    name: 'iPhone 14 Pro Max'
  },
  android: {
    width: 1080,
    height: 2340,
    name: 'Pixel 7 Pro'
  },
  
  // Brand colors
  gradient: {
    start: '#FF6B00',
    middle: '#FF3C8E',
    end: '#7B2EFF'
  },
  
  // Output directory
  outputDir: path.join(__dirname, 'output'),
};

// Screenshot definitions
const SCREENSHOTS = [
  {
    id: '01_hero',
    type: 'hero',
    captions: {
      en: 'Meet, Chat & Earn with Avalo',
      pl: 'Poznaj, rozmawiaj i zarabiaj z Avalo'
    },
    subcaptions: {
      en: 'Where Authentic Connections Pay Off',
      pl: 'Gdzie autentyczne połączenia się opłacają'
    }
  },
  {
    id: '02_discovery',
    type: 'feed',
    captions: {
      en: 'Discover People Nearby',
      pl: 'Odkrywaj ludzi w pobliżu'
    }
  },
  {
    id: '03_chat',
    type: 'chat',
    captions: {
      en: 'Quality Conversations That Matter',
      pl: 'Wartościowe rozmowy, które się liczą'
    }
  },
  {
    id: '04_wallet',
    type: 'wallet',
    captions: {
      en: 'Transparent Token Economy',
      pl: 'Przejrzysta ekonomia tokenów'
    }
  },
  {
    id: '05_ai',
    type: 'ai',
    captions: {
      en: 'Practice with AI Companions',
      pl: 'Ćwicz z asystentami AI'
    }
  },
  {
    id: '06_profile',
    type: 'profile',
    captions: {
      en: 'Build Your Verified Profile',
      pl: 'Zbuduj zweryfikowany profil'
    }
  },
  {
    id: '07_earnings',
    type: 'earnings',
    captions: {
      en: 'Monetize Your Time & Attention',
      pl: 'Monetyzuj swój czas i uwagę'
    }
  },
  {
    id: '08_safety',
    type: 'safety',
    captions: {
      en: 'Safety First, Always',
      pl: 'Bezpieczeństwo na pierwszym miejscu'
    }
  }
];

// Utility: Create gradient
function createGradient(ctx, x, y, width, height, colors) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(0.5, colors.middle);
  gradient.addColorStop(1, colors.end);
  return gradient;
}

// Utility: Draw rounded rectangle
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Utility: Word wrap text
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

// Generate hero screenshot
function generateHero(canvas, ctx, screen, locale, platform) {
  const { width, height } = CONFIG[platform];
  
  // Full gradient background
  const gradient = createGradient(ctx, 0, 0, width, height, CONFIG.gradient);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Logo area (placeholder - in real use, load actual logo)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AVALO', width / 2, height * 0.35);
  
  // Tagline
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '48px sans-serif';
  const lines = wrapText(ctx, screen.subcaptions[locale], width - 160);
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, height * 0.45 + (i * 60));
  });
  
  // Caption bar at bottom
  drawCaptionBar(ctx, screen.captions[locale], width, height, platform);
}

// Generate feed/discovery screenshot
function generateFeed(canvas, ctx, screen, locale, platform) {
  const { width, height } = CONFIG[platform];
  
  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  
  // Gradient top bar
  const barHeight = 200;
  const gradient = createGradient(ctx, 0, 0, width, barHeight, CONFIG.gradient);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, barHeight);
  
  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Discovery', width / 2, barHeight / 2 + 20);
  
  // Profile cards (simplified)
  const cardY = barHeight + 80;
  const cardHeight = 600;
  const cardWidth = width - 120;
  const cardX = 60;
  
  for (let i = 0; i < 2; i++) {
    const y = cardY + (i * (cardHeight + 40));
    
    // Card shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    
    // Card background
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, cardX, y, cardWidth, cardHeight, 32);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // Image placeholder (gradient)
    const imgGradient = createGradient(ctx, cardX, y, cardWidth, 400, CONFIG.gradient);
    ctx.fillStyle = imgGradient;
    ctx.fillRect(cardX, y, cardWidth, 400);
    
    // Name and details
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Alex, 24', cardX + 30, y + 460);
    
    ctx.fillStyle = '#8E8E93';
    ctx.font = '36px sans-serif';
    ctx.fillText('2 km away', cardX + 30, y + 520);
  }
  
  // Caption bar
  drawCaptionBar(ctx, screen.captions[locale], width, height, platform);
}

// Generate chat screenshot
function generateChat(canvas, ctx, screen, locale, platform) {
  const { width, height } = CONFIG[platform];
  
  // Background
  ctx.fillStyle = '#F5F5F7';
  ctx.fillRect(0, 0, width, height);
  
  // Gradient top bar
  const barHeight = 200;
  const gradient = createGradient(ctx, 0, 0, width, barHeight, CONFIG.gradient);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, barHeight);
  
  // Avatar and name
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(width / 2, barHeight / 2 + 20, 50, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Sarah', width / 2, barHeight + 60);
  
  // Chat messages
  const messages = [
    { sender: 'them', text: locale === 'en' ? 'Hey! How are you?' : 'Hej! Jak się masz?' },
    { sender: 'me', text: locale === 'en' ? 'Great! Thanks for asking' : 'Świetnie! Dzięki za pytanie' },
    { sender: 'them', text: locale === 'en' ? 'What do you like to do?' : 'Co lubisz robić?' },
    { sender: 'me', text: locale === 'en' ? 'I love hiking and photography' : 'Uwielbiam wędrówki i fotografię' },
  ];
  
  let messageY = barHeight + 140;
  
  messages.forEach((msg, i) => {
    const isMe = msg.sender === 'me';
    const bubbleWidth = width * 0.7;
    const bubbleX = isMe ? width - bubbleWidth - 60 : 60;
    const bubblePadding = 32;
    
    // Measure text
    ctx.font = '36px sans-serif';
    const lines = wrapText(ctx, msg.text, bubbleWidth - (bubblePadding * 2));
    const textHeight = lines.length * 48 + bubblePadding * 2;
    
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 5;
    
    // Bubble background
    if (isMe) {
      const msgGradient = createGradient(ctx, bubbleX, messageY, bubbleWidth, textHeight, CONFIG.gradient);
      ctx.fillStyle = msgGradient;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    
    drawRoundedRect(ctx, bubbleX, messageY, bubbleWidth, textHeight, 24);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // Text
    ctx.fillStyle = isMe ? '#FFFFFF' : '#111111';
    ctx.textAlign = 'left';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bubbleX + bubblePadding, messageY + bubblePadding + 36 + (idx * 48));
    });
    
    messageY += textHeight + 32;
  });
  
  // Caption bar
  drawCaptionBar(ctx, screen.captions[locale], width, height, platform);
}

// Generate wallet screenshot
function generateWallet(canvas, ctx, screen, locale, platform) {
  const { width, height } = CONFIG[platform];
  
  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  
  // Gradient card
  const cardY = 200;
  const cardHeight = 500;
  const cardWidth = width - 120;
  const cardX = 60;
  
  const gradient = createGradient(ctx, cardX, cardY, cardWidth, cardHeight, CONFIG.gradient);
  ctx.fillStyle = gradient;
  
  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 15;
  
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 32);
  ctx.fill();
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  
  // Balance
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(locale === 'en' ? 'Your Balance' : 'Twoje saldo', width / 2, cardY + 100);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 120px sans-serif';
  ctx.fillText('1,250', width / 2, cardY + 240);
  
  ctx.font = '48px sans-serif';
  ctx.fillText('tokens', width / 2, cardY + 320);
  
  // Transactions list
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(locale === 'en' ? 'Recent Activity' : 'Ostatnia aktywność', cardX, cardY + cardHeight + 120);
  
  // Transaction items
  const transactions = [
    { label: locale === 'en' ? 'Chat with Sarah' : 'Czat z Sarah', amount: '-15' },
    { label: locale === 'en' ? 'Earned from chat' : 'Zarobek z czatu', amount: '+45' },
    { label: locale === 'en' ? 'Tip received' : 'Otrzymany napiwek', amount: '+20' },
  ];
  
  let txY = cardY + cardHeight + 200;
  transactions.forEach(tx => {
    ctx.fillStyle = '#111111';
    ctx.font = '36px sans-serif';
    ctx.fillText(tx.label, cardX, txY);
    
    ctx.fillStyle = tx.amount.startsWith('+') ? '#34C759' : '#FF3B30';
    ctx.textAlign = 'right';
    ctx.fillText(tx.amount, width - cardX, txY);
    ctx.textAlign = 'left';
    
    txY += 90;
  });
  
  // Caption bar
  drawCaptionBar(ctx, screen.captions[locale], width, height, platform);
}

// Generate generic placeholder for other types
function generateGeneric(canvas, ctx, screen, locale, platform) {
  const { width, height } = CONFIG[platform];
  
  // Background with gradient
  const gradient = createGradient(ctx, 0, 0, width, height, CONFIG.gradient);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Center text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = wrapText(ctx, screen.captions[locale], width - 120);
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, height / 2 - ((lines.length - 1) * 40) + (i * 80));
  });
  
  // Type label
  ctx.font = '40px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText(screen.type.toUpperCase(), width / 2, height / 2 + 200);
  
  // Caption bar
  drawCaptionBar(ctx, screen.captions[locale], width, height, platform);
}

// Draw caption bar at bottom
function drawCaptionBar(ctx, caption, width, height, platform) {
  const barHeight = platform === 'ios' ? 400 : 360;
  const barY = height - barHeight;
  
  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, barY, width, barHeight);
  
  // Gradient top edge
  const edgeGradient = ctx.createLinearGradient(0, barY - 100, 0, barY + 40);
  edgeGradient.addColorStop(0, 'rgba(255, 107, 0, 0)');
  edgeGradient.addColorStop(1, 'rgba(255, 107, 0, 0.15)');
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, barY - 100, width, 140);
  
  // Caption text
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = wrapText(ctx, caption, width - 120);
  const totalHeight = lines.length * 80;
  const startY = barY + (barHeight / 2) - (totalHeight / 2) + 30;
  
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + (i * 80));
  });
}

// Generate screenshot based on type
function generateScreenshot(screen, locale, platform) {
  const { width, height } = CONFIG[platform];
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Anti-aliasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Generate based on type
  switch (screen.type) {
    case 'hero':
      generateHero(canvas, ctx, screen, locale, platform);
      break;
    case 'feed':
      generateFeed(canvas, ctx, screen, locale, platform);
      break;
    case 'chat':
      generateChat(canvas, ctx, screen, locale, platform);
      break;
    case 'wallet':
      generateWallet(canvas, ctx, screen, locale, platform);
      break;
    default:
      generateGeneric(canvas, ctx, screen, locale, platform);
  }
  
  return canvas;
}

// Main function
async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const localeArg = args.find(arg => arg.startsWith('--locale='));
  const platformArg = args.find(arg => arg.startsWith('--platform='));
  
  const locales = localeArg ? [localeArg.split('=')[1]] : ['en', 'pl'];
  const platforms = platformArg ? [platformArg.split('=')[1]] : ['ios', 'android'];
  
  // Create output directory
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  console.log('🎨 Avalo Screenshot Generator\n');
  console.log(`Generating screenshots for:`);
  console.log(`- Locales: ${locales.join(', ')}`);
  console.log(`- Platforms: ${platforms.join(', ')}`);
  console.log(`- Output: ${CONFIG.outputDir}\n`);
  
  let generated = 0;
  
  // Generate screenshots
  for (const platform of platforms) {
    for (const locale of locales) {
      for (const screen of SCREENSHOTS) {
        const canvas = generateScreenshot(screen, locale, platform);
        const { width, height } = CONFIG[platform];
        const filename = `avalo_${platform}_${screen.id}_${locale}_${width}x${height}.png`;
        const filepath = path.join(CONFIG.outputDir, filename);
        
        // Save to file
        const buffer = canvas.toBuffer('image/png', { compressionLevel: 9 });
        fs.writeFileSync(filepath, buffer);
        
        generated++;
        console.log(`✓ Generated: ${filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      }
    }
  }
  
  console.log(`\n✨ Done! Generated ${generated} screenshots.`);
  console.log(`📁 Files saved to: ${CONFIG.outputDir}`);
}

// Run
main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});