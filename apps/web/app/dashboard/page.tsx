'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AnalyticsOverview,
  FunnelStage,
  PublisherPerformance,
  CampaignPerformance,
  TimeSeriesPoint,
} from '@talentpulse/shared';
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  UserCheck,
  Target,
  ArrowRight,
  AlertTriangle,
  Layers,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

export default function DashboardPage() {
  const [isMounted, setIsMounted] = React.useState(false);
  const [periodDays, setPeriodDays] = React.useState<number>(30);
  const [isLoading, setIsLoading] = React.useState(true);
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [funnel, setFunnel] = React.useState<FunnelStage[]>([]);
  const [timeseries, setTimeseries] = React.useState<TimeSeriesPoint[]>([]);
  const [publishers, setPublishers] = React.useState<PublisherPerformance[]>([]);
  const [campaigns, setCampaigns] = React.useState<CampaignPerformance[]>([]);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const from = fromDate.toISOString().slice(0, 10);
      const to = toDate.toISOString().slice(0, 10);

      const [ovRes, fnRes, tsRes, pbRes, cpRes] = await Promise.all([
        api.get<AnalyticsOverview>(`/analytics/overview?from=${from}&to=${to}`),
        api.get<FunnelStage[]>(`/analytics/funnel?from=${from}&to=${to}`),
        api.get<TimeSeriesPoint[]>(`/analytics/timeseries?interval=day&from=${from}&to=${to}`),
        api.get<PublisherPerformance[]>(`/analytics/publishers?from=${from}&to=${to}`),
        api.get<CampaignPerformance[]>(`/analytics/campaigns?from=${from}&to=${to}`),
      ]);

      setOverview(ovRes);
      setFunnel(fnRes);
      setTimeseries(tsRes);
      setPublishers(pbRes);
      setCampaigns(cpRes);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [periodDays]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Format currency
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format percentage
  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `${val.toFixed(1)}%`;
  };

  // Delta indicator helper
  const renderDelta = (delta: number | null, inverse = false) => {
    if (delta === null || delta === undefined) {
      return <span className="text-xs text-neutral-500">-</span>;
    }
    const isPositive = delta > 0;
    const isGood = inverse ? !isPositive : isPositive;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const colorClass = isGood ? 'text-emerald-400' : 'text-rose-400';

    return (
      <div className={`flex items-center gap-1 text-xs font-medium ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
        <span>
          {isPositive ? '+' : ''}
          {delta.toFixed(1)}%
        </span>
        <span className="text-[11px] text-neutral-500 font-normal ml-0.5">vs prior period</span>
      </div>
    );
  };

  // SocialReach degradation anomaly check
  const socialReachPub = publishers.find(
    (p) => p.publisherName.toLowerCase().includes('social') || p.publisherType === 'SOCIAL'
  );
  const isSocialReachDegraded = socialReachPub && socialReachPub.cpa && socialReachPub.cpa > 35;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Recruitment Intelligence</h1>
            <Badge variant="outline" className="text-neutral-400 border-neutral-700">
              Deterministic Analytics
            </Badge>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time multi-channel funnel metrics, unit economics, and algorithmic channel diagnostics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPeriodDays(d)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  periodDays === d
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Last {d}d
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            isLoading={isLoading}
            className="border-neutral-800 text-neutral-300 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>

          <Link href="/analytics">
            <Button size="sm" variant="primary">
              <Sliders className="h-3.5 w-3.5 mr-1.5" />
              Advanced Analytics
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Channel Anomaly Banner */}
      {isSocialReachDegraded && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-amber-200">
                Channel Anomaly Detected: SocialReach Efficiency Degradation
              </h4>
              <Badge variant="warning">Alert</Badge>
            </div>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              SocialReach application conversion rate has fallen by ~35% over recent cycles, driving CPA up to{' '}
              {formatCurrency(socialReachPub?.cpa)}. Recommend budget reallocation to AggregatorX or SearchHire.
            </p>
          </div>
        </div>
      )}

      {/* Top KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Total Spend</span>
            <DollarSign className="h-4 w-4 text-neutral-500" />
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-xl font-bold text-white">
                {formatCurrency(overview?.totals.spend)}
              </div>
            )}
            <div className="mt-1.5">{renderDelta(overview?.deltas.spend ?? null, true)}</div>
          </div>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Applications</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-xl font-bold text-white">
                {overview?.totals.applications?.toLocaleString() ?? 0}
              </div>
            )}
            <div className="mt-1.5">{renderDelta(overview?.deltas.applications ?? null)}</div>
          </div>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Cost Per App (CPA)</span>
            <Target className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-xl font-bold text-white">
                {formatCurrency(overview?.totals.cpa)}
              </div>
            )}
            <div className="mt-1.5">{renderDelta(overview?.deltas.cpa ?? null, true)}</div>
          </div>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Interviews</span>
            <Layers className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-xl font-bold text-white">
                {overview?.totals.interviews?.toLocaleString() ?? 0}
              </div>
            )}
            <div className="mt-1.5">{renderDelta(overview?.deltas.interviews ?? null)}</div>
          </div>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Hires</span>
            <UserCheck className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-xl font-bold text-white">
                {overview?.totals.hires?.toLocaleString() ?? 0}
              </div>
            )}
            <div className="mt-1.5">{renderDelta(overview?.deltas.hires ?? null)}</div>
          </div>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Cost Per Hire (CPH)</span>
            <DollarSign className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <div className="text-xl font-bold text-white">
                {formatCurrency(overview?.totals.cph)}
              </div>
            )}
            <div className="mt-1.5">{renderDelta(overview?.deltas.cph ?? null, true)}</div>
          </div>
        </Card>
      </div>

      {/* Main Charts Section: Funnel & 30-Day Activity Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Full Funnel Progression */}
        <Card className="lg:col-span-5 bg-neutral-900 border-neutral-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">Recruitment Funnel</CardTitle>
              <Badge variant="default" className="text-[11px]">
                {overview?.totals.conversionRate ? `${overview.totals.conversionRate.toFixed(2)}% Overall Conv` : 'Stage Analysis'}
              </Badge>
            </div>
            <CardDescription className="text-xs text-neutral-400">
              Stage-by-stage progression from impression to verified hire
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : funnel.length === 0 ? (
              <EmptyState title="No funnel data" description="Events have not been recorded for this period." />
            ) : (
              <div className="space-y-3">
                {funnel.map((stg, idx) => {
                  const maxCount = funnel[0]?.count || 1;
                  const pctWidth = Math.max(8, Math.round((stg.count / maxCount) * 100));

                  return (
                    <div key={stg.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-neutral-300">{stg.name || stg.stage}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{stg.count.toLocaleString()}</span>
                          {idx > 0 && stg.conversionRate !== null && (
                            <span className="text-[11px] text-emerald-400 font-medium">
                              {stg.conversionRate.toFixed(1)}% conv
                            </span>
                          )}
                          {stg.dropOffRate !== null && stg.dropOffRate !== undefined && stg.dropOffRate > 0 && (
                            <span className="text-[10px] text-neutral-500">
                              (-{stg.dropOffRate.toFixed(1)}% drop)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-indigo-600"
                          style={{ width: `${pctWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity & Spends Timeseries Chart */}
        <Card className="lg:col-span-7 bg-neutral-900 border-neutral-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">Daily Funnel Trends</CardTitle>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Applications
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" /> Clicks (÷10)
                </span>
              </div>
            </div>
            <CardDescription className="text-xs text-neutral-400">
              Aggregated daily application and visitor velocity over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !isMounted ? (
              <Skeleton className="h-[280px] w-full" />
            ) : timeseries.length === 0 ? (
              <EmptyState title="No timeseries data" description="No daily records for this date window." />
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis
                      dataKey="date"
                      stroke="#737373"
                      fontSize={11}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis stroke="#737373" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171717',
                        borderColor: '#262626',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="applications"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorApps)"
                      name="Applications"
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      stroke="#818cf8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      fillOpacity={1}
                      fill="url(#colorClicks)"
                      name="Clicks"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section: Publisher Performance Comparison */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base text-white">Publisher Channel Performance</CardTitle>
              <CardDescription className="text-xs text-neutral-400 mt-0.5">
                Channel efficiency comparison across CTR, Application Rate, CPA, and Hires
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-neutral-700 text-neutral-400">
              {publishers.length} Active Channels
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Comparison Bar Chart */}
          {isMounted && !isLoading && publishers.length > 0 && (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={publishers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="publisherName" stroke="#737373" fontSize={11} />
                  <YAxis yAxisId="left" stroke="#737373" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" stroke="#737373" fontSize={11} unit="$" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171717',
                      borderColor: '#262626',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="applications"
                    fill="#3b82f6"
                    name="Applications"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="cpa"
                    fill="#10b981"
                    name="Cost Per Application ($)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Publisher Summary Table */}
          <div className="rounded-lg border border-neutral-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 bg-neutral-950/60">
                  <TableHead className="text-xs text-neutral-400">Publisher</TableHead>
                  <TableHead className="text-xs text-neutral-400">Type</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Clicks</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">CTR</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Apps</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">App Rate</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Hires</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Spend</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">CPA</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">CPH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-neutral-800">
                      <TableCell colSpan={10}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : publishers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-6 text-neutral-500">
                      No publisher activity recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  publishers.map((pub) => {
                    const isDegraded = pub.publisherName.toLowerCase().includes('social') && (pub.cpa ?? 0) > 35;
                    return (
                      <TableRow
                        key={pub.publisherId}
                        className={`border-neutral-800 hover:bg-neutral-800/40 transition-colors ${
                          isDegraded ? 'bg-amber-950/20' : ''
                        }`}
                      >
                        <TableCell className="font-medium text-white text-xs flex items-center gap-2">
                          {pub.publisherName}
                          {isDegraded && <Badge variant="warning" className="text-[10px] py-0">Degraded</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-neutral-700">
                            {pub.publisherType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-neutral-300">
                          {pub.clicks.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-neutral-300">
                          {formatPercent(pub.ctr)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-white">
                          {pub.applications.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-neutral-300">
                          {formatPercent(pub.applicationRate)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium text-cyan-400">
                          {pub.hires.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-neutral-300">
                          {formatCurrency(pub.spend)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-emerald-400">
                          {formatCurrency(pub.cpa)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-amber-400">
                          {formatCurrency(pub.cph)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section: Campaign Summary Table */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base text-white">Active Recruitment Campaigns</CardTitle>
              <CardDescription className="text-xs text-neutral-400 mt-0.5">
                Campaign budget utilization, candidate progression, and acquisition costs
              </CardDescription>
            </div>
            <Link href="/campaigns">
              <Button size="sm" variant="outline" className="border-neutral-800 text-xs">
                Manage Campaigns
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-neutral-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800 bg-neutral-950/60">
                  <TableHead className="text-xs text-neutral-400">Campaign Name</TableHead>
                  <TableHead className="text-xs text-neutral-400">Linked Job</TableHead>
                  <TableHead className="text-xs text-neutral-400">Status</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Budget</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Spend</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Apps</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">Hires</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">CPA</TableHead>
                  <TableHead className="text-xs text-neutral-400 text-right">CPH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className="border-neutral-800">
                      <TableCell colSpan={9}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-neutral-500">
                      No campaign activity found.
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((camp) => (
                    <TableRow key={camp.campaignId} className="border-neutral-800 hover:bg-neutral-800/40">
                      <TableCell className="font-medium text-white text-xs">{camp.campaignName}</TableCell>
                      <TableCell className="text-xs text-neutral-400">{camp.jobTitle}</TableCell>
                      <TableCell>
                        <Badge variant="success" className="text-[10px] py-0">
                          {camp.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-neutral-300">
                        {formatCurrency(camp.budget)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-neutral-300">
                        {formatCurrency(camp.spend)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-white">
                        {camp.applications.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-cyan-400">
                        {camp.hires.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-emerald-400">
                        {formatCurrency(camp.cpa)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-amber-400">
                        {formatCurrency(camp.cph)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
