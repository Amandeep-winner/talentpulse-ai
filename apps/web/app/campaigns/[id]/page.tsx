'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CampaignItem,
  CampaignPublisherItem,
  CampaignStatus,
  PublisherItem,
  PublisherPerformance,
  CampaignSimulateResponse,
  PredictApplicationResponse,
} from '@talentpulse/shared';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  TrendingUp,
  Percent,
  Play,
  Sliders,
  AlertCircle,
  CheckCircle2,
  Share2,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

const STATUS_BADGES: Record<CampaignStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
};

const DONUT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

function TrendDelta({ delta, invert = false }: { delta: number | null | undefined; invert?: boolean }) {
  if (delta === null || delta === undefined) {
    return <span className="text-gray-500 text-xs font-mono">-</span>;
  }
  const isZero = Math.abs(delta) < 0.05;
  const isPositive = delta > 0;
  // For cost metrics (CPA, CPC, CPH, CPQA), a reduction in cost is good (green)
  const isGood = invert ? delta < 0 : delta > 0;
  const color = isZero ? 'text-gray-400' : isGood ? 'text-emerald-400' : 'text-rose-400';
  const Icon = isZero ? null : isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center text-xs font-mono font-medium ${color}`}>
      {Icon && <Icon className="h-3 w-3 mr-0.5 inline-block" />}
      {isPositive ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
}

const formatCurrency = (val: number | null | undefined) => {
  if (val === null || val === undefined) return '-';
  return `₹${Math.round(val).toLocaleString()}`;
};

const formatPercent = (val: number | null | undefined) => {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(1)}%`;
};

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const { user } = useAuth();
  const { addToast } = useToast();

  const [campaign, setCampaign] = React.useState<CampaignItem | null>(null);
  const [publishers, setPublishers] = React.useState<PublisherItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Tabs: overview vs performance
  const [activeTab, setActiveTab] = React.useState<'overview' | 'performance'>('overview');
  const [perfRangeDays, setPerfRangeDays] = React.useState<number>(7);
  const [publisherAnalytics, setPublisherAnalytics] = React.useState<PublisherPerformance[]>([]);
  const [isLoadingPerf, setIsLoadingPerf] = React.useState<boolean>(false);

  // Allocations Editor Dialog
  const [isAllocOpen, setIsAllocOpen] = React.useState(false);
  const [allocDraft, setAllocDraft] = React.useState<
    Array<{ publisherId: string; allocationPct: number; bidCpc: number; dailyBudget: number }>
  >([]);
  const [isSavingAlloc, setIsSavingAlloc] = React.useState(false);

  // Simulation Dialog
  const [isSimOpen, setIsSimOpen] = React.useState(false);
  const [simDays, setSimDays] = React.useState(7);
  const [isSimulating, setIsSimulating] = React.useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';

  // Predictive Intelligence State (Task 21)
  const [predictedConvs, setPredictedConvs] = React.useState<Record<string, PredictApplicationResponse>>({});
  const [isPredictingApp, setIsPredictingApp] = React.useState(false);

  const fetchApplicationPredictions = React.useCallback(async (camp: CampaignItem) => {
    if (!camp?.publishers || camp.publishers.length === 0) return;
    setIsPredictingApp(true);
    try {
      const jobCat = camp.job?.category || 'ENGINEERING';
      const expReq = camp.job?.minExperienceYears ?? 3;
      const locTier = camp.job?.remote ? 'remote' : 'tier_1';
      const dayOfWeek = new Date().getDay();

      const predictions: Record<string, PredictApplicationResponse> = {};

      await Promise.all(
        camp.publishers.map(async (cp) => {
          try {
            const res = await api.post<{ data: PredictApplicationResponse }>('/api/ml/predict/application', {
              jobCategory: jobCat,
              experienceReq: expReq,
              locationTier: locTier,
              publisherType: cp.publisher?.type?.toLowerCase() || 'job_board',
              historicalCtr: 0.045,
              historicalCpa: 120.0,
              historicalConv: 0.15,
              dayOfWeek,
              bid: Number(cp.bidCpc) || 20,
              budget: Number(cp.dailyBudget) || Number(camp.budget) || 1000,
            });
            predictions[cp.publisherId] = res.data;
          } catch {
            // Graceful fallback
          }
        })
      );

      setPredictedConvs(predictions);
    } catch {
      // Graceful fallback
    } finally {
      setIsPredictingApp(false);
    }
  }, []);

  const fetchCampaign = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [campRes, pubRes] = await Promise.all([
        api.get<{ data: CampaignItem }>(`/api/campaigns/${campaignId}`),
        api.get<{ data: PublisherItem[] }>('/api/publishers'),
      ]);
      setCampaign(campRes.data);
      setPublishers(pubRes.data);
      fetchApplicationPredictions(campRes.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load campaign';
      addToast({ title: 'Error', description: msg, variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, addToast, fetchApplicationPredictions]);

  const fetchPublisherAnalytics = React.useCallback(async () => {
    if (!campaignId) return;
    setIsLoadingPerf(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - perfRangeDays * 24 * 60 * 60 * 1000);
      const res = await api.get<{ data: PublisherPerformance[] }>(
        `/api/analytics/publishers?campaignId=${campaignId}&from=${from.toISOString()}&to=${to.toISOString()}`
      );
      setPublisherAnalytics(res.data || []);
    } catch (err: unknown) {
      console.error('Failed to load publisher analytics:', err);
    } finally {
      setIsLoadingPerf(false);
    }
  }, [campaignId, perfRangeDays]);

  React.useEffect(() => {
    if (campaignId) {
      fetchCampaign();
    }
  }, [campaignId, fetchCampaign]);

  React.useEffect(() => {
    if (activeTab === 'performance') {
      fetchPublisherAnalytics();
    }
  }, [activeTab, fetchPublisherAnalytics]);

  // Open Allocations Editor
  const handleOpenAllocations = () => {
    if (!campaign) return;
    const current = (campaign.publishers || []).map((cp) => ({
      publisherId: cp.publisherId,
      allocationPct: cp.allocationPct,
      bidCpc: cp.bidCpc,
      dailyBudget: cp.dailyBudget,
    }));

    // If empty, initialize with all publishers
    if (current.length === 0 && publishers.length > 0) {
      const evenSplit = Math.floor(100 / publishers.length);
      const remainder = 100 - evenSplit * publishers.length;
      const initial = publishers.map((p, idx) => ({
        publisherId: p.id,
        allocationPct: evenSplit + (idx === 0 ? remainder : 0),
        bidCpc: 20,
        dailyBudget: Math.round(Number(campaign.budget) / 30 / publishers.length),
      }));
      setAllocDraft(initial);
    } else {
      setAllocDraft(current);
    }
    setIsAllocOpen(true);
  };

  // Allocations total sum validation
  const allocSum = allocDraft.reduce((acc, curr) => acc + (curr.allocationPct || 0), 0);
  const isAllocSumValid = Math.abs(allocSum - 100) < 0.01;

  // Save Allocations
  const handleSaveAllocations = async () => {
    if (!isAllocSumValid) {
      addToast({
        title: 'Validation Error',
        description: `Allocation percentages must sum to exactly 100%. Current sum: ${allocSum.toFixed(1)}%`,
        variant: 'danger',
      });
      return;
    }

    setIsSavingAlloc(true);
    try {
      await api.put(`/api/campaigns/${campaignId}/allocations`, {
        allocations: allocDraft,
      });
      addToast({
        title: 'Allocations Updated',
        description: 'Publisher channel allocations have been successfully saved.',
        variant: 'success',
      });
      setIsAllocOpen(false);
      await fetchCampaign();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update allocations';
      addToast({ title: 'Error', description: msg, variant: 'danger' });
    } finally {
      setIsSavingAlloc(false);
    }
  };

  // Run Simulation
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await api.post<{ data: CampaignSimulateResponse }>(
        `/api/campaigns/${campaignId}/simulate`,
        {
          days: simDays,
          seed: Math.floor(Math.random() * 100000),
        }
      );
      addToast({
        title: 'Simulation Complete',
        description: `Generated traffic events and spend records for ${res.data.days} days.`,
        variant: 'success',
      });
      setIsSimOpen(false);
      await fetchCampaign();
      if (activeTab === 'performance') {
        await fetchPublisherAnalytics();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulation failed';
      addToast({ title: 'Error', description: msg, variant: 'danger' });
    } finally {
      setIsSimulating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12 space-y-4">
        <h2 className="text-xl font-bold text-gray-200">Campaign Not Found</h2>
        <Link href="/campaigns">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
        </Link>
      </div>
    );
  }

  // Pacing calculations
  const startDate = new Date(campaign.startDate);
  const now = new Date();
  const endDate = campaign.endDate ? new Date(campaign.endDate) : new Date(startDate.getTime() + 90 * 86400000);
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - startDate.getTime()) / 86400000)));
  const progressRatio = elapsedDays / totalDays;
  const calculatedDailyBudget = campaign.budget / totalDays;

  // Donut data
  const donutData = (campaign.publishers || []).map((cp) => ({
    name: cp.publisher?.name || 'Publisher',
    value: Number(cp.allocationPct),
  }));

  const totalAllocatedDailyBudget = (campaign.publishers || []).reduce(
    (sum, cp) => sum + Number(cp.dailyBudget || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/campaigns" className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-white">{campaign.name}</h1>
            <Badge variant={STATUS_BADGES[campaign.status]}>{campaign.status}</Badge>
          </div>
          {campaign.job && (
            <p className="text-sm text-gray-400">
              Target Requisition:{' '}
              <Link href={`/jobs/${campaign.job.id}`} className="text-blue-400 hover:underline">
                {campaign.job.title}
              </Link>{' '}
              ({campaign.job.location})
            </p>
          )}
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAllocations}
              data-testid="btn-edit-allocations"
            >
              <Sliders className="h-4 w-4 mr-2" />
              Edit Allocations
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsSimOpen(true)}
              data-testid="btn-simulate-campaign"
            >
              <Play className="h-4 w-4 mr-2" />
              Simulate Performance
            </Button>
          </div>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          data-testid="tab-overview"
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <PieChartIcon className="h-3.5 w-3.5" />
          Overview & Allocations
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          data-testid="tab-performance"
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'performance'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Performance & Analytics
        </button>
      </div>

      {/* TAB 1: OVERVIEW & ALLOCATIONS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards: Budget, Daily Budget, Pacing, Timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-[#0E131F] border-gray-800 p-4">
              <CardContent className="p-0 space-y-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-blue-400" />
                  Total Budget
                </span>
                <div className="text-2xl font-bold text-white">₹{campaign.budget.toLocaleString()}</div>
                <p className="text-xs text-gray-400">Campaign ceiling</p>
              </CardContent>
            </Card>

            <Card className="bg-[#0E131F] border-gray-800 p-4">
              <CardContent className="p-0 space-y-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                  Daily Budget
                </span>
                <div className="text-2xl font-bold text-white">
                  ₹{Math.round(totalAllocatedDailyBudget || calculatedDailyBudget).toLocaleString()}
                </div>
                <p className="text-xs text-gray-400">
                  {totalAllocatedDailyBudget > 0
                    ? 'Sum of publisher limits'
                    : `₹${Math.round(calculatedDailyBudget)} target/day`}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0E131F] border-gray-800 p-4">
              <CardContent className="p-0 space-y-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-amber-400" />
                  Campaign Pacing
                </span>
                <div className="text-2xl font-bold text-white">
                  {Math.round(progressRatio * 100)}%
                </div>
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {elapsedDays} of {totalDays} days elapsed (On Track)
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0E131F] border-gray-800 p-4">
              <CardContent className="p-0 space-y-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-purple-400" />
                  Timeline
                </span>
                <div className="text-sm font-semibold text-white pt-1">
                  {startDate.toLocaleDateString()}
                </div>
                <p className="text-xs text-gray-400">
                  Ending {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'Continuous (90d)'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Allocation Donut & Publisher Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Allocation Donut Chart */}
            <Card className="bg-[#0E131F] border-gray-800 p-5">
              <div className="text-sm font-semibold text-gray-200 mb-2 flex items-center gap-2">
                <Share2 className="h-4 w-4 text-blue-400" />
                Channel Allocation Share
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Target spend proportion across integrated marketing networks
              </p>

              {donutData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-gray-500">
                  No publisher allocations configured
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111827',
                          borderColor: '#374151',
                          fontSize: '12px',
                        }}
                        formatter={(val) => [`${val ?? 0}%`, 'Allocation']}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                        formatter={(value) => <span className="text-gray-300">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Publisher Allocations Table */}
            <Card className="bg-[#0E131F] border-gray-800 p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-gray-200">Publisher Channels</div>
                  <p className="text-xs text-gray-400">Current allocation, bid, and daily spend limits</p>
                </div>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={handleOpenAllocations}>
                    <Sliders className="h-3.5 w-3.5 mr-1.5" />
                    Adjust
                  </Button>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-gray-400">Channel</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-gray-400 text-right">Allocation (%)</TableHead>
                    <TableHead className="text-gray-400 text-right">Bid CPC (₹)</TableHead>
                    <TableHead className="text-gray-400 text-right">Daily Limit (₹)</TableHead>
                    <TableHead className="text-gray-400 text-right">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Sparkles className="h-3 w-3 text-purple-400" />
                        Pred. Conv
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(campaign.publishers || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-gray-500 text-xs">
                        No publisher channels mapped. Click &apos;Edit Allocations&apos; to configure.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (campaign.publishers || []).map((cp: CampaignPublisherItem, idx: number) => {
                      const pred = predictedConvs[cp.publisherId];
                      return (
                        <TableRow key={cp.id} className="border-gray-800/60">
                          <TableCell className="font-medium text-white flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                            />
                            {cp.publisher?.name || 'Publisher'}
                          </TableCell>
                          <TableCell className="text-xs text-gray-400">
                            <Badge variant="outline" className="text-[10px]">
                              {cp.publisher?.type || 'CHANNEL'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium text-blue-400">
                            {Number(cp.allocationPct).toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-gray-200">
                            ₹{Number(cp.bidCpc).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-400">
                            ₹{Number(cp.dailyBudget).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isPredictingApp ? (
                              <Skeleton className="h-4 w-12 ml-auto" />
                            ) : pred ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="font-semibold text-purple-400">
                                  {(pred.probability * 100).toFixed(1)}%
                                </span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-purple-300 border-purple-800/60 bg-purple-950/30">
                                  ML
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {Object.keys(predictedConvs).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-purple-400" />
                    <span>Predicted conversion: gradient boosting classifier model</span>
                  </span>
                  <span className="font-mono text-[10px]">
                    Model: {Object.values(predictedConvs)[0]?.modelVersion || 'active'}
                  </span>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: PERFORMANCE & ANALYTICS */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* Controls: Horizon selector */}
          <div className="flex items-center justify-between bg-[#0E131F] border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium">Evaluation Period:</span>
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setPerfRangeDays(days)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    perfRangeDays === days
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-400 hover:text-white bg-gray-900 border border-gray-800'
                  }`}
                >
                  Last {days}d
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchPublisherAnalytics}
              disabled={isLoadingPerf}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoadingPerf ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Publisher Cards with Trend Arrows (like the plan mock) */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              Publisher Performance Cards (vs Prior {perfRangeDays}d)
            </div>
            <p className="text-xs text-gray-400">
              Comparative efficiency benchmarks highlighting acquisition costs and 7-day velocity deltas
            </p>
          </div>

          {isLoadingPerf ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : publisherAnalytics.length === 0 ? (
            <Card className="bg-[#0E131F] border-gray-800 p-8 text-center text-gray-500 text-xs">
              No performance events recorded for this campaign in the selected period. Run a simulation to generate demo traffic.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publisherAnalytics.map((pub) => (
                <Card key={pub.publisherId} className="bg-[#0E131F] border-gray-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{pub.publisherName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {pub.publisherType}
                      </Badge>
                    </div>
                    <Badge variant={pub.rank === 1 ? 'success' : 'default'} className="text-[10px]">
                      #{pub.rank || 1} {pub.rank === 1 ? 'Top Performer' : ''}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase">CTR</span>
                      <div className="text-base font-bold text-white">{formatPercent(pub.ctr)}</div>
                      <TrendDelta delta={pub.trends?.ctrDelta} />
                    </div>

                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase">CPA</span>
                      <div className="text-base font-bold text-emerald-400">{formatCurrency(pub.cpa)}</div>
                      <TrendDelta delta={pub.trends?.cpaDelta} invert />
                    </div>

                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase">CPQA</span>
                      <div className="text-base font-bold text-blue-400">{formatCurrency(pub.cpqa)}</div>
                      <TrendDelta delta={pub.trends?.cpqaDelta} invert />
                    </div>

                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase">CPH</span>
                      <div className="text-base font-bold text-amber-400">{formatCurrency(pub.cph)}</div>
                      <TrendDelta delta={pub.trends?.cphDelta} invert />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400">
                    <span>
                      Spend: <strong className="text-white font-mono">{formatCurrency(pub.spend)}</strong>
                    </span>
                    <span>
                      Apps: <strong className="text-white font-mono">{pub.applications}</strong>
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Comparative CPA & Spend Bar Chart */}
          {publisherAnalytics.length > 0 && (
            <Card className="bg-[#0E131F] border-gray-800 p-5">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-sm font-semibold text-white">
                  Cost per Acquisition (CPA) & Spend Comparison
                </CardTitle>
                <CardDescription className="text-xs text-gray-400">
                  Reviewing acquisition cost efficiency across publishers active in this campaign
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={publisherAnalytics} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                      <XAxis dataKey="publisherName" stroke="#9CA3AF" fontSize={11} />
                      <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={11} unit="₹" />
                      <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={11} unit="₹" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111827',
                          borderColor: '#374151',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar yAxisId="left" dataKey="cpa" fill="#10B981" name="CPA (₹)" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="spend" fill="#3B82F6" name="Total Spend (₹)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Publisher Ranking Table */}
          <Card className="bg-[#0E131F] border-gray-800 p-5">
            <div className="text-sm font-semibold text-gray-200 mb-1">Publisher Efficiency & Ranking Table</div>
            <p className="text-xs text-gray-400 mb-4">
              Ranked by unit acquisition cost with 7-day velocity indicators
            </p>

            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Rank</TableHead>
                  <TableHead className="text-gray-400">Channel</TableHead>
                  <TableHead className="text-gray-400">Type</TableHead>
                  <TableHead className="text-gray-400 text-right">
                    <span className="inline-flex items-center gap-1 justify-end">
                      <Sparkles className="h-3 w-3 text-purple-400" />
                      Pred. Conv
                    </span>
                  </TableHead>
                  <TableHead className="text-gray-400 text-right">CTR</TableHead>
                  <TableHead className="text-gray-400 text-right">CPC</TableHead>
                  <TableHead className="text-gray-400 text-right">CPA</TableHead>
                  <TableHead className="text-gray-400 text-right">CPQA</TableHead>
                  <TableHead className="text-gray-400 text-right">CPH</TableHead>
                  <TableHead className="text-gray-400 text-right">Applications</TableHead>
                  <TableHead className="text-gray-400 text-right">Qualified</TableHead>
                  <TableHead className="text-gray-400 text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publisherAnalytics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-6 text-gray-500 text-xs">
                      No publisher performance data in this timeframe.
                    </TableCell>
                  </TableRow>
                ) : (
                  publisherAnalytics.map((p) => {
                    const pred = predictedConvs[p.publisherId];
                    return (
                      <TableRow key={p.publisherId} className="border-gray-800/60">
                        <TableCell className="font-mono font-bold text-xs text-amber-400">
                          #{p.rank || 1}
                        </TableCell>
                        <TableCell className="font-medium text-white text-xs">
                          {p.publisherName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {p.publisherType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {pred ? (
                            <span className="font-semibold text-purple-400">
                              {(pred.probability * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <div className="font-mono text-white">{formatPercent(p.ctr)}</div>
                        <TrendDelta delta={p.trends?.ctrDelta} />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="font-mono text-gray-300">{formatCurrency(p.cpc)}</div>
                        <TrendDelta delta={p.trends?.cpcDelta} invert />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="font-mono font-bold text-emerald-400">{formatCurrency(p.cpa)}</div>
                        <TrendDelta delta={p.trends?.cpaDelta} invert />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="font-mono text-blue-400">{formatCurrency(p.cpqa)}</div>
                        <TrendDelta delta={p.trends?.cpqaDelta} invert />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="font-mono text-amber-400">{formatCurrency(p.cph)}</div>
                        <TrendDelta delta={p.trends?.cphDelta} invert />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-white">
                        {p.applications.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-blue-400">
                        {p.qualifiedApplications.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-gray-200">
                        {formatCurrency(p.spend)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              </TableBody>
            </Table>
          </Card>

          {/* Publisher Funnel Stages */}
          <Card className="bg-[#0E131F] border-gray-800 p-5">
            <div className="text-sm font-semibold text-gray-200 mb-1">Channel Funnel Progression</div>
            <p className="text-xs text-gray-400 mb-4">
              Full candidate progression through stages per publisher channel
            </p>

            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Channel</TableHead>
                  <TableHead className="text-gray-400 text-right">Impressions</TableHead>
                  <TableHead className="text-gray-400 text-right">Clicks</TableHead>
                  <TableHead className="text-gray-400 text-right">Applications</TableHead>
                  <TableHead className="text-gray-400 text-right">Qualified</TableHead>
                  <TableHead className="text-gray-400 text-right">Interviews</TableHead>
                  <TableHead className="text-gray-400 text-right">Hires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publisherAnalytics.map((p) => (
                  <TableRow key={p.publisherId} className="border-gray-800/60">
                    <TableCell className="font-medium text-white text-xs">{p.publisherName}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-gray-300">
                      {p.impressions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-gray-300">
                      {p.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-white font-semibold">
                      {p.applications.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-blue-400">
                      {p.qualifiedApplications.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-purple-400">
                      {p.interviews.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-400 font-bold">
                      {p.hires.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Allocations Editor Dialog */}
      <Dialog open={isAllocOpen} onOpenChange={setIsAllocOpen}>
        <DialogContent className="sm:max-w-xl bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Edit Publisher Allocations</DialogTitle>
            <p className="text-xs text-gray-400">
              Configure spend share, CPC bids, and daily limits for each channel. Allocations must sum to exactly 100%.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {allocDraft.map((item, idx) => {
                const pub = publishers.find((p) => p.id === item.publisherId);
                return (
                  <div
                    key={item.publisherId}
                    className="p-3 bg-gray-950/60 border border-gray-800 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{pub?.name || 'Publisher Channel'}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {pub?.type || 'CHANNEL'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Allocation (%)</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.allocationPct}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setAllocDraft((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, allocationPct: val } : a))
                            );
                          }}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Bid CPC (₹)</label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.bidCpc}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setAllocDraft((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, bidCpc: val } : a))
                            );
                          }}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Daily Limit (₹)</label>
                        <Input
                          type="number"
                          min="0"
                          value={item.dailyBudget}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setAllocDraft((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, dailyBudget: val } : a))
                            );
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sum validation warning */}
            <div
              className={`flex items-center justify-between p-2.5 rounded text-xs border ${
                isAllocSumValid
                  ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                  : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {isAllocSumValid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                )}
                Total Allocation:
              </span>
              <span className="font-mono font-bold text-sm">{allocSum.toFixed(1)}% / 100%</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAllocOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!isAllocSumValid || isSavingAlloc}
              onClick={handleSaveAllocations}
            >
              {isSavingAlloc ? 'Saving...' : 'Save Allocations'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simulation Dialog */}
      <Dialog open={isSimOpen} onOpenChange={setIsSimOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Simulate Publisher Performance</DialogTitle>
            <p className="text-xs text-gray-400">
              Simulate candidate funnel impressions, clicks, applications, and spend based on your
              current allocations and publisher conversion profiles.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div>
              <label className="text-xs text-gray-300 block mb-1">Simulation Duration (Days)</label>
              <Input
                type="number"
                min="1"
                max="90"
                value={simDays}
                onChange={(e) => setSimDays(parseInt(e.target.value, 10) || 7)}
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Generates realistic events with diminishing returns and publisher conversion drift.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSimOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={isSimulating}
              onClick={handleRunSimulation}
              data-testid="btn-confirm-simulate"
            >
              {isSimulating ? 'Simulating...' : `Simulate ${simDays} Days`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
