/**
 * Toast Context
 * Phase 27: Global toast notification management
 */

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Toast, ToastType } from '../components/Toast';

interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (config: ToastConfig) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [duration, setDuration] = useState(3000);

  const showToast = useCallback((config: ToastConfig) => {
    if (visible) {
      setVisible(false);
      setTimeout(() => {
        setMessage(config.message);
        setType(config.type || 'info');
        setDuration(config.duration || 3000);
        setVisible(true);
      }, 100);
    } else {
      setMessage(config.message);
      setType(config.type || 'info');
      setDuration(config.duration || 3000);
      setVisible(true);
    }
  }, [visible]);

  const showSuccess = useCallback((message: string) => {
    showToast({ message, type: 'success' });
  }, [showToast]);

  const showError = useCallback((message: string) => {
    showToast({ message, type: 'error' });
  }, [showToast]);

  const showInfo = useCallback((message: string) => {
    showToast({ message, type: 'info' });
  }, [showToast]);

  const showWarning = useCallback((message: string) => {
    showToast({ message, type: 'warning' });
  }, [showToast]);

  const handleHide = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showInfo,
        showWarning,
      }}
    >
      {children}
      <Toast
        message={message}
        type={type}
        duration={duration}
        visible={visible}
        onHide={handleHide}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
