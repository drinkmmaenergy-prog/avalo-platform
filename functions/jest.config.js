module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 120000,
  maxWorkers: 1,

  setupFiles: [
    "<rootDir>/tests/setupFirestore.ts"
  ],

  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }]
  },

  moduleFileExtensions: ["ts","js","json"],

  testMatch: [
    "**/tests/**/*.test.ts",
    "**/__tests__/**/*.test.ts",
    "**/*.test.ts"
  ]
};
