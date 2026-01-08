/**
 * PACK 313 - Web Error Boundary Component
 * 
 * React Error Boundary for graceful error handling
 * Integrates with error tracking system
 */

'use client';

import React from 'react';
import ErrorTracking from '../lib/errorTracking';
import { getErrorMessage } from '../lib/errorMessages';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Report to error tracking
    ErrorTracking.errorBoundaryHandler(error, {
      componentStack: errorInfo.componentStack || 'Unknown component stack',
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    // Optionally reload the page
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <h1 style={styles.title}>Coś poszło nie tak</h1>
          <p style={styles.message}>
            Wystąpił nieoczekiwany błąd. Prosimy odświeżyć stronę.
          </p>
          <p style={styles.messageEn}>
            Something went wrong. Please refresh the page.
          </p>
          <button
            style={styles.button}
            onClick={this.handleReset}
          >
            Odśwież stronę / Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '20px',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#000',
  },
  message: {
    fontSize: '16px',
    marginBottom: '8px',
    textAlign: 'center' as const,
    color: '#666',
  },
  messageEn: {
    fontSize: '14px',
    marginBottom: '24px',
    textAlign: 'center' as const,
    color: '#999',
  },
  button: {
    backgroundColor: '#007AFF',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Show error alert (browser alert)
 */
export function showErrorAlert(
  error: Error | any,
  locale: string = 'en',
  title?: string
): void {
  const errorCode = error?.code || error?.message || 'UNKNOWN_ERROR';
  const message = getErrorMessage(errorCode, locale);
  
  const alertTitle = title || (locale === 'pl' ? 'Błąd' : 'Error');
  
  if (typeof window !== 'undefined') {
    window.alert(`${alertTitle}\n\n${message}`);
  }
  
  // Track error
  if (error instanceof Error) {
    ErrorTracking.captureException(error, {
      severity: 'WARN',
      extra: { errorCode, userAlert: true },
    });
  }
}

/**
 * Show error toast (requires toast library to be installed)
 */
export function showErrorToast(
  error: Error | any,
  locale: string = 'en'
): void {
  const errorCode = error?.code || error?.message || 'UNKNOWN_ERROR';
  const message = getErrorMessage(errorCode, locale);
  
  console.warn('[Error Toast]', message);
  
  // If using react-hot-toast or similar:
  // toast.error(message);
}

/**
 * Handle API error response
 */
export function handleApiError(
  error: any,
  locale: string = 'en',
  showToUser: boolean = true
): string {
  const errorCode = error?.code || error?.response?.data?.code || 'UNKNOWN_ERROR';
  const message = getErrorMessage(errorCode, locale);
  
  // Track error
  ErrorTracking.captureException(
    error instanceof Error ? error : new Error(message),
    {
      severity: 'ERROR',
      extra: {
        errorCode,
        statusCode: error?.response?.status,
        url: error?.config?.url,
      },
    }
  );
  
  if (showToUser) {
    console.error('[API Error]', message);
    // Optionally show toast here
  }
  
  return message;
}