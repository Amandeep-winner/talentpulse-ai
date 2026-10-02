'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ForecastMetric,
  ForecastHorizon,
  ForecastResponse,
  CampaignItem,
} from '@talentpulse/shared';
import {
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  Sliders,
  Calendar,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
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

interface ChartPoint {
  date: string;
  historical?: number | null;
  forecast?: number | null;
  lower?: number | null;
  upper?: number | null;
}

export default function ForecastPage() {
  const [isMounted, setIsMounted] = React.useState(false);
  const [metric, setMetric] = React.useState<ForecastMetric>('applications');
  const [horizon, setHorizon] = React.useState<ForecastHorizon>(7);
  const [campaignId, setCampaignId] = React.useState<string>('all');
  const [campaigns, setCampaigns] = React.useState<CampaignItem[]>([]);
  const [forecastData, setForecastData] = React.useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch campaign list for dropdown filter
  React.useEffect(() => {
    api
      .get<{ items: CampaignItem[] }>('/api/campaigns')
      .then((res) => {
        setCampaigns(res.items || []);
      })
      .catch(() => {
        setCampaigns([]);
      });
  }, []);

  const fetchForecast = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        metric,
        horizon: String(horizon),
        ...(campaignId !== 'all' ? { campaignId } : {}),
      });

      const res = await api.get<ForecastResponse>(`/api/forecast?${queryParams.toString()}`);
      setForecastData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load forecast';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [metric, horizon, campaignId]);

  React.useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Combine historical and forecast series for Recharts
  const chartData: ChartPoint[] = React.useMemo(() => {
    if (!forecastData) return [];

    const points: ChartPoint[] = [];

    // Add historical observations
    forecastData.history.forEach((h) => {
      points.push({
        date: h.date,
        historical: h.value,
        forecast: null,
        lower: null,
        upper: null,
      });
    });

    // Add bridge point connecting the last historical to forecast
    if (forecastData.history.length > 0 && forecastData.forecast.length > 0) {
      const lastHist = forecastData.history[forecastData.history.length - 1]!;
      const bridgeIndex = points.findIndex((p) => p.date === lastHist.date);
      if (bridgeIndex >= 0) {
        points[bridgeIndex]!.forecast = lastHist.value;
        points[bridgeIndex]!.lower = lastHist.value;
        points[bridgeIndex]!.upper = lastHist.value;
      }
    }

    // Add future forecast observations
    forecastData.forecast.forEach((f) => {
      points.push({
        date: f.date,
        historical: null,
        forecast: f.value,
        lower: f.lower,
        upper: f.upper,
      });
    });

    return points;
  }, [forecastData]);

  const formatMetricValue = (val: number): string => {
    if (metric === 'spend') {
      return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }
    return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  const methodBadge = (method: string) => {
    if (method === 'holt_winters') {
      return (
        <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          Holt-Winters (Weekly Seasonality)
        </Badge>
      );
    }
    if (method === 'moving_average') {
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
          Moving Average (Recent Window)
        </Badge>
      );
    }
    return (
      <Badge variant="warning" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
        Fallback Moving Average
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Forecasting Intelligence</h1>
            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
              <Sparkles className="w-3 h-3 mr-1 inline" /> ML Service
            </Badge>
          </div>
          <p className="text-sm text-gray-400">
            Hiring volume and spend projections with Holt-Winters seasonality, 95% confidence bands, and shortfall alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchForecast}
            disabled={isLoading}
            className="border-gray-700 hover:bg-gray-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Control Filters Bar */}
      <Card className="bg-[#111827] border-gray-800">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1 bg-gray-900/80 p-1 rounded-lg border border-gray-800">
            {(['applications', 'interviews', 'hires', 'spend'] as ForecastMetric[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  metric === m
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Horizon Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Horizon:</span>
              <div className="flex items-center gap-1 bg-gray-900/80 p-1 rounded-lg border border-gray-800">
                {([7, 14, 30] as ForecastHorizon[]).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorizon(h)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      horizon === h
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    {h}d
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Dropdown */}
            <div className="w-56">
              <Select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="all">All Active Campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shortfall Alert Banner */}
      {forecastData?.insight.shortfallAlert && (
        <div
          data-testid="shortfall-alert-banner"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm text-amber-200">
                Pacing Shortfall Alert: Application Deficit Projected
              </h4>
              <p className="text-xs text-amber-300/90 mt-0.5">
                {forecastData.insight.message} Projected 7-day volume (
                {forecastData.insight.expectedTotalNext7d.toFixed(0)}) falls below target pace (
                {forecastData.insight.targetPace7d}).
              </p>
            </div>
          </div>
          <Link href="/optimize">
            <Button size="sm" variant="secondary" className="whitespace-nowrap bg-amber-600 hover:bg-amber-500 text-white">
              <Sliders className="w-3.5 h-3.5 mr-1.5" /> Review Optimization
            </Button>
          </Link>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg bg-gray-800/50" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-lg bg-gray-800/50" />
        </div>
      )}

      {/* Error Banner */}
      {error && !isLoading && (
        <Card className="bg-red-950/20 border-red-800/50 text-red-300">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-sm">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchForecast}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Content when loaded */}
      {!isLoading && forecastData && (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Expected Metric next 7 days */}
            <Card className="bg-[#111827] border-gray-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Expected {metric} (Next 7d)
                  </span>
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">
                    {formatMetricValue(forecastData.insight.expectedTotalNext7d)}
                  </span>
                  <div
                    className={`flex items-center text-xs font-semibold ${
                      forecastData.insight.trendPctVsLast7d >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {forecastData.insight.trendPctVsLast7d >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                    )}
                    {forecastData.insight.trendPctVsLast7d >= 0 ? '+' : ''}
                    {forecastData.insight.trendPctVsLast7d.toFixed(1)}%
                  </div>
                </div>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  vs {formatMetricValue(forecastData.insight.actualLast7d)} in prior 7 days
                </span>
              </CardContent>
            </Card>

            {/* Card 2: Historical Prior 7d */}
            <Card className="bg-[#111827] border-gray-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Prior 7-Day Baseline
                  </span>
                  <Calendar className="w-4 h-4 text-blue-400" />
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-bold text-white">
                    {formatMetricValue(forecastData.insight.actualLast7d)}
                  </span>
                </div>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Actual recorded {metric}
                </span>
              </CardContent>
            </Card>

            {/* Card 3: Model Engine */}
            <Card className="bg-[#111827] border-gray-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Forecast Engine
                  </span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3">
                  {methodBadge(forecastData.method)}
                </div>
                <span className="text-[11px] text-gray-500 mt-2 block">
                  95% Confidence Interval (2σ band)
                </span>
              </CardContent>
            </Card>

            {/* Card 4: Pacing & Target */}
            <Card className="bg-[#111827] border-gray-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Target Pacing (7d)
                  </span>
                  <Info className="w-4 h-4 text-gray-400" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">
                    {forecastData.insight.targetPace7d
                      ? `${forecastData.insight.targetPace7d} req`
                      : 'Benchmark'}
                  </span>
                  <Badge
                    variant={forecastData.insight.shortfallAlert ? 'warning' : 'success'}
                    className="text-[10px]"
                  >
                    {forecastData.insight.shortfallAlert ? 'Shortfall' : 'On Track'}
                  </Badge>
                </div>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Derived from budget & ₹25 CPA benchmark
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Time Series Chart with Confidence Bands */}
          <Card className="bg-[#111827] border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white capitalize">
                    {metric} Forecast with 95% Confidence Intervals
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-400">
                    Contiguous 35-day historical baseline connected to next {horizon}-day projection band.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Historical
                  </span>
                  <span className="flex items-center gap-1.5 text-purple-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Forecast
                  </span>
                  <span className="flex items-center gap-1.5 text-purple-300">
                    <span className="w-2.5 h-1 border-t border-purple-300 border-dashed inline-block" /> Upper/Lower Band
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-80 w-full" data-testid="forecast-line-chart">
                {isMounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#6B7280"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(d: string) => {
                          const parts = d.split('-');
                          return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
                        }}
                      />
                      <YAxis
                        stroke="#6B7280"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v: number) => (metric === 'spend' ? `₹${v}` : `${v}`)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          color: '#F8FAFC',
                          fontSize: '12px',
                        }}
                        formatter={(value: unknown, name: unknown) => {
                          const num = typeof value === 'number' ? value : Number(value);
                          if (name === 'lower') return [formatMetricValue(num), 'Lower 95% CI'];
                          if (name === 'upper') return [formatMetricValue(num), 'Upper 95% CI'];
                          if (name === 'forecast') return [formatMetricValue(num), 'Forecast'];
                          return [formatMetricValue(num), 'Historical'];
                        }}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => {
                          if (value === 'historical') return <span className="text-xs text-gray-300">Historical</span>;
                          if (value === 'forecast') return <span className="text-xs text-purple-400 font-semibold">Forecast</span>;
                          if (value === 'upper') return <span className="text-xs text-purple-300">Upper (95% CI)</span>;
                          if (value === 'lower') return <span className="text-xs text-purple-300">Lower (95% CI)</span>;
                          return value;
                        }}
                      />
                      {/* Upper & Lower Confidence Interval Lines */}
                      <Line
                        type="monotone"
                        dataKey="upper"
                        stroke="#A78BFA"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        dot={false}
                        name="upper"
                      />
                      <Line
                        type="monotone"
                        dataKey="lower"
                        stroke="#A78BFA"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        dot={false}
                        name="lower"
                      />
                      {/* Historical series */}
                      <Line
                        type="monotone"
                        dataKey="historical"
                        stroke="#3B82F6"
                        strokeWidth={2.5}
                        dot={{ r: 2, fill: '#3B82F6' }}
                        activeDot={{ r: 4 }}
                        name="historical"
                      />
                      {/* Projected forecast series */}
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        stroke="#9333EA"
                        strokeWidth={2.5}
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: '#9333EA' }}
                        activeDot={{ r: 5 }}
                        name="forecast"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Backtest Validation & Methodology Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-[#111827] border-gray-800 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Backtest Validation (14-Day Rolling Holdout)</CardTitle>
                <CardDescription className="text-xs text-gray-400">
                  Performance comparison against the Seasonal-Naive baseline (prior 7-day lag) across the holdout window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-400">Evaluation Metric</TableHead>
                      <TableHead className="text-right text-gray-400">Model Performance</TableHead>
                      <TableHead className="text-right text-gray-400">Seasonal Naive Baseline</TableHead>
                      <TableHead className="text-right text-gray-400">Relative Advantage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-gray-800">
                      <TableCell className="font-medium text-gray-200">
                        Mean Absolute Error (MAE)
                      </TableCell>
                      <TableCell className="text-right font-mono text-purple-400 font-semibold">
                        {forecastData.backtest.mae.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-400">
                        {forecastData.backtest.baselineMae.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {forecastData.backtest.baselineMae > 0 ? (
                          <span className="text-xs font-semibold text-emerald-400">
                            {(
                              ((forecastData.backtest.baselineMae - forecastData.backtest.mae) /
                                forecastData.backtest.baselineMae) *
                              100
                            ).toFixed(1)}
                            % lower error
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Baseline</span>
                        )}
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-gray-800">
                      <TableCell className="font-medium text-gray-200">
                        Root Mean Squared Error (RMSE)
                      </TableCell>
                      <TableCell className="text-right font-mono text-purple-400 font-semibold">
                        {forecastData.backtest.rmse.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-400">-</TableCell>
                      <TableCell className="text-right text-xs text-gray-500">
                        Penalizes outlier deviations
                      </TableCell>
                    </TableRow>

                    <TableRow className="border-gray-800">
                      <TableCell className="font-medium text-gray-200">
                        Mean Absolute Percentage Error (MAPE)
                      </TableCell>
                      <TableCell className="text-right font-mono text-purple-400 font-semibold">
                        {(forecastData.backtest.mape * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-400">-</TableCell>
                      <TableCell className="text-right text-xs text-gray-500">
                        Relative scale error
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Methodology Card */}
            <Card className="bg-[#111827] border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Algorithm & Architecture</CardTitle>
                <CardDescription className="text-xs text-gray-400">
                  How TalentPulse forecasts demand
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-gray-300">
                <div className="p-3 bg-gray-900/60 rounded-md border border-gray-800">
                  <span className="font-semibold text-gray-100 block mb-1">
                    Holt-Winters Triple Exponential Smoothing
                  </span>
                  When 28 or more historical daily observations exist, an additive trend and additive 7-day weekly
                  seasonality model is fitted with automated parameter optimization.
                </div>
                <div className="p-3 bg-gray-900/60 rounded-md border border-gray-800">
                  <span className="font-semibold text-gray-100 block mb-1">
                    Moving Average Fallback
                  </span>
                  When fewer than 28 data points exist or when upstream services are unreachable, the system applies
                  7-day rolling window smoothing with conservative confidence bounds.
                </div>
                <div className="p-3 bg-gray-900/60 rounded-md border border-gray-800">
                  <span className="font-semibold text-gray-100 block mb-1">
                    Proactive Shortfall Alerter
                  </span>
                  If projected 7-day application volumes drop below the pacing required by campaign budgets and CPA
                  benchmarks, a high-priority recommendation is generated.
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
