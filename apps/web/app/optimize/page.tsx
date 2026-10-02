'use client';

import * as React from 'react';
import {
  CampaignItem,
  RecommendationItem,
  OptimizationRuleAction,
  RecommendationStatus,
} from '@talentpulse/shared';
import {
  Sliders,
  Sparkles,
  CheckCircle2,
  XCircle,
  Info,
  History,
  ShieldAlert,
  Loader2,
  Zap,
} from 'lucide-react';
import { BanditLab } from './bandit-lab';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

const CustomBarTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const current = payload.find((p) => p.name === 'Current Allocation')?.value ?? 0;
    const recommended = payload.find((p) => p.name === 'Recommended Allocation')?.value ?? 0;
    const delta = recommended - current;
    const sign = delta > 0 ? '+' : '';

    return (
      <div className="bg-[#1e293b] border border-gray-700 p-3 rounded-lg shadow-xl text-xs space-y-1">
        <p className="font-semibold text-white border-b border-gray-700 pb-1">{label}</p>
        <div className="flex justify-between gap-4 text-gray-300">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> Current:
          </span>
          <span className="font-medium text-white">{current.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4 text-emerald-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Recommended:
          </span>
          <span className="font-medium">{recommended.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-gray-700/60 font-semibold">
          <span className="text-gray-400">Shift:</span>
          <span className={delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-gray-400'}>
            {sign}{delta.toFixed(1)} pp
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function OptimizePage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = React.useState<'reallocation' | 'bandit'>('reallocation');
  const [campaigns, setCampaigns] = React.useState<CampaignItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>('');
  const [currentRecommendation, setCurrentRecommendation] = React.useState<RecommendationItem | null>(null);
  const [history, setHistory] = React.useState<RecommendationItem[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = React.useState(true);
  const [isProposing, setIsProposing] = React.useState(false);
  const [isActing, setIsActing] = React.useState(false);

  const isAnalyst = user?.role === 'ANALYST';
  const canDecide = !isAnalyst;

  // Load campaigns on initial mount
  React.useEffect(() => {
    async function loadCampaigns() {
      setIsLoadingCampaigns(true);
      try {
        const res = await api.get<{ data: CampaignItem[] }>('/api/campaigns?pageSize=100');
        const list = res.data || [];
        setCampaigns(list);
        if (list.length > 0) {
          const first = list.find((c) => c.status === 'ACTIVE') || list[0]!;
          setSelectedCampaignId(first.id);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load campaigns';
        addToast({ title: 'Error', description: msg, variant: 'danger' });
      } finally {
        setIsLoadingCampaigns(false);
      }
    }
    loadCampaigns();
  }, [addToast]);

  // Load recommendation history and active recommendation when campaign changes
  const loadCampaignRecommendations = React.useCallback(
    async (campaignId: string) => {
      if (!campaignId) return;
      try {
        const res = await api.get<{ data: RecommendationItem[] }>(
          `/api/optimization/recommendations?campaignId=${campaignId}`
        );
        const recs = res.data || [];
        setHistory(recs);
        // Find most recent proposed, or fallback to most recent
        const active = recs.find((r) => r.status === 'PROPOSED') || recs[0] || null;
        setCurrentRecommendation(active);
      } catch {
        // Silent error or fallback
      }
    },
    []
  );

  React.useEffect(() => {
    if (selectedCampaignId) {
      loadCampaignRecommendations(selectedCampaignId);
    }
  }, [selectedCampaignId, loadCampaignRecommendations]);

  const selectedCampaign = React.useMemo(() => {
    return campaigns.find((c) => c.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  // Handle Propose Reallocation
  const handlePropose = async () => {
    if (!selectedCampaignId) return;
    setIsProposing(true);
    try {
      const res = await api.post<{ data: RecommendationItem }>('/api/optimization/propose', {
        campaignId: selectedCampaignId,
      });
      setCurrentRecommendation(res.data);
      addToast({
        title: 'Proposal Generated',
        description: 'New budget optimization proposal generated successfully.',
        variant: 'success',
      });
      loadCampaignRecommendations(selectedCampaignId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate proposal';
      addToast({ title: 'Optimization Error', description: msg, variant: 'danger' });
    } finally {
      setIsProposing(false);
    }
  };

  // Handle Approve
  const handleApprove = async () => {
    if (!currentRecommendation) return;
    setIsActing(true);
    try {
      const res = await api.post<{ data: RecommendationItem }>(
        `/api/optimization/recommendations/${currentRecommendation.id}/approve`
      );
      setCurrentRecommendation(res.data);
      addToast({
        title: 'Recommendation Applied',
        description: 'Publisher budget allocations updated and caches invalidated.',
        variant: 'success',
      });
      loadCampaignRecommendations(selectedCampaignId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve recommendation';
      addToast({ title: 'Approval Failed', description: msg, variant: 'danger' });
    } finally {
      setIsActing(false);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!currentRecommendation) return;
    setIsActing(true);
    try {
      const res = await api.post<{ data: RecommendationItem }>(
        `/api/optimization/recommendations/${currentRecommendation.id}/reject`
      );
      setCurrentRecommendation(res.data);
      addToast({
        title: 'Recommendation Rejected',
        description: 'Proposed reallocation has been archived as rejected.',
        variant: 'info',
      });
      loadCampaignRecommendations(selectedCampaignId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reject recommendation';
      addToast({ title: 'Rejection Failed', description: msg, variant: 'danger' });
    } finally {
      setIsActing(false);
    }
  };

  // Prepare chart data comparing current vs recommended allocation
  const chartData = React.useMemo(() => {
    if (!currentRecommendation || !selectedCampaign?.publishers) return [];

    const decision = currentRecommendation.decision;
    return selectedCampaign.publishers.map((cp) => {
      const pName = cp.publisher?.name || 'Channel';
      const currentVal = decision.current[cp.publisherId] ?? Number(cp.allocationPct);
      const recommendedVal = decision.recommended[cp.publisherId] ?? currentVal;
      return {
        name: pName,
        'Current Allocation': currentVal,
        'Recommended Allocation': recommendedVal,
      };
    });
  }, [currentRecommendation, selectedCampaign]);

  const getActionBadgeVariant = (action: OptimizationRuleAction) => {
    switch (action) {
      case 'increase_allocation':
        return 'success';
      case 'reduce_allocation':
        return 'danger';
      case 'review_landing_quality':
        return 'warning';
      case 'adjust_pacing':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusBadge = (status: RecommendationStatus) => {
    switch (status) {
      case 'PROPOSED':
        return <Badge variant="warning">PROPOSED</Badge>;
      case 'APPLIED':
        return <Badge variant="success">APPLIED</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">REJECTED</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sliders className="h-6 w-6 text-blue-500" />
            Budget Optimization Engine
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Algorithmic channel scoring, heuristic velocity guards, and constrained budget reallocations.
          </p>
        </div>

        {/* Campaign Selector and Generate Button (visible on reallocation tab) */}
        {activeTab === 'reallocation' && (
          <div className="flex items-center gap-3">
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              disabled={isLoadingCampaigns || isProposing}
              className="h-9 px-3 rounded-md bg-[#131b2e] border border-gray-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>

            <Button
              onClick={handlePropose}
              disabled={!selectedCampaignId || isProposing || isActing}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isProposing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Propose Reallocation
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
        <button
          onClick={() => setActiveTab('reallocation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'reallocation'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Budget Reallocation
        </button>
        <button
          onClick={() => setActiveTab('bandit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'bandit'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
          }`}
        >
          <Zap className="w-4 h-4" />
          Bandit Lab (LinUCB & ε-Greedy)
        </button>
      </div>

      {activeTab === 'bandit' ? (
        <BanditLab />
      ) : (
        <>
      {/* Role Alert for Analyst */}
      {isAnalyst && (
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            You are logged in as an <strong>Analyst</strong> (read-only mode). Administrative or Recruiter
            credentials are required to apply or reject budget reallocations.
          </span>
        </div>
      )}

      {/* Main Content Area */}
      {isLoadingCampaigns ? (
        <div className="grid grid-cols-1 gap-6">
          <Skeleton className="h-48 w-full bg-gray-800" />
          <Skeleton className="h-72 w-full bg-gray-800" />
        </div>
      ) : !selectedCampaign ? (
        <EmptyState
          icon={Sliders}
          title="No Campaigns Available"
          description="Create a recruitment campaign and configure publisher channels to run budget optimization."
        />
      ) : !currentRecommendation ? (
        <Card className="bg-[#131b2e] border-gray-800">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">No Proposals for {selectedCampaign.name}</h3>
              <p className="text-sm text-gray-400 max-w-md mt-1">
                Run the deterministic heuristic and scoring pipeline to generate an optimal channel budget
                reallocation.
              </p>
            </div>
            <Button
              onClick={handlePropose}
              disabled={isProposing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isProposing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate Proposal Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Proposal Summary Header Card */}
          <Card className="bg-[#131b2e] border-gray-800">
            <CardHeader className="pb-3 border-b border-gray-800/80">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg text-white font-semibold">
                      {`Recommendation #${currentRecommendation.id.slice(0, 8)}`}
                    </CardTitle>
                    {getStatusBadge(currentRecommendation.status)}
                    <Badge variant="outline" className="border-blue-500/50 text-blue-400">
                      {currentRecommendation.modelVersion}
                    </Badge>
                  </div>
                  <CardDescription className="text-gray-400 text-xs flex items-center gap-4">
                    <span>
                      Generated:{' '}
                      {new Date(currentRecommendation.createdAt).toLocaleDateString()}{' '}
                      {new Date(currentRecommendation.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      Confidence: {(currentRecommendation.confidence * 100).toFixed(0)}%
                    </span>
                  </CardDescription>
                </div>

                {/* Approve / Reject Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleReject}
                    disabled={
                      !canDecide ||
                      currentRecommendation.status !== 'PROPOSED' ||
                      isActing
                    }
                    className="flex items-center gap-1.5"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApprove}
                    disabled={
                      !canDecide ||
                      currentRecommendation.status !== 'PROPOSED' ||
                      isActing
                    }
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isActing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Approve Allocations
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 text-xs text-gray-300">
              <div className="p-3 bg-[#0e1424] rounded-lg border border-gray-800">
                <p className="font-medium text-white mb-1">Optimizer Rationale:</p>
                <p className="text-gray-400 leading-relaxed">
                  {typeof currentRecommendation.explanation === 'object' &&
                  currentRecommendation.explanation !== null &&
                  'summary' in currentRecommendation.explanation
                    ? String(
                        (currentRecommendation.explanation as { summary?: string }).summary
                      )
                    : 'Constrained softmax optimization proposal based on historical velocity and publisher efficiency scores.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Allocation Comparison Chart */}
          <Card className="bg-[#131b2e] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white font-semibold flex items-center justify-between">
                <span>Current vs Recommended Budget Allocation</span>
                <span className="text-xs font-normal text-gray-400">
                  Target Total: 100.0% (Bounded within 5% - 50%, Max Step ±10 pp)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3449" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                      tickFormatter={(val) => `${val}%`}
                      domain={[0, 60]}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ paddingBottom: 15, fontSize: '12px' }}
                    />
                    <Bar
                      dataKey="Current Allocation"
                      fill="#64748b"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={45}
                    />
                    <Bar
                      dataKey="Recommended Allocation"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={45}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Publisher Rule Actions Breakdown */}
          <Card className="bg-[#131b2e] border-gray-800">
            <CardHeader className="pb-3 border-b border-gray-800">
              <CardTitle className="text-base text-white font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-400" />
                Publisher Actions & Heuristic Diagnostics
              </CardTitle>
              <CardDescription className="text-gray-400 text-xs">
                Evaluated against 7-day velocity windows with minimum-volume thresholds (≥50 clicks).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 font-semibold text-xs">Publisher</TableHead>
                    <TableHead className="text-gray-400 font-semibold text-xs">Recommended Action</TableHead>
                    <TableHead className="text-gray-400 font-semibold text-xs text-right">Current</TableHead>
                    <TableHead className="text-gray-400 font-semibold text-xs text-right">Recommended</TableHead>
                    <TableHead className="text-gray-400 font-semibold text-xs text-right">Shift</TableHead>
                    <TableHead className="text-gray-400 font-semibold text-xs">Diagnosis / Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentRecommendation.decision.actions.map((act) => {
                    const currentPct = currentRecommendation.decision.current[act.publisherId] ?? 0;
                    const recPct = currentRecommendation.decision.recommended[act.publisherId] ?? 0;
                    const delta = recPct - currentPct;
                    const sign = delta > 0 ? '+' : '';

                    return (
                      <TableRow key={act.publisherId} className="border-b border-gray-800/60 hover:bg-[#1a233a]">
                        <TableCell className="font-medium text-white text-xs">
                          {act.publisherName}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(act.action)} className="text-[10px]">
                            {act.action.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-gray-300 text-xs">
                          {currentPct.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right text-emerald-400 font-semibold text-xs">
                          {recPct.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <span
                            className={`font-medium px-2 py-0.5 rounded text-[11px] ${
                              delta > 0
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : delta < 0
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'bg-gray-800 text-gray-400'
                            }`}
                          >
                            {sign}{delta.toFixed(1)} pp
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs max-w-md">
                          {act.reason}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Historical Recommendations Table */}
          {history.length > 0 && (
            <Card className="bg-[#131b2e] border-gray-800">
              <CardHeader className="pb-3 border-b border-gray-800">
                <CardTitle className="text-sm text-white font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-gray-400" />
                  Recommendation Audit Trail ({history.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400 text-xs">ID</TableHead>
                      <TableHead className="text-gray-400 text-xs">Created</TableHead>
                      <TableHead className="text-gray-400 text-xs">Model</TableHead>
                      <TableHead className="text-gray-400 text-xs">Confidence</TableHead>
                      <TableHead className="text-gray-400 text-xs">Status</TableHead>
                      <TableHead className="text-gray-400 text-xs text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((rec) => (
                      <TableRow
                        key={rec.id}
                        className={`border-b border-gray-800/60 hover:bg-[#1a233a] cursor-pointer ${
                          rec.id === currentRecommendation.id ? 'bg-[#1a233a]/60' : ''
                        }`}
                        onClick={() => setCurrentRecommendation(rec)}
                      >
                        <TableCell className="font-mono text-xs text-blue-400">
                          #{rec.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs">
                          {new Date(rec.createdAt).toLocaleDateString()} {new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs">{rec.modelVersion}</TableCell>
                        <TableCell className="text-emerald-400 text-xs">
                          {(rec.confidence * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell>{getStatusBadge(rec.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentRecommendation(rec);
                            }}
                          >
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
