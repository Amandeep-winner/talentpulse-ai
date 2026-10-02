'use client';

import * as React from 'react';
import {
  BanditAlgorithm,
  BanditSimulationResponse,
  BanditAction,
} from '@talentpulse/shared';
import {
  Sparkles,
  Play,
  RotateCcw,
  TrendingUp,
  BarChart3,
  AlertCircle,
  Loader2,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
import { useToast } from '@/components/ui/toast';

const ALGO_COLORS: Record<string, string> = {
  linucb: '#10b981', // emerald-500
  epsilon_greedy: '#3b82f6', // blue-500
  static: '#f59e0b', // amber-500
  random: '#ef4444', // red-500
};

const ALGO_LABELS: Record<string, string> = {
  linucb: 'Disjoint LinUCB (α=0.8)',
  epsilon_greedy: 'ε-Greedy (Ridge Regressor)',
  static: 'Static Baseline (Maintain)',
  random: 'Random Baseline',
};

const ACTION_LABELS: Record<BanditAction, string> = {
  increase_bid: 'Increase Bid (+10%)',
  decrease_bid: 'Decrease Bid (-10%)',
  maintain_bid: 'Maintain Bid',
  increase_budget: 'Increase Budget (+10%)',
  decrease_budget: 'Decrease Budget (-10%)',
};

export function BanditLab() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [rounds, setRounds] = React.useState<number>(500);
  const [seed, setSeed] = React.useState<number>(42);
  const [selectedAlgos, setSelectedAlgos] = React.useState<BanditAlgorithm[]>([
    'linucb',
    'epsilon_greedy',
    'random',
    'static',
  ]);
  const [isSimulating, setIsSimulating] = React.useState<boolean>(false);
  const [simulationData, setSimulationData] = React.useState<BanditSimulationResponse | null>(null);

  const [policyState, setPolicyState] = React.useState<{
    version: number;
    totalPulls: number;
  } | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  // Toggle algorithm selection
  const toggleAlgo = (algo: BanditAlgorithm) => {
    if (selectedAlgos.includes(algo)) {
      if (selectedAlgos.length === 1) {
        addToast({ title: 'At least one algorithm must be selected', variant: 'danger' });
        return;
      }
      setSelectedAlgos(selectedAlgos.filter((a) => a !== algo));
    } else {
      setSelectedAlgos([...selectedAlgos, algo]);
    }
  };

  // Run offline simulation
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const response = await api.post<{ data: BanditSimulationResponse }>(
        '/api/optimization/bandit/simulate',
        {
          rounds,
          seed,
          algorithms: selectedAlgos,
        }
      );
      setSimulationData(response.data);
      addToast({
        title: 'Simulation Complete',
        description: `Successfully simulated ${rounds} rounds across ${selectedAlgos.length} policies.`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to execute bandit simulation';
      addToast({
        title: 'Simulation Failed',
        description: msg,
        variant: 'danger',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Fetch current policy state
  const loadPolicyState = async () => {
    try {
      const response = await api.get<{ data: { version: number; totalPulls: number } }>(
        '/api/optimization/bandit/state?algorithm=linucb'
      );
      setPolicyState(response.data);
    } catch {
      // Ignore if not found
    }
  };

  // Reset policies
  const handleResetPolicy = async () => {
    if (!confirm('Are you sure you want to reset all live bandit policies?')) return;
    try {
      await api.post('/api/optimization/bandit/reset', { algorithm: 'linucb' });
      await api.post('/api/optimization/bandit/reset', { algorithm: 'epsilon_greedy' });
      addToast({
        title: 'Policies Reset',
        description: 'Contextual bandit policies reset to prior values.',
        variant: 'success',
      });
      loadPolicyState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset policies';
      addToast({
        title: 'Reset Failed',
        description: msg,
        variant: 'danger',
      });
    }
  };

  React.useEffect(() => {
    handleRunSimulation();
    loadPolicyState();
  }, []);

  // Format action distribution data for Recharts BarChart
  const actionDistributionData = React.useMemo(() => {
    if (!simulationData) return [];
    const actions: BanditAction[] = [
      'increase_bid',
      'decrease_bid',
      'maintain_bid',
      'increase_budget',
      'decrease_budget',
    ];

    return actions.map((action) => {
      const row: Record<string, string | number> = { action: ACTION_LABELS[action] };
      for (const summary of simulationData.summaries) {
        row[summary.algorithm] = summary.actionCounts[action] || 0;
      }
      return row;
    });
  }, [simulationData]);

  return (
    <div className="space-y-6">
      {/* Simulation Controls Card */}
      <Card className="border-gray-800 bg-[#141b2d]/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                Bandit Simulation Lab
              </CardTitle>
              <CardDescription className="text-gray-400 text-xs">
                Simulate disjoint LinUCB (Sherman-Morrison inverse updates) and ε-Greedy against static and random baselines
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetPolicy}
                  className="border-gray-700 text-gray-300 hover:text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Reset Live Policies
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {isSimulating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Running Simulation...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1.5 fill-current" />
                    Run Simulation
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-lg bg-gray-900/60 border border-gray-800">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">Rounds (T)</label>
              <select
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={200}>200 Rounds</option>
                <option value={500}>500 Rounds (Standard)</option>
                <option value={1000}>1,000 Rounds</option>
                <option value={2000}>2,000 Rounds</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">PRNG Seed</label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-300 block mb-1.5">Algorithms</label>
              <div className="flex flex-wrap gap-2">
                {(['linucb', 'epsilon_greedy', 'static', 'random'] as BanditAlgorithm[]).map((algo) => {
                  const isSelected = selectedAlgos.includes(algo);
                  return (
                    <button
                      key={algo}
                      type="button"
                      onClick={() => toggleAlgo(algo)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {ALGO_LABELS[algo]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      {simulationData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {simulationData.summaries.map((summary) => (
            <Card
              key={summary.algorithm}
              className="border-gray-800 bg-[#141b2d]/60 relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: ALGO_COLORS[summary.algorithm] }}
              />
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300">
                    {ALGO_LABELS[summary.algorithm]}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {summary.algorithm}
                  </Badge>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-2xl font-bold text-white tracking-tight">
                    {summary.cumulativeReward.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400">
                    avg: {(summary.averageReward).toFixed(3)}/rnd
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-gray-800 text-xs">
                  <span className="text-gray-400">Total Regret:</span>
                  <span className="font-semibold text-rose-400">
                    {summary.regret.toFixed(1)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Simulation Performance Charts */}
      {simulationData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cumulative Reward Chart */}
          <Card className="border-gray-800 bg-[#141b2d]/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Cumulative Reward over Time
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                LinUCB balances exploration/exploitation to maximize cumulative policy payoff
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={simulationData.rewardHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="round" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderColor: '#475569',
                        borderRadius: '0.375rem',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    {simulationData.summaries.map((s) => (
                      <Line
                        key={s.algorithm}
                        type="monotone"
                        dataKey={s.algorithm}
                        name={ALGO_LABELS[s.algorithm]}
                        stroke={ALGO_COLORS[s.algorithm]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Cumulative Regret Chart */}
          <Card className="border-gray-800 bg-[#141b2d]/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                Cumulative Regret over Time
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Sub-linear regret indicates optimal asymptotic arm convergence (LinUCB)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={simulationData.regretHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="round" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderColor: '#475569',
                        borderRadius: '0.375rem',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    {simulationData.summaries.map((s) => (
                      <Line
                        key={s.algorithm}
                        type="monotone"
                        dataKey={s.algorithm}
                        name={ALGO_LABELS[s.algorithm]}
                        stroke={ALGO_COLORS[s.algorithm]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Distribution Histogram */}
      {simulationData && (
        <Card className="border-gray-800 bg-[#141b2d]/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              Action Selection Distribution
            </CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Total number of arm pulls allocated to each budget & bid modification action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actionDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="action" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#475569',
                      borderRadius: '0.375rem',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  {simulationData.summaries.map((s) => (
                    <Bar
                      key={s.algorithm}
                      dataKey={s.algorithm}
                      name={ALGO_LABELS[s.algorithm]}
                      fill={ALGO_COLORS[s.algorithm]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Math Architecture & Sherman-Morrison Explainer */}
      <Card className="border-gray-800 bg-[#141b2d]/40">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-gray-300 leading-relaxed">
              <p className="font-semibold text-white">Disjoint Contextual LinUCB Implementation Details</p>
              <p>
                Each action arm maintains a regularized design matrix inverse <code className="text-emerald-400 font-mono">A_a⁻¹</code> updated via the rank-1 Sherman-Morrison formula in <code className="text-emerald-400 font-mono">O(d²)</code> time, avoiding costly <code className="text-amber-400 font-mono">O(d³)</code> matrix inversions on every step.
              </p>
              <p className="text-gray-400">
                Context vector <code className="text-gray-300 font-mono">d = 12</code> includes bias, category one-hot encoding, experience level, location tier, rolling CTR, inverted CPA, conversion rate, and remaining budget fraction. Action exploration is governed by Upper Confidence Bound parameter <code className="text-emerald-400 font-mono">α = 0.8</code> and L2 regularization <code className="text-emerald-400 font-mono">λ = 1.0</code>.
              </p>
              {policyState && (
                <p className="text-emerald-400 font-mono text-[11px] pt-1">
                  Live LinUCB State: Version v{policyState.version} • Cumulative Pulls: {policyState.totalPulls}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
