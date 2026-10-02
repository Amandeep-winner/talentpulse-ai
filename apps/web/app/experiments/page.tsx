'use client';

import * as React from 'react';
import {
  ExperimentResultsResponse,
  ExperimentStatus,
} from '@talentpulse/shared';
import {
  FlaskConical,
  Plus,
  Play,
  Square,
  Sparkles,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

export default function ExperimentsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [experiments, setExperiments] = React.useState<ExperimentResultsResponse[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isCreating, setIsCreating] = React.useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState<boolean>(false);

  // New Experiment Form State
  const [newName, setNewName] = React.useState<string>('');
  const [newHypothesis, setNewHypothesis] = React.useState<string>('');
  const [variants, setVariants] = React.useState<Array<{ key: string; weight: number }>>([
    { key: 'control', weight: 50 },
    { key: 'variant_b', weight: 50 },
  ]);

  // Sandbox Test Assignment State
  const [testSubjectKey, setTestSubjectKey] = React.useState<string>('cand_user_42');
  const [testAssignmentResult, setTestAssignmentResult] = React.useState<string | null>(null);
  const [isAssigning, setIsAssigning] = React.useState<boolean>(false);

  const isAnalyst = user?.role === 'ANALYST';
  const canManage = !isAnalyst;

  const loadExperiments = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: ExperimentResultsResponse[] }>('/api/experiments');
      setExperiments(res.data);
      if (res.data.length > 0 && !selectedExperimentId) {
        setSelectedExperimentId(res.data[0]!.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error communicating with experiments API';
      addToast({
        title: 'Failed to load experiments',
        description: msg,
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadExperiments();
  }, []);

  const selectedExperiment = React.useMemo(() => {
    return experiments.find((e) => e.id === selectedExperimentId) ?? experiments[0] ?? null;
  }, [experiments, selectedExperimentId]);

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      addToast({ title: 'Validation Error', description: 'Experiment name is required', variant: 'danger' });
      return;
    }

    const totalWeight = variants.reduce((sum, v) => sum + Number(v.weight), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      addToast({
        title: 'Validation Error',
        description: `Variant weights must sum to 100% (currently ${totalWeight}%)`,
        variant: 'danger',
      });
      return;
    }

    setIsCreating(true);
    try {
      const res = await api.post<{ data: ExperimentResultsResponse }>('/api/experiments', {
        name: newName,
        hypothesis: newHypothesis || undefined,
        variants,
      });

      addToast({
        title: 'Experiment Created',
        description: `Successfully created experiment: ${res.data.name}`,
        variant: 'success',
      });

      setIsDialogOpen(false);
      setNewName('');
      setNewHypothesis('');
      setVariants([
        { key: 'control', weight: 50 },
        { key: 'variant_b', weight: 50 },
      ]);
      await loadExperiments();
      setSelectedExperimentId(res.data.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to create experiment';
      addToast({
        title: 'Creation Failed',
        description: msg,
        variant: 'danger',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStatusChange = async (experimentId: string, newStatus: ExperimentStatus) => {
    try {
      await api.patch(`/api/experiments/${experimentId}/status`, { status: newStatus });
      addToast({
        title: 'Status Updated',
        description: `Experiment status changed to ${newStatus}`,
        variant: 'success',
      });
      loadExperiments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to transition experiment status';
      addToast({
        title: 'Status Update Failed',
        description: msg,
        variant: 'danger',
      });
    }
  };

  const handleTestAssign = async () => {
    if (!selectedExperiment || !testSubjectKey.trim()) return;
    setIsAssigning(true);
    try {
      const res = await api.post<{
        data: { experimentId: string; subjectKey: string; variant: string; isNewExposure: boolean };
      }>(`/api/experiments/${selectedExperiment.id}/assign`, {
        subjectKey: testSubjectKey.trim(),
      });

      setTestAssignmentResult(
        `Assigned to: ${res.data.variant} (${res.data.isNewExposure ? 'New Exposure' : 'Existing Exposure'})`
      );
      addToast({
        title: 'Assignment Complete',
        description: `Subject ${res.data.subjectKey} assigned to ${res.data.variant}`,
        variant: 'success',
      });
      loadExperiments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign subject';
      addToast({
        title: 'Assignment Failed',
        description: msg,
        variant: 'danger',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleTestConvert = async () => {
    if (!selectedExperiment || !testSubjectKey.trim()) return;
    try {
      await api.post(`/api/experiments/${selectedExperiment.id}/convert`, {
        subjectKey: testSubjectKey.trim(),
      });
      addToast({
        title: 'Conversion Recorded',
        description: `Subject ${testSubjectKey} recorded as converted!`,
        variant: 'success',
      });
      loadExperiments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record conversion';
      addToast({
        title: 'Conversion Failed',
        description: msg,
        variant: 'danger',
      });
    }
  };

  const getStatusBadge = (status: ExperimentStatus) => {
    switch (status) {
      case 'RUNNING':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">RUNNING</Badge>;
      case 'STOPPED':
        return <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40">STOPPED</Badge>;
      case 'DRAFT':
      default:
        return <Badge variant="outline" className="text-gray-400">DRAFT</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-purple-400" />
            A/B Testing & Experiments
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Deterministic variant hashing, exposure logging, and two-proportion z-test statistical significance
          </p>
        </div>

        {canManage && (
          <Button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="h-4 w-4" />
            New Experiment
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl bg-gray-800/60" />
          <Skeleton className="h-64 md:col-span-2 rounded-xl bg-gray-800/60" />
        </div>
      ) : experiments.length === 0 ? (
        <EmptyState
          title="No experiments found"
          description="Create your first A/B experiment to evaluate hiring funnels, landing page copy, or allocation strategies."
          action={
            canManage ? (
              <Button onClick={() => setIsDialogOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Create Experiment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Experiments List Sidebar */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
              Active & Past Experiments ({experiments.length})
            </h2>
            <div className="space-y-2">
              {experiments.map((exp) => {
                const isSelected = selectedExperiment?.id === exp.id;
                return (
                  <Card
                    key={exp.id}
                    onClick={() => setSelectedExperimentId(exp.id)}
                    className={`cursor-pointer transition-all border ${
                      isSelected
                        ? 'border-purple-500/50 bg-[#1e2338]'
                        : 'border-gray-800 bg-[#141b2d]/60 hover:border-gray-700 hover:bg-[#141b2d]'
                    }`}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-white line-clamp-1">
                          {exp.name}
                        </span>
                        {getStatusBadge(exp.status)}
                      </div>
                      {exp.hypothesis && (
                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                          {exp.hypothesis}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-800/60 text-xs text-gray-400">
                        <span>Exposures: <strong className="text-white">{exp.totalExposures}</strong></span>
                        <span>Conv: <strong className="text-emerald-400">{exp.totalConversions}</strong></span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Experiment Details and Statistical Report */}
          {selectedExperiment && (
            <div className="lg:col-span-2 space-y-6">
              {/* Overview Card */}
              <Card className="border-gray-800 bg-[#141b2d]/80">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg text-white font-bold">
                          {selectedExperiment.name}
                        </CardTitle>
                        {getStatusBadge(selectedExperiment.status)}
                      </div>
                      <CardDescription className="text-xs text-gray-400 mt-1">
                        {selectedExperiment.hypothesis || 'No hypothesis specified'}
                      </CardDescription>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-2">
                        {selectedExperiment.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            onClick={() => handleStatusChange(selectedExperiment.id, 'RUNNING')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          >
                            <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                            Start Experiment
                          </Button>
                        )}
                        {selectedExperiment.status === 'RUNNING' && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleStatusChange(selectedExperiment.id, 'STOPPED')}
                            className="text-xs"
                          >
                            <Square className="w-3.5 h-3.5 mr-1 fill-current" />
                            Stop Experiment
                          </Button>
                        )}
                        {selectedExperiment.status === 'STOPPED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(selectedExperiment.id, 'RUNNING')}
                            className="border-gray-700 text-gray-300 text-xs"
                          >
                            <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                            Restart
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* High level metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                      <span className="text-[11px] text-gray-400 block">Total Exposures</span>
                      <span className="text-xl font-bold text-white tracking-tight">
                        {selectedExperiment.totalExposures}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                      <span className="text-[11px] text-gray-400 block">Total Conversions</span>
                      <span className="text-xl font-bold text-emerald-400 tracking-tight">
                        {selectedExperiment.totalConversions}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                      <span className="text-[11px] text-gray-400 block">Overall Conv Rate</span>
                      <span className="text-xl font-bold text-white tracking-tight">
                        {selectedExperiment.totalExposures > 0
                          ? ((selectedExperiment.totalConversions / selectedExperiment.totalExposures) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                      <span className="text-[11px] text-gray-400 block">Significance</span>
                      <div className="mt-1">
                        {selectedExperiment.hasSufficientData ? (
                          selectedExperiment.winner ? (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                              Winner: {selectedExperiment.winner}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-400 text-[10px]">
                              No Winner Yet
                            </Badge>
                          )
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-[10px]">
                            N &lt; 30 (Guarded)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Insufficient Data Guard Alert */}
                  {!selectedExperiment.hasSufficientData && (
                    <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Statistical significance is guarded until each arm records at least <strong>30 exposures</strong> to prevent false positives from under-powered sample sizes.
                      </span>
                    </div>
                  )}

                  {/* Variant Comparison Table */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                      Variant Comparison & Significance Analysis
                    </h3>
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-gray-900/80">
                          <TableRow className="border-gray-800 hover:bg-transparent">
                            <TableHead className="text-xs font-semibold text-gray-300">Variant</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-center">Weight</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-right">Exposures</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-right">Conv</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-right">Conv Rate</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-right">Lift vs Ctrl</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-right">p-value (z-test)</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-300 text-center">Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedExperiment.stats.map((stat, idx) => {
                            const isControl = idx === 0 || stat.variant.toLowerCase() === 'control';
                            const liftVal = stat.lift !== null && stat.lift !== undefined ? stat.lift * 100 : null;

                            return (
                              <TableRow key={stat.variant} className="border-gray-800 hover:bg-gray-800/40">
                                <TableCell className="font-semibold text-xs text-white">
                                  {stat.variant}
                                  {isControl && (
                                    <span className="ml-2 text-[10px] text-gray-400 font-normal">
                                      (Baseline)
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-xs text-gray-300">
                                  {stat.weight}%
                                </TableCell>
                                <TableCell className="text-right text-xs text-gray-300 font-mono">
                                  {stat.exposures}
                                </TableCell>
                                <TableCell className="text-right text-xs text-emerald-400 font-mono">
                                  {stat.conversions}
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold text-white font-mono">
                                  {(stat.conversionRate * 100).toFixed(1)}%
                                </TableCell>
                                <TableCell className="text-right text-xs font-mono">
                                  {isControl ? (
                                    <span className="text-gray-500">—</span>
                                  ) : liftVal !== null ? (
                                    <span
                                      className={
                                        liftVal > 0
                                          ? 'text-emerald-400 font-semibold'
                                          : liftVal < 0
                                          ? 'text-rose-400 font-semibold'
                                          : 'text-gray-400'
                                      }
                                    >
                                      {liftVal > 0 ? '+' : ''}
                                      {liftVal.toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-gray-500">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs font-mono">
                                  {isControl ? (
                                    <span className="text-gray-500">—</span>
                                  ) : stat.pValue !== null && stat.pValue !== undefined ? (
                                    <span className={stat.significant ? 'text-emerald-400 font-semibold' : 'text-gray-400'}>
                                      p = {stat.pValue.toFixed(4)}
                                    </span>
                                  ) : (
                                    <span className="text-amber-400 text-[11px]">N &lt; 30</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {isControl ? (
                                    <Badge variant="outline" className="text-[10px] text-gray-400">
                                      Control
                                    </Badge>
                                  ) : stat.significant ? (
                                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                                      Significant (p &lt; .05)
                                    </Badge>
                                  ) : stat.exposures < 30 ? (
                                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                                      Collecting Data
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-gray-400">
                                      Not Significant
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Interactive Assignment & Conversion Sandbox */}
                  <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <h4 className="text-xs font-semibold text-white">
                        Deterministic Assignment Sandbox
                      </h4>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Simulate how candidate or candidate-visit subject IDs map to variants via <code className="text-purple-300 font-mono">hash(expId + subjectKey) % 100</code>.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <Input
                        value={testSubjectKey}
                        onChange={(e) => setTestSubjectKey(e.target.value)}
                        placeholder="Subject Key (e.g. user_uuid)"
                        className="bg-gray-800 border-gray-700 text-xs text-white"
                      />
                      <Button
                        size="sm"
                        onClick={handleTestAssign}
                        disabled={isAssigning}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs shrink-0"
                      >
                        {isAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                        Assign Subject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTestConvert}
                        className="border-gray-700 text-emerald-400 hover:text-emerald-300 text-xs shrink-0"
                      >
                        Record Conversion
                      </Button>
                    </div>
                    {testAssignmentResult && (
                      <p className="text-xs text-purple-300 font-mono pt-1">
                        {testAssignmentResult}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* New Experiment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-[#141b2d] border-gray-800 text-white sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-400" />
              Create A/B Experiment
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs">
              Define experimental hypothesis and traffic split weights.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateExperiment} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Experiment Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Optimized Apply CTA vs Standard"
                className="bg-gray-900 border-gray-700 text-xs text-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Hypothesis</label>
              <textarea
                value={newHypothesis}
                onChange={(e) => setNewHypothesis(e.target.value)}
                placeholder="e.g. Personalized skill tags increase application start conversion by 10%."
                rows={3}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Variants & Traffic Split (%)</label>
              <div className="space-y-2">
                {variants.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={v.key}
                      onChange={(e) => {
                        const updated = [...variants];
                        if (updated[idx]) {
                          updated[idx].key = e.target.value;
                          setVariants(updated);
                        }
                      }}
                      placeholder="Variant Key"
                      className="bg-gray-900 border-gray-700 text-xs text-white flex-1"
                    />
                    <div className="flex items-center gap-1 w-28">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={v.weight}
                        onChange={(e) => {
                          const updated = [...variants];
                          if (updated[idx]) {
                            updated[idx].weight = Number(e.target.value);
                            setVariants(updated);
                          }
                        }}
                        className="bg-gray-900 border-gray-700 text-xs text-white text-right"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="border-gray-700 text-gray-300 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
              >
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Create Experiment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
