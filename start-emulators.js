// start-emulators.js
const { execSync } = require("child_process");

try {
  console.log("🚀 Starting Firebase emulators manually...");
  execSync(
    'npx firebase emulators:start --project avalo-c8c46 --only auth,firestore,functions',
    { stdio: "inherit" }
  );
} catch (err) {
  console.error("❌ Emulator failed:", err.message);
}
