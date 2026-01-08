/**
 * PACK 300B - Admin Support Dashboard
 * Main support overview with KPIs and quick stats
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TicketStatus,
  TicketPriority,
  TicketType,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from '../../../../../shared/types/support';
import { SupportMetrics } from '../../../../../shared/types/support-300b';

interface DashboardCard {
  title: string;
  value: number;
  change?: number;
  color: string;
  icon: string;
  link?: string;
}

export default function SupportDashboard() {
  const [metrics, setMetrics] = useState<SupportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [timeRange]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      // TODO: Call getSupportMetrics Cloud Function
      // const result = await functions.httpsCallable('getSupportMetrics')({ timeRange });
      
      // Mock data for now
      const mockMetrics: SupportMetrics = {
        openTickets: 23,
        inProgressTickets: 45,
        resolvedToday: 12,
        safetyTickets: 3,
        averageResponseTime: 45,
        averageResolutionTime: 180,
        slaBreaches: 2,
        ticketsByType: {
          GENERAL_QUESTION: 15,
          TECHNICAL_ISSUE: 20,
          PAYMENT_ISSUE: 10,
          PAYOUT_ISSUE: 8,
          ACCOUNT_ACCESS: 5,
          SAFETY_REPORT_FOLLOWUP: 3,
          CONTENT_TAKEDOWN: 2,
          CALENDAR_BOOKING_ISSUE: 4,
          EVENT_ISSUE: 1,
          OTHER: 10,
        },
        ticketsByPriority: {
          LOW: 15,
          NORMAL: 35,
          HIGH: 15,
          CRITICAL: 3,
        },
        timestamp: new Date().toISOString(),
      };

      setMetrics(mockMetrics);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const dashboardCards: DashboardCard[] = [
    {
      title: 'Open Tickets',
      value: metrics?.openTickets || 0,
      color: 'bg-blue-500',
      icon: '📋',
      link: '/admin/support/tickets?status=OPEN',
    },
    {
      title: 'In Progress',
      value: metrics?.inProgressTickets || 0,
      color: 'bg-yellow-500',
      icon: '⚙️',
      link: '/admin/support/tickets?status=IN_PROGRESS',
    },
    {
      title: 'Resolved Today',
      value: metrics?.resolvedToday || 0,
      color: 'bg-green-500',
      icon: '✅',
    },
    {
      title: 'Safety Tickets',
      value: metrics?.safetyTickets || 0,
      color: 'bg-red-500',
      icon: '🚨',
      link: '/admin/support/tickets?safety=true',
    },
    {
      title: 'Avg Response Time',
      value: metrics?.averageResponseTime || 0,
      color: 'bg-purple-500',
      icon: '⏱️',
    },
    {
      title: 'SLA Breaches',
      value: metrics?.slaBreaches || 0,
      color: 'bg-red-600',
      icon: '⚠️',
      link: '/admin/support/tickets?sla_breach=true',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Support Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">
                Last updated: {new Date(metrics?.timestamp || '').toLocaleTimeString()}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Time Range Selector */}
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>

              <Link
                to="/admin/support/tickets"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                View All Tickets
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {dashboardCards.map((card, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              {card.link ? (
                <Link to={card.link} className="block">
                  <CardContent card={card} />
                </Link>
              ) : (
                <CardContent card={card} />
              )}
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Tickets by Type */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tickets by Type</h3>
            <div className="space-y-3">
              {metrics && Object.entries(metrics.ticketsByType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {TICKET_STATUS_LABELS[type as TicketType]?.en || type}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{
                            width: `${(count / Math.max(...Object.values(metrics.ticketsByType))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Tickets by Priority */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tickets by Priority</h3>
            <div className="space-y-3">
              {metrics && Object.entries(metrics.ticketsByPriority)
                .sort((a, b) => {
                  const order = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
                  return order[a[0] as TicketPriority] - order[b[0] as TicketPriority];
                })
                .map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {TICKET_PRIORITY_LABELS[priority as TicketPriority]?.en || priority}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getPriorityColor(priority as TicketPriority)}`}
                          style={{
                            width: `${(count / Math.max(...Object.values(metrics.ticketsByPriority))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/admin/support/tickets?unassigned=true"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
            >
              <span className="text-2xl">📥</span>
              <div>
                <div className="font-medium text-gray-900">Unassigned Tickets</div>
                <div className="text-sm text-gray-500">View tickets needing assignment</div>
              </div>
            </Link>

            <Link
              to="/admin/support/tickets?assignedToMe=true"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
            >
              <span className="text-2xl">👤</span>
              <div>
                <div className="font-medium text-gray-900">My Tickets</div>
                <div className="text-sm text-gray-500">View your assigned tickets</div>
              </div>
            </Link>

            <Link
              to="/admin/support/analytics"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
            >
              <span className="text-2xl">📊</span>
              <div>
                <div className="font-medium text-gray-900">Analytics</div>
                <div className="text-sm text-gray-500">View detailed reports</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for card content
function CardContent({ card }: { card: DashboardCard }) {
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{card.title}</span>
        <span className="text-2xl">{card.icon}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900">{card.value}</div>
      {card.change !== undefined && (
        <div className={`text-sm mt-2 ${card.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {card.change >= 0 ? '↑' : '↓'} {Math.abs(card.change)}% from last period
        </div>
      )}
    </>
  );
}

// Helper function for priority colors
function getPriorityColor(priority: TicketPriority): string {
  const colors = {
    LOW: 'bg-gray-400',
    NORMAL: 'bg-blue-500',
    HIGH: 'bg-orange-500',
    CRITICAL: 'bg-red-600',
  };
  return colors[priority];
}