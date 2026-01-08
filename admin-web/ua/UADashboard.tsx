/**
 * PACK 432 — UA Dashboard
 * Main dashboard for user acquisition overview
 */

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CampaignList from './CampaignList';
import RealTimeMetrics from './RealTimeMetrics';
import CountryHeatmap from './CountryHeatmap';
import CreativePerformance from './CreativePerformance';
import FraudAlerts from './FraudAlerts';
import BudgetAllocator from './BudgetAllocator';

export default function UADashboard() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'meta' | 'tiktok' | 'google'>('all');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">User Acquisition</h1>
          <p className="text-gray-500">Global paid campaign management</p>
        </div>
        
        <div className="flex gap-2">
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          <select 
            value={selectedPlatform} 
            onChange={(e) => setSelectedPlatform(e.target.value as any)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="all">All Platforms</option>
            <option value="meta">Meta (FB/IG)</option>
            <option value="tiktok">TikTok</option>
            <option value="google">Google</option>
          </select>
        </div>
      </div>

      {/* Real-time Metrics */}
      <RealTimeMetrics platform={selectedPlatform} timeRange={timeRange} />

      {/* Main Tabs */}
      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="creatives">Creatives</TabsTrigger>
          <TabsTrigger value="countries">Countries</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="fraud">Fraud</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <CampaignList platform={selectedPlatform} timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="creatives" className="space-y-4">
          <CreativePerformance platform={selectedPlatform} timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="countries" className="space-y-4">
          <CountryHeatmap timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="budget" className="space-y-4">
          <BudgetAllocator />
        </TabsContent>

        <TabsContent value="fraud" className="space-y-4">
          <FraudAlerts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
