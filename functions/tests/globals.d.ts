export {}

declare global {
  var getDb: () => any
  var setupTestEnvironment: () => Promise<void>
  var testData: { generateUserId: () => string }
  var createTestUser: (id: string, data?: any) => Promise<any>
  var createTestTransaction: (userId: string, amount: number, type: string) => Promise<void>
  var now: () => any
  var minutesAgo: (m: number) => any
  var hoursAgo: (h: number) => any
  var daysAgo: (d: number) => any
}
