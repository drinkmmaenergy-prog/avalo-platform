'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { Notification } from '@/types';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const notificationsRef = collection(requireDb(), 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newNotifications: Notification[] = [];
        let unread = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          const notification: Notification = {
            id: doc.id,
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body,
            imageUrl: data.imageUrl,
            actionUrl: data.actionUrl,
            isRead: data.isRead || false,
            createdAt: data.createdAt?.toDate() || new Date(),
          };
          newNotifications.push(notification);
          if (!notification.isRead) unread++;
        });

        setNotifications(newNotifications);
        setUnreadCount(unread);
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.error('[NotificationProvider] Snapshot listener failed:', error);
        }
        setNotifications([]);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const markAsRead = async (notificationId: string) => {
    // Implementation would call Cloud Function
    console.log('Mark as read:', notificationId);
  };

  const markAllAsRead = async () => {
    // Implementation would call Cloud Function
    console.log('Mark all as read');
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

