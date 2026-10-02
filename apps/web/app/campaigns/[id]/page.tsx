'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CampaignItem,
  CampaignPublisherItem,
  CampaignStatus,
  PublisherItem,
  CampaignSimulateResponse,
} from '@talentpulse/shared';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const { user } = useAuth();
  const { addToast } = useToast();

  const [campaign, setCampaign] = React.useState<CampaignItem | null>(null);
  const [publishers, setPublishers] = React.useState<PublisherItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

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

  const fetchCampaign = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [campRes, pubRes] = await Promise.all([
        api.get<{ data: CampaignItem }>(`/api/campaigns/${campaignId}`),
        api.get<{ data: PublisherItem[] }>('/api/publishers'),
      ]);
      setCampaign(campRes.data);
      setPublishers(pubRes.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load campaign';
      addToast({ title: 'Error', description: msg, variant: 'danger' });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, addToast]);

  React.useEffect(() => {
    if (campaignId) {
      fetchCampaign();
    }
  }, [campaignId, fetchCampaign]);

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

  const allocSum = allocDraft.reduce((acc, curr) => acc + (Number(curr.allocationPct) || 0), 0);
  const isAllocSumValid = Math.abs(allocSum - 100) < 0.01;

  const handleSaveAllocations = async () => {
    if (!isAllocSumValid) {
      addToast({
        title: 'Allocation error',
        description: `Total allocations must sum to exactly 100%. Currently at ${allocSum.toFixed(1)}%.`,
        variant: 'danger',
      });
      return;
    }

    setIsSavingAlloc(true);
    try {
      await api.put(`/api/campaigns/${campaignId}/allocations`, {
        allocations: allocDraft,
      });
      addToast({ title: 'Success', description: 'Allocations updated successfully', variant: 'success' });
      setIsAllocOpen(false);
      fetchCampaign();
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
          seed: 42,
        }
      );
      addToast({
        title: 'Simulation Complete',
        description: `Simulated ${res.data.days} days: Generated ${res.data.totalApplications} applications, ${res.data.totalHires} hires with ₹${res.data.totalSpend.toLocaleString()} spend.`,
        variant: 'success',
      });
      setIsSimOpen(false);
      fetchCampaign();
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
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
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
              {totalAllocatedDailyBudget > 0 ? 'Sum of publisher limits' : `₹${Math.round(calculatedDailyBudget)} target/day`}
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
          <p className="text-xs text-gray-400 mb-4">Budget split across publishers</p>

          {donutData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-gray-500">
              No allocations configured.
            </div>
          ) : (
            <div className="h-60 w-full">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaign.publishers || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-gray-500 text-xs">
                    No publisher channels mapped. Click &apos;Edit Allocations&apos; to configure.
                  </TableCell>
                </TableRow>
              ) : (
                (campaign.publishers || []).map((cp: CampaignPublisherItem, idx: number) => (
                  <TableRow key={cp.id} className="border-gray-800/60">
                    <TableCell className="font-medium text-white flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                      />
                      {cp.publisher?.name || 'Publisher'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-400">
                      {cp.publisher?.type || 'JOB_BOARD'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-400 font-semibold">
                      {cp.allocationPct}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-300">
                      ₹{cp.bidCpc.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-300">
                      ₹{cp.dailyBudget.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Allocations Editor Dialog */}
      <Dialog open={isAllocOpen} onOpenChange={setIsAllocOpen}>
        <DialogContent className="sm:max-w-xl bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Edit Publisher Allocations</DialogTitle>
            <p className="text-xs text-gray-400">
              Configure allocation percentages, maximum CPC bids, and daily limits. The sum of all
              allocations must equal exactly 100%.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-3">
              {allocDraft.map((item, idx) => {
                const pub = publishers.find((p) => p.id === item.publisherId);
                return (
                  <div
                    key={item.publisherId}
                    className="p-3 bg-gray-950/80 rounded border border-gray-800 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
                      <span>{pub?.name || `Publisher ${idx + 1}`}</span>
                      <span className="text-[11px] text-gray-500 uppercase">{pub?.type}</span>
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
