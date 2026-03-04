type ErrorBoundaryContext = {
  componentStack?: string;
};

type CaptureExceptionOptions = {
  severity?: 'INFO' | 'WARN' | 'ERROR' | string;
  extra?: Record<string, unknown>;
};

const ErrorTracking = {
  capture(error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorTracking.capture]', error);
    }
  },

  captureException(error: unknown, options?: CaptureExceptionOptions) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorTracking.captureException]', {
        error,
        severity: options?.severity,
        extra: options?.extra,
      });
    }
  },

  errorBoundaryHandler(error: unknown, context?: ErrorBoundaryContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error);
      if (context?.componentStack) {
        console.error('[ComponentStack]', context.componentStack);
      }
    }
  },
};

export default ErrorTracking;

