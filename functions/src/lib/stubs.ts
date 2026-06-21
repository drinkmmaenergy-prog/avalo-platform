export * from "../stubs";
export type { CallableRequest } from "../runtime";

export async function getCached<T>(
  key: string,
  fn: () => Promise<T>,
  _ttlMs?: number,
  _tags?: string[]
): Promise<T> {
  return fn();
}

export async function invalidateCacheByTags(_tags: string[]): Promise<void> {}

export async function moderateImage(
  _url: string
): Promise<{ safe: boolean; action: "allow" | "block" | "flag"; reason?: string; reasons: string[] }> {
  return { safe: true, action: "allow", reasons: [] };
}

export async function moderateVideo(
  _url: string
): Promise<{ safe: boolean; action: "allow" | "block" | "flag"; reason?: string; reasons: string[] }> {
  return { safe: true, action: "allow", reasons: [] };
}

export const sgMail = {
  setApiKey(_key: string): void {},
  async send(_msg: Record<string, any>): Promise<void> {},
};
