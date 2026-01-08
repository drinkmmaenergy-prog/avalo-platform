/**
 * PACK 313 - Error Boundary Component
 * 
 * React Error Boundary for graceful error handling
 * Integrates with error tracking system
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
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
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Coś poszło nie tak</Text>
          <Text style={styles.message}>
            Wystąpił nieoczekiwany błąd. Prosimy spróbować ponownie.
          </Text>
          <Text style={styles.messageEn}>
            Something went wrong. Please try again.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReset}
          >
            <Text style={styles.buttonText}>Spróbuj ponownie / Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000',
  },
  message: {
    fontSize: 15,
    marginBottom: 8,
    textAlign: 'center',
    color: '#666',
  },
  messageEn: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    color: '#999',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

// ============================================================================
// ERROR ALERT HELPER
// ============================================================================

/**
 * Show user-friendly error alert
 * 
 * Usage:
 * ```typescript
 * try {
 *   await performAction();
 * } catch (error) {
 *   showErrorAlert(error, locale);
 * }
 * ```
 */
export async function showErrorAlert(
  error: Error | any,
  locale: string = 'en',
  title?: string
): Promise<void> {
  const { Alert } = await import('react-native');
  
  const errorCode = error?.code || error?.message || 'UNKNOWN_ERROR';
  const message = getErrorMessage(errorCode, locale);
  
  const alertTitle = title || (locale === 'pl' ? 'Błąd' : 'Error');
  const okButton = locale === 'pl' ? 'OK' : 'OK';
  
  Alert.alert(alertTitle, message, [{ text: okButton }]);
  
  // Track error
  if (error instanceof Error) {
    ErrorTracking.captureException(error, {
      severity: 'WARN',
      extra: { errorCode, userAlert: true },
    });
  }
}

/**
 * Show error toast (less intrusive than alert)
 */
export function showErrorToast(
  error: Error | any,
  locale: string = 'en'
): void {
  // Simplified version - just log to console
  // Toast can be added if react-native-toast-message is installed
  
  const errorCode = error?.code || error?.message || 'UNKNOWN_ERROR';
  const message = getErrorMessage(errorCode, locale);
  
  console.warn('[Error Toast]', message);
}
