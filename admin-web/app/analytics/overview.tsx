/**
 * PACK 410 - Analytics Overview Dashboard
 * Main KPI dashboard for executives and admins
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Activity,
  Shield,
  Download,
  RefreshCw,
} from 'lucide-react';

interface KPISnapshot {
  timestamp: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  dau: number;
  wau: number;
  mau: number;
  newUsers: number;
  churnRate: number;
  growthVelocity: number;
  revenueDaily: number;
  revenueMonthly: number;
  arpu: number;
  arppu: number;
  conversionToPaid: number;
  tokensBurned: number;
  tokensEarned: number;
  tokenBalance: number;
  tokenVelocity: number;
  activeCreators: number;
  creatorEarnings: number;
  avgCreatorRevenue: number;
  aiRevenue: number;
  aiInteractions: number;
  aiRevenueShare: number;
  fraudRate: number;
  safetyIncidents: number;
  accountSuspensions: number;
  calendarUtilization: number;
  chatMonetizationYield: number;
  avgSessionLength: number;
  platformHealthScore: number;
  creatorEconomyScore: number;
  trustSafetyScore: number;
  liquidityScore: number;
}

export default function AnalyticsOverview() {
  const [kpiData, setKpiData] = useState<KPISnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    fetchKPIData();
  }, [period]);

  const fetchKPIData = async () => {
    setLoading(true);
    try {
      // Call Firebase function to get dashboard data
      const response = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data = await response.json();
      setKpiData(data.data);
    } catch (error) {
      console.error('Failed to fetch KPI data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrendIcon = (value: number) => {
    return value >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!kpiData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Analytics Command Center</h1>
          <p className="text-muted-foreground">
            Real-time insights into Avalo's performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchKPIData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Composite Scores */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Platform Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getScoreColor(kpiData.platformHealthScore)}`}>
              {kpiData.platformHealthScore.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall system health</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Creator Economy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getScoreColor(kpiData.creatorEconomyScore)}`}>
              {kpiData.creatorEconomyScore.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Creator satisfaction</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Trust & Safety</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getScoreColor(kpiData.trustSafetyScore)}`}>
              {kpiData.trustSafetyScore.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Safety score</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Liquidity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getScoreColor(kpiData.liquidityScore)}`}>
              {kpiData.liquidityScore.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Financial health</p>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">DAU</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(kpiData.dau)}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {getTrendIcon(kpiData.growthVelocity)}
              <span className="ml-1">{formatPercent(kpiData.growthVelocity)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpiData.revenueDaily)}</div>
            <p className="text-xs text-muted-foreground mt-1">Daily revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">ARPU</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpiData.arpu)}</div>
            <p className="text-xs text-muted-foreground mt-1">Avg revenue/user</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversion</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(kpiData.conversionToPaid)}</div>
            <p className="text-xs text-muted-foreground mt-1">To paid users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(kpiData.churnRate)}</div>
            <p className="text-xs text-muted-foreground mt-1">User churn</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fraud Rate</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(kpiData.fraudRate)}</div>
            <p className="text-xs text-muted-foreground mt-1">Fraud incidents</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Sections */}
      <Tabs defaultValue="growth" className="space-y-4">
        <TabsList>
          <TabsTrigger value="growth">Growth</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="creators">Creators</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="safety">Safety</TabsTrigger>
        </TabsList>

        <TabsContent value="growth" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>User Growth</CardTitle>
                <CardDescription>Active users over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">MAU:</span>
                    <span className="font-bold">{formatNumber(kpiData.mau)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">WAU:</span>
                    <span className="font-bold">{formatNumber(kpiData.wau)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">DAU:</span>
                    <span className="font-bold">{formatNumber(kpiData.dau)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">New Users:</span>
                    <span className="font-bold">{formatNumber(kpiData.newUsers)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
                <CardDescription>User engagement indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Avg Session Length:</span>
                    <span className="font-bold">{kpiData.avgSessionLength.toFixed(1)} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Calendar Utilization:</span>
                    <span className="font-bold">{formatPercent(kpiData.calendarUtilization)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Chat Monetization:</span>
                    <span className="font-bold">{formatCurrency(kpiData.chatMonetizationYield)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Daily:</span>
                  <span className="font-bold">{formatCurrency(kpiData.revenueDaily)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Monthly:</span>
                  <span className="font-bold">{formatCurrency(kpiData.revenueMonthly)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">ARPU:</span>
                  <span className="font-bold">{formatCurrency(kpiData.arpu)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">ARPPU:</span>
                  <span className="font-bold">{formatCurrency(kpiData.arppu)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Token Economy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Tokens Burned:</span>
                  <span className="font-bold">{formatNumber(kpiData.tokensBurned)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Tokens Earned:</span>
                  <span className="font-bold">{formatNumber(kpiData.tokensEarned)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Balance:</span>
                  <span className="font-bold">{formatNumber(kpiData.tokenBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Velocity:</span>
                  <span className="font-bold">{kpiData.tokenVelocity.toFixed(2)}x</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">To Paid:</span>
                  <span className="font-bold">{formatPercent(kpiData.conversionToPaid)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="creators" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Creator Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Active Creators:</span>
                  <span className="font-bold">{formatNumber(kpiData.activeCreators)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Total Earnings:</span>
                  <span className="font-bold">{formatCurrency(kpiData.creatorEarnings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Avg Revenue:</span>
                  <span className="font-bold">{formatCurrency(kpiData.avgCreatorRevenue)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>AI Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">AI Revenue:</span>
                  <span className="font-bold">{formatCurrency(kpiData.aiRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Interactions:</span>
                  <span className="font-bold">{formatNumber(kpiData.aiInteractions)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Revenue Share:</span>
                  <span className="font-bold">{formatPercent(kpiData.aiRevenueShare)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="safety" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Safety Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Fraud Rate:</span>
                  <span className="font-bold text-red-600">{formatPercent(kpiData.fraudRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Safety Incidents:</span>
                  <span className="font-bold text-yellow-600">{formatNumber(kpiData.safetyIncidents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Suspensions:</span>
                  <span className="font-bold">{formatNumber(kpiData.accountSuspensions)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
