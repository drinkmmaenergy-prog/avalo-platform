/**
 * React Hook for Daily Tasks
 * Provides convenient access to daily tasks state and actions
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDailyTasks,
  markTaskCompleted,
  resetTasksForToday,
  DailyTask,
  DailyTasksState,
} from '../services/dailyTasksService';

export interface UseDailyTasksResult {
  tasks: DailyTask[];
  completedCount: number;
  totalCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  markCompleted: (taskId: string) => Promise<void>;
}

/**
 * Hook to access daily tasks for a user
 * @param userId - The user ID to fetch tasks for
 * @returns Daily tasks state and actions
 */
export function useDailyTasks(userId: string): UseDailyTasksResult {
  const [state, setState] = useState<DailyTasksState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load tasks on mount and when userId changes
  const loadTasks = useCallback(async () => {
    if (!userId) {
      setState(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const tasksState = await getDailyTasks(userId);
      setState(tasksState);
    } catch (err) {
      console.error('Error loading daily tasks:', err);
      setError(err instanceof Error ? err : new Error('Failed to load tasks'));
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Refresh tasks (regenerate for today)
  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const tasksState = await resetTasksForToday(userId);
      setState(tasksState);
    } catch (err) {
      console.error('Error refreshing daily tasks:', err);
      setError(err instanceof Error ? err : new Error('Failed to refresh tasks'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Mark a task as completed
  const markCompleted = useCallback(async (taskId: string) => {
    if (!userId || !state) return;

    try {
      await markTaskCompleted(userId, taskId);
      
      // Update local state optimistically
      setState(prevState => {
        if (!prevState) return prevState;
        
        return {
          ...prevState,
          tasks: prevState.tasks.map(task =>
            task.id === taskId ? { ...task, completed: true } : task
          ),
        };
      });
    } catch (err) {
      console.error('Error marking task as completed:', err);
      setError(err instanceof Error ? err : new Error('Failed to mark task as completed'));
    }
  }, [userId, state]);

  // Derive computed values
  const tasks = state?.tasks || [];
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  return {
    tasks,
    completedCount,
    totalCount,
    loading,
    error,
    refresh,
    markCompleted,
  };
}