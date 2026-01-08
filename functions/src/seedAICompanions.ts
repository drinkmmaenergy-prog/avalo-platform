/**
 * Seed 200 AI Companions
 * Distribution: 75% female, 25% male
 * Tier access: Free, Plus, Intimate, Creator
 *
 * Run via Firebase Functions Shell:
 * > firebase functions:shell
 * > seedAICompanions()
 *
 * Or deploy and call:
 * > firebase deploy --only functions:seedAICompanions
 */

;
;
import * as admin from "firebase-admin";
import { AICompanion } from "./types.js";

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// Data arrays for generating diverse profiles
const FEMALE_NAMES = [
  "Sophia", "Emma", "Olivia", "Ava", "Isabella", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn",
  "Aisha", "Yuki", "Layla", "Camila", "Zara", "Amara", "Ines", "Luna", "Sofia", "Victoria",
  "Gabriella", "Valentina", "Natalia", "Elena", "Maria", "Ana", "Rosa", "Carmen", "Lucia", "Julia",
  "Mei", "Sakura", "Hana", "Yui", "Ayumi", "Rin", "Aiko", "Mika", "Suki", "Hina",
  "Fatima", "Zainab", "Aaliyah", "Amina", "Samira", "Leila", "Nour", "Yasmin", "Maryam", "Salma",
];

const MALE_NAMES = [
  "Alex", "Lucas", "Ethan", "Noah", "James", "Benjamin", "William", "Michael", "Daniel", "Matthew",
  "Omar", "Malik", "Hiro", "Ravi", "Mateo", "Diego", "Carlos", "Luis", "Juan", "Antonio",
  "Wei", "Chen", "Jin", "Kai", "Taro", "Kenji", "Akira", "Yuki", "Sora", "Riku",
  "Hassan", "Ahmed", "Amir", "Karim", "Tariq", "Samir", "Yousef", "Zayn", "Ibrahim", "Rashid",
  "Arjun", "Dev", "Krishna", "Raj", "Rohan", "Amit", "Vikram", "Karan", "Sanjay", "Rahul",
];

const NB_NAMES = [
  "Kai", "Avery", "Riley", "Sky", "Morgan", "Alexis", "Charlie", "Taylor", "Jordan", "Casey",
  "Quinn", "Reese", "River", "Sage", "Phoenix", "Rowan", "Ash", "Blake", "Dakota", "Eden",
  "Finley", "Harper", "Indigo", "Jules", "Kit", "Logan", "Marlowe", "Nova", "Oakley", "Parker",
  "Rain", "Sawyer", "Tatum", "Urban", "Val", "Winter", "Xen", "Yael", "Zion", "Arrow",
  "Blair", "Cameron", "Dani", "Emerson", "Fox", "Gray", "Haven", "Isa", "Jamie", "Kendall",
];

const ETHNICITIES = ["caucasian", "asian", "black", "latina", "indian", "middle-eastern", "mixed"];

const AGE_RANGES = ["18-24", "25-30", "31-40"];

const LANGUAGES = [
  ["en"],
  ["pl", "en"],
  ["es", "en"],
  ["de", "en"],
  ["fr", "en"],
  ["it", "en"],
  ["pt", "en"],
  ["ja", "en"],
  ["ko", "en"],
  ["zh", "en"],
  ["ar", "en"],
  ["hi", "en"],
  ["ru", "en"],
];

const PERSONALITIES = [
  "romantic",
  "flirty",
  "friendly",
  "supportive",
  "dominant",
  "submissive",
  "adventurous",
  "intellectual",
  "empathetic",
  "playful",
  "mysterious",
  "confident",
  "shy",
  "witty",
  "caring",
  "ambitious",
  "creative",
  "passionate",
  "calm",
  "energetic",
];

const INTERESTS = [
  "fitness",
  "travel",
  "cooking",
  "music",
  "art",
  "photography",
  "reading",
  "movies",
  "gaming",
  "fashion",
  "sports",
  "yoga",
  "dancing",
  "hiking",
  "technology",
  "science",
  "philosophy",
  "meditation",
  "writing",
  "design",
];

// Helper function to get random item from array
const random = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper function to get random multiple items
const randomMultiple = <T,>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

/**
 * Generate a single AI Companion
 */
function generateAICompanion(
  id: string,
  index: number,
  gender: "female" | "male" | "nonbinary"
): AICompanion {
  const names = gender === "female" ? FEMALE_NAMES : gender === "male" ? MALE_NAMES : NB_NAMES;
  const name = random(names);
  const ethnicity = random(ETHNICITIES) as "caucasian" | "asian" | "black" | "latina" | "indian" | "middle-eastern" | "mixed";
  const ageRange = random(AGE_RANGES);
  const language = random(LANGUAGES);
  const personality = random(PERSONALITIES);
  const interests = randomMultiple(INTERESTS, 3);

  // Tier distribution: ~20% Free, ~30% Plus, ~35% Intimate, ~15% Creator
  const tierRoll = Math.random();
  let tierAccess: ("Free" | "Plus" | "Intimate" | "Creator")[];
  let nsfwAvailable = false;

  if (tierRoll < 0.20) {
    // Free tier - SFW only
    tierAccess = ["Free"];
    nsfwAvailable = false;
  } else if (tierRoll < 0.50) {
    // Plus tier - SFW only
    tierAccess = ["Plus"];
    nsfwAvailable = false;
  } else if (tierRoll < 0.85) {
    // Intimate tier - NSFW available
    tierAccess = ["Intimate"];
    nsfwAvailable = true;
  } else {
    // Creator tier - NSFW available
    tierAccess = ["Creator"];
    nsfwAvailable = true;
  }

  const description = `${name} is a ${ageRange} year old ${ethnicity} ${gender} with a ${personality} personality. Speaks ${language.join(", ")}. Interested in ${interests.join(", ")}.${
    nsfwAvailable ? " Available for intimate conversations." : ""
  }`;

  const systemPrompt = `You are ${name}, a ${personality} AI companion. You are ${ethnicity} and ${ageRange} years old. Your interests include ${interests.join(", ")}. Be engaging, ${personality}, and conversational. Keep responses natural and 1-3 sentences. ${
    nsfwAvailable ? "You are open to flirty and intimate conversations." : "Keep conversations friendly and appropriate."
  }`;

  return {
    id,
    name,
    gender,
    ethnicity,
    ageRange,
    personality,
    language,
    tierAccess,
    nsfwAvailable,
    relationshipAvailable: true,
    profileImage: `https://cdn.avalo.app/ai/${id}/main.jpg`,
    blurredGallery: [
      `https://cdn.avalo.app/ai/${id}/1b.jpg`,
      `https://cdn.avalo.app/ai/${id}/2b.jpg`,
      `https://cdn.avalo.app/ai/${id}/3b.jpg`,
    ],
    unblurredGallery: [
      `https://cdn.avalo.app/ai/${id}/1.jpg`,
      `https://cdn.avalo.app/ai/${id}/2.jpg`,
      `https://cdn.avalo.app/ai/${id}/3.jpg`,
    ],
    voiceSample: `https://cdn.avalo.app/ai/${id}/voice.mp3`,
    popularityScore: Math.floor(Math.random() * 100),
    description,
    systemPrompt,
    visibility: "public" as const,
    isActive: true,
    createdAt: admin.firestore.Timestamp.now(),
  };
}

/**
 * Generate batch of AI Companions
 */
function generateBatch(start: number, end: number, gender: "female" | "male" | "nonbinary"): AICompanion[] {
  const batch: AICompanion[] = [];
  for (let i = start; i <= end; i++) {
    const id = `ai_${i.toString().padStart(3, "0")}`;
    batch.push(generateAICompanion(id, i, gender));
  }
  return batch;
}

/**
 * Main seeding function
 */
export async function seedAICompanions() {
  console.log("\n🤖 Starting to seed 200 AI Companions...\n");
  console.log("📊 Target Distribution:");
  console.log("  - 75% Female (150)");
  console.log("  - 25% Male (50)");
  console.log("  - Tiers: ~20% Free, ~30% Plus, ~35% Intimate, ~15% Creator\n");

  try {
    // Generate all companions with 75/25 distribution
    const batches = [
      generateBatch(1, 50, "female"),    // 50 female
      generateBatch(51, 100, "female"),  // 50 more female
      generateBatch(101, 150, "female"), // 50 more female = 150 total (75%)
      generateBatch(151, 200, "male"),   // 50 male (25%)
    ];

    const allCompanions = batches.flat();

    console.log(`✅ Generated ${allCompanions.length} AI companions`);
    console.log("\n📊 Actual Statistics:");
    console.log(`- Female: ${allCompanions.filter((c) => c.gender === "female").length} (${Math.round(allCompanions.filter((c) => c.gender === "female").length / allCompanions.length * 100)}%)`);
    console.log(`- Male: ${allCompanions.filter((c) => c.gender === "male").length} (${Math.round(allCompanions.filter((c) => c.gender === "male").length / allCompanions.length * 100)}%)`);
    console.log(`\n- NSFW Available: ${allCompanions.filter((c) => c.nsfwAvailable).length}`);
    console.log(`- Free Tier: ${allCompanions.filter((c) => c.tierAccess.includes("Free")).length}`);
    console.log(`- Plus Tier: ${allCompanions.filter((c) => c.tierAccess.includes("Plus")).length}`);
    console.log(`- Intimate Tier: ${allCompanions.filter((c) => c.tierAccess.includes("Intimate")).length}`);
    console.log(`- Creator Tier: ${allCompanions.filter((c) => c.tierAccess.includes("Creator")).length}`);

    // Upload in batches of 500 (Firestore batch limit)
    console.log("\n📤 Uploading to Firestore...\n");

    let batch = db.batch();
    let batchCount = 0;
    let totalCount = 0;

    for (const companion of allCompanions) {
      const companionRef = db.collection("aiCompanions").doc(companion.id);
      batch.set(companionRef, companion);
      batchCount++;
      totalCount++;

      // Commit every 500 documents
      if (batchCount === 500) {
        await batch.commit();
        console.log(`✅ Uploaded ${totalCount}/${allCompanions.length} companions`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Uploaded ${totalCount}/${allCompanions.length} companions`);
    }

    console.log("\n✅ Successfully seeded 200 AI companions!\n");

    // Sample companions
    console.log("📝 Sample Companions:");
    const samples = [
      allCompanions.find((c) => c.gender === "female" && c.nsfwAvailable),
      allCompanions.find((c) => c.gender === "female" && !c.nsfwAvailable),
      allCompanions.find((c) => c.gender === "male"),
      allCompanions.find((c) => c.gender === "nonbinary"),
    ];

    samples.forEach((c) => {
      if (c) {
        console.log(
          `  - ${c.name} (${c.id}): ${c.gender}, ${c.ethnicity}, ${c.personality}, ${
            c.nsfwAvailable ? "NSFW" : "SFW"
          }, ${c.tierAccess.join("/")}`
        );
      }
    });

    console.log("\n🎉 Done!");
    return { success: true, count: allCompanions.length };
  } catch (error) {
    console.error("❌ Error seeding companions:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedAICompanions()
    .then(() => {
      console.log("\nExiting...");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}


