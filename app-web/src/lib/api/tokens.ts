export interface CreateCheckoutSessionInput {
  packageId: string;
  userId?: string;
  source?: 'app' | 'web';
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
  return { success: true, checkoutUrl: '/' };
}

export function redirectToCheckout(url: string) {
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}
