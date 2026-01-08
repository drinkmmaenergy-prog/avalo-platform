;
;
declare module '@stripe/stripe-js' {
  export interface StripeConstructorOptions {
    apiVersion?: string;
    stripeAccount?: string;
  }

  export interface Stripe {
    elements(options?: any): StripeElements;
    confirmCardPayment(clientSecret: string, data?: any): Promise<PaymentIntentResult>;
    createPaymentMethod(data: any): Promise<PaymentMethodResult>;
  }

  export interface StripeElements {
    create(type: string, options?: any): StripeElement;
    getElement(type: string): StripeElement | null;
  }

  export interface StripeElement {
    mount(domElement: string | HTMLElement): void;
    unmount(): void;
    destroy(): void;
    update(options: any): void;
    on(event: string, handler: (event: any) => void): void;
  }

  export interface PaymentIntentResult {
    paymentIntent?: PaymentIntent;
    error?: StripeError;
  }

  export interface PaymentMethodResult {
    paymentMethod?: PaymentMethod;
    error?: StripeError;
  }

  export interface PaymentIntent {
    id: string;
    amount: number;
    currency: string;
    status: string;
    client_secret: string;
  }

  export interface PaymentMethod {
    id: string;
    type: string;
    card?: {
      brand: string;
      last4: string;
      exp_month: number;
      exp_year: number;
    };
  }

  export interface StripeError {
    type: string;
    code?: string;
    message: string;
    param?: string;
  }

  export function loadStripe(publishableKey: string, options?: StripeConstructorOptions): Promise<Stripe | null>;
}

