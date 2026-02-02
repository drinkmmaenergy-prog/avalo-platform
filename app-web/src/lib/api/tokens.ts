export async function createCheckoutSession() {
  return { url: '/' };
}

export function redirectToCheckout(url: string) {
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}
