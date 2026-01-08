'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

const toasts: Toast[] = [];
const listeners: ((toasts: Toast[]) => void)[] = [];

function notify(listeners: ((toasts: Toast[]) => void)[]) {
  listeners.forEach((listener) => listener([...toasts]));
}

export function toast(options: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: Toast = {
    id,
    duration: 5000,
    ...options,
  };

  toasts.push(newToast);
  notify(listeners);

  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => {
      dismiss(id);
    }, newToast.duration);
  }

  return id;
}

export function dismiss(id: string) {
  const index = toasts.findIndex((t) => t.id === id);
  if (index !== -1) {
    toasts.splice(index, 1);
    notify(listeners);
  }
}

export function Toaster() {
  const [toastList, setToastList] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.push(setToastList);
    return () => {
      const index = listeners.indexOf(setToastList);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return (
    <div className="fixed top-0 right-0 z-50 p-4 pointer-events-none">
      <div className="flex flex-col gap-2 items-end">
        <AnimatePresence>
          {toastList.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              className="pointer-events-auto"
            >
              <div
                className={`
                  min-w-[300px] max-w-md rounded-lg shadow-lg p-4 
                  ${toast.type === 'success' ? 'bg-success-500 text-white' : ''}
                  ${toast.type === 'error' ? 'bg-danger-500 text-white' : ''}
                  ${toast.type === 'warning' ? 'bg-accent-500 text-white' : ''}
                  ${toast.type === 'info' ? 'bg-primary-500 text-white' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{toast.title}</h3>
                    {toast.description && (
                      <p className="text-sm opacity-90 mt-1">{toast.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="hover:opacity-70 transition-opacity"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}