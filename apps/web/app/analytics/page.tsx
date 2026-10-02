'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AnalyticsOverview,
  FunnelStage,
  PublisherPerformance,
  TimeSeriesPoint,
  CampaignItem,
} from '@talentpulse/shared';
import {
  RefreshCw,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Award,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
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
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsPage() {
  const [isMounted, setIsMounted] = React.useState(false);
  const [periodDays, setPeriodDays] = React.useState<number>(30);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>('all');
  const [selectedMetric, setSelectedMetric] = React.useState<string>('applications');
  const [interval, setInterval] = React.useState<'day' | 'week'>('day');
  const [activeTab, setActiveTab] = React.useState<'funnel' | 'channels' | 'timeseries' | 'economics'>('funnel');

  const [isLoading, setIsLoading] = React.useState(true);
  const [campaignList, setCampaignList] = React.useState<CampaignItem[]>([]);
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [funnel, setFunnel] = React.useState<FunnelStage[]>([]);
  const [timeseries, setTimeseries] = React.useState<TimeSeriesPoint[]>([]);
  const [publishers, setPublishers] = React.useState<PublisherPerformance[]>([]);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch campaign list for dropdown
  React.useEffect(() => {
    api
      .get<{ items: CampaignItem[] }>('/campaigns?limit=50')
      .then((res) => setCampaignList(res.items || []))
      .catch(() => setCampaignList([]));
  }, []);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const from = fromDate.toISOString().slice(0, 10);
      const to = toDate.toISOString().slice(0, 10);

      const campaignQuery = selectedCampaignId !== 'all' ? `&campaignId=${selectedCampaignId}` : '';

      const [ovRes, fnRes, tsRes, pbRes] = await Promise.all([
        api.get<AnalyticsOverview>(`/analytics/overview?from=${from}&to=${to}${campaignQuery}`),
        api.get<FunnelStage[]>(`/analytics/funnel?from=${from}&to=${to}${campaignQuery}`),
        api.get<TimeSeriesPoint[]>(
          `/analytics/timeseries?interval=${interval}&from=${from}&to=${to}${campaignQuery}`
        ),
        api.get<PublisherPerformance[]>(`/analytics/publishers?from=${from}&to=${to}${campaignQuery}`),
      ]);

      setOverview(ovRes);
      setFunnel(fnRes);
      setTimeseries(tsRes);
      setPublishers(pbRes);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [periodDays, selectedCampaignId, interval]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `${val.toFixed(1)}%`;
  };

  const TrendDelta = ({ delta, invert = false }: { delta: number | null | undefined; invert?: boolean }) => {
    if (delta === null || delta === undefined) {
      return <span className="text-neutral-500 text-xs font-mono">-</span>;
    }
    const isZero = Math.abs(delta) < 0.05;
    const isPositive = delta > 0;
    const isGood = invert ? delta < 0 : delta > 0;
    const color = isZero ? 'text-neutral-400' : isGood ? 'text-emerald-400' : 'text-rose-400';
    const Icon = isZero ? null : isPositive ? ArrowUpRight : ArrowDownRight;

    return (
      <span className={`inline-flex items-center text-xs font-mono font-medium ${color}`}>
        {Icon && <Icon className="h-3 w-3 mr-0.5 inline-block" />}
        {isPositive ? '+' : ''}
        {delta.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-white">Advanced Analytics</h1>
            <Badge variant="outline" className="border-neutral-700 text-neutral-400">
              Parametric Filters
            </Badge>
          </div>
          <p className="text-xs text-neutral-400">
            Slice and analyze candidate progression, publisher cost economics, and conversion trends
          </p>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Control Bar: Filters & Slicing */}
      <Card className="bg-neutral-900 border-neutral-800 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-center">
          {/* Period selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Date Range</label>
            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-lg p-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriodDays(d)}
                  className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                    periodDays === d ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Campaign Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Campaign Scope</label>
            <Select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="bg-neutral-950 border-neutral-800 text-white text-xs h-9"
            >
              <option value="all">All Campaigns ({campaignList.length})</option>
              {campaignList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Metric Selector (for Timeseries) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Timeseries Metric</label>
            <Select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="bg-neutral-950 border-neutral-800 text-white text-xs h-9"
            >
              <option value="applications">Applications</option>
              <option value="clicks">Clicks</option>
              <option value="spend">Spend ($)</option>
              <option value="impressions">Impressions</option>
              <option value="interviews">Interviews</option>
              <option value="hires">Hires</option>
            </Select>
          </div>

          {/* Timeseries Interval */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Grouping Interval</label>
            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-lg p-1">
              <button
                onClick={() => setInterval('day')}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                  interval === 'day' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setInterval('week')}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
                  interval === 'week' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Weekly
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab('funnel')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'funnel' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Funnel Breakdown
        </button>
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'channels' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Channel Comparisons
        </button>
        <button
          onClick={() => setActiveTab('timeseries')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'timeseries' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Time Velocity
        </button>
        <button
          onClick={() => setActiveTab('economics')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'economics' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Unit Economics
        </button>
      </div>

      {/* Tab 1: Funnel Breakdown */}
      {activeTab === 'funnel' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-neutral-900 border-neutral-800 p-4">
              <span className="text-xs text-neutral-400">Total Pipeline Velocity</span>
              <div className="text-xl font-bold text-white mt-1">
                {overview?.totals.applications?.toLocaleString() ?? 0} Apps
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">In selected scope</span>
            </Card>
            <Card className="bg-neutral-900 border-neutral-800 p-4">
              <span className="text-xs text-neutral-400">Application Rate (from Clicks)</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                {overview?.totals.clicks
                  ? `${((overview.totals.applications / overview.totals.clicks) * 100).toFixed(1)}%`
                  : '-'}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">Landing page conversion</span>
            </Card>
            <Card className="bg-neutral-900 border-neutral-800 p-4">
              <span className="text-xs text-neutral-400">Interview Rate</span>
              <div className="text-xl font-bold text-purple-400 mt-1">
                {overview?.totals.applications
                  ? `${((overview.totals.interviews / overview.totals.applications) * 100).toFixed(1)}%`
                  : '-'}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">Applications to Interviews</span>
            </Card>
            <Card className="bg-neutral-900 border-neutral-800 p-4">
              <span className="text-xs text-neutral-400">Hire Conversion</span>
              <div className="text-xl font-bold text-cyan-400 mt-1">
                {overview?.totals.applications
                  ? `${((overview.totals.hires / overview.totals.applications) * 100).toFixed(1)}%`
                  : '-'}
              </div>
              <span className="text-[11px] text-neutral-500 mt-1 block">Applications to Hires</span>
            </Card>
          </div>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-base text-white">Full Stage Conversion Table</CardTitle>
              <CardDescription className="text-xs text-neutral-400">
                Detailed metrics showing candidate volume and dropoff rates between pipeline transitions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-neutral-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-neutral-800 bg-neutral-950/60">
                      <TableHead className="text-xs text-neutral-400">Funnel Stage</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Volume</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Progression Rate</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Stage Drop-off</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">% of Top-of-Funnel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 7 }).map((_, i) => (
                        <TableRow key={i} className="border-neutral-800">
                          <TableCell colSpan={5}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : funnel.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-neutral-500">
                          No data available for this filter.
                        </TableCell>
                      </TableRow>
                    ) : (
                      funnel.map((s, idx) => {
                        const topCount = funnel[0]?.count || 1;
                        const pctOfTop = ((s.count / topCount) * 100).toFixed(2);
                        return (
                          <TableRow key={s.stage} className="border-neutral-800 hover:bg-neutral-800/40">
                            <TableCell className="font-semibold text-white text-xs">{s.name || s.stage}</TableCell>
                            <TableCell className="text-right text-xs font-mono text-neutral-200">
                              {s.count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-emerald-400">
                              {idx === 0 ? 'Baseline (100%)' : formatPercent(s.conversionRate)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-rose-400">
                              {idx === 0 ? '0.0%' : formatPercent(s.dropOffRate)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-neutral-400">{pctOfTop}%</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Channel Comparisons */}
      {activeTab === 'channels' && (
        <div className="space-y-6">
          {/* Publisher Performance Cards with Trend Arrows */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              Publisher Performance Benchmarks (vs Prior 7d)
            </div>
            <p className="text-xs text-neutral-400">
              Channel efficiency cards showing CTR, CPA, CPH, and CPQA with 7-day velocity indicators
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publishers.map((pub) => (
              <Card key={pub.publisherId} className="bg-neutral-900 border-neutral-800 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{pub.publisherName}</span>
                    <Badge variant="outline" className="text-[10px] border-neutral-700">
                      {pub.publisherType}
                    </Badge>
                  </div>
                  <Badge variant={pub.rank === 1 ? 'default' : 'outline'} className="text-[10px]">
                    #{pub.rank || 1} {pub.rank === 1 ? 'Top Performer' : ''}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase">CTR</span>
                    <div className="text-sm font-bold text-white">{formatPercent(pub.ctr)}</div>
                    <TrendDelta delta={pub.trends?.ctrDelta} />
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase">CPA</span>
                    <div className="text-sm font-bold text-emerald-400">{formatCurrency(pub.cpa)}</div>
                    <TrendDelta delta={pub.trends?.cpaDelta} invert />
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase">CPQA</span>
                    <div className="text-sm font-bold text-blue-400">{formatCurrency(pub.cpqa)}</div>
                    <TrendDelta delta={pub.trends?.cpqaDelta} invert />
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[10px] uppercase">CPH</span>
                    <div className="text-sm font-bold text-amber-400">{formatCurrency(pub.cph)}</div>
                    <TrendDelta delta={pub.trends?.cphDelta} invert />
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
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

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-base text-white">Publisher Channel Volume vs CPA</CardTitle>
              <CardDescription className="text-xs text-neutral-400">
                Evaluating candidate acquisition scale against unit acquisition costs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isMounted && !isLoading && publishers.length > 0 && (
                <div className="h-[280px] w-full">
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
                      <Bar yAxisId="left" dataKey="applications" fill="#3b82f6" name="Applications" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="qualifiedApplications" fill="#818cf8" name="Qualified Apps" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="cpa" fill="#10b981" name="CPA ($)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-base text-white">Publisher Quality & Progression Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-neutral-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-neutral-800 bg-neutral-950/60">
                      <TableHead className="text-xs text-neutral-400">Rank</TableHead>
                      <TableHead className="text-xs text-neutral-400">Publisher</TableHead>
                      <TableHead className="text-xs text-neutral-400">Type</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Apps</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Qualified</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">CPA</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">CPQA</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Quality %</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Interviews</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Hires</TableHead>
                      <TableHead className="text-xs text-neutral-400 text-right">Hire Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {publishers.map((p) => {
                      const qualityPct = p.applications > 0 ? (p.qualifiedApplications / p.applications) * 100 : null;
                      const hireRate = p.applications > 0 ? (p.hires / p.applications) * 100 : null;
                      return (
                        <TableRow key={p.publisherId} className="border-neutral-800 hover:bg-neutral-800/40">
                          <TableCell className="font-mono text-xs text-amber-400 font-bold">
                            #{p.rank || 1}
                          </TableCell>
                          <TableCell className="font-medium text-white text-xs">{p.publisherName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] border-neutral-700">
                              {p.publisherType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs text-neutral-200">
                            {p.applications.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs text-neutral-200">
                            {p.qualifiedApplications.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <div className="font-mono text-emerald-400 font-bold">{formatCurrency(p.cpa)}</div>
                            <TrendDelta delta={p.trends?.cpaDelta} invert />
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <div className="font-mono text-blue-400 font-medium">{formatCurrency(p.cpqa)}</div>
                            <TrendDelta delta={p.trends?.cpqaDelta} invert />
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-emerald-400">
                            {formatPercent(qualityPct)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-purple-400">
                            {p.interviews.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold text-cyan-400">
                            {p.hires.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs text-neutral-300 font-mono">
                            {formatPercent(hireRate)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Time Velocity */}
      {activeTab === 'timeseries' && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-white">
                  {interval === 'day' ? 'Daily' : 'Weekly'} {selectedMetric.toUpperCase()} Velocity
                </CardTitle>
                <CardDescription className="text-xs text-neutral-400 mt-0.5">
                  Historical trends across the selected date range
                </CardDescription>
              </div>
              <Badge variant="default" className="text-xs capitalize">
                {selectedMetric}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isMounted && !isLoading && timeseries.length > 0 && (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="date" stroke="#737373" fontSize={11} tickFormatter={(d) => d.slice(5)} />
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
                    <Line
                      type="monotone"
                      dataKey={selectedMetric}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Unit Economics */}
      {activeTab === 'economics' && (
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-base text-white">Channel Unit Economics and Acquisition Cost Matrix</CardTitle>
            <CardDescription className="text-xs text-neutral-400">
              Comparative review of Cost Per Click (CPC), Cost Per Application (CPA), and Cost Per Hire (CPH)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-neutral-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-neutral-800 bg-neutral-950/60">
                    <TableHead className="text-xs text-neutral-400">Channel</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">Total Spend</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">Clicks</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">CPC</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">Applications</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">CPA</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">Hires</TableHead>
                    <TableHead className="text-xs text-neutral-400 text-right">CPH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publishers.map((pub) => (
                    <TableRow key={pub.publisherId} className="border-neutral-800 hover:bg-neutral-800/40">
                      <TableCell className="font-medium text-white text-xs">{pub.publisherName}</TableCell>
                      <TableCell className="text-right text-xs text-neutral-200">
                        {formatCurrency(pub.spend)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-neutral-400">
                        {pub.clicks.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs text-neutral-300 font-mono">
                        {formatCurrency(pub.cpc)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-white">
                        {pub.applications.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-emerald-400 font-mono">
                        {formatCurrency(pub.cpa)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-cyan-400">
                        {pub.hires.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-amber-400 font-mono">
                        {formatCurrency(pub.cph)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
