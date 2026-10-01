'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ApplicationItem,
  ApplicationStatus,
  CandidateItem,
  JobItem,
} from '@talentpulse/shared';
import {
  Plus,
  Search,
  Briefcase,
  Calendar,
  ChevronRight,
  RefreshCw,
  LayoutGrid,
  List,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

interface StageConfig {
  id: ApplicationStatus;
  label: string;
  color: string;
  badgeVariant: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const STAGES: StageConfig[] = [
  { id: 'APPLIED', label: 'Applied', color: 'border-blue-500/40 bg-blue-950/10', badgeVariant: 'info' },
  { id: 'SCREENING', label: 'Screening', color: 'border-indigo-500/40 bg-indigo-950/10', badgeVariant: 'info' },
  { id: 'INTERVIEW', label: 'Interview', color: 'border-purple-500/40 bg-purple-950/10', badgeVariant: 'warning' },
  { id: 'OFFER', label: 'Offer', color: 'border-amber-500/40 bg-amber-950/10', badgeVariant: 'warning' },
  { id: 'HIRED', label: 'Hired', color: 'border-emerald-500/40 bg-emerald-950/10', badgeVariant: 'success' },
  { id: 'REJECTED', label: 'Rejected', color: 'border-rose-500/40 bg-rose-950/10', badgeVariant: 'danger' },
  { id: 'WITHDRAWN', label: 'Withdrawn', color: 'border-gray-500/40 bg-gray-900/40', badgeVariant: 'default' },
];

const NEXT_STAGE: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  APPLIED: 'SCREENING',
  SCREENING: 'INTERVIEW',
  INTERVIEW: 'OFFER',
  OFFER: 'HIRED',
};

const ALLOWED_TARGETS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export default function ApplicationsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [applications, setApplications] = React.useState<ApplicationItem[]>([]);
  const [jobs, setJobs] = React.useState<JobItem[]>([]);
  const [candidates, setCandidates] = React.useState<CandidateItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  // Filters
  const [selectedJobId, setSelectedJobId] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'board' | 'list'>('board');

  // New Application Dialog
  const [isNewDialogOpen, setIsNewDialogOpen] = React.useState(false);
  const [newCandidateId, setNewCandidateId] = React.useState('');
  const [newJobId, setNewJobId] = React.useState('');
  const [newSource, setNewSource] = React.useState('Career Page');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [appsRes, jobsRes, candidatesRes] = await Promise.all([
        api.get<{ data: ApplicationItem[] }>('/api/applications?pageSize=100'),
        api.get<{ data: JobItem[] }>('/api/jobs?pageSize=100'),
        api.get<{ data: CandidateItem[] }>('/api/candidates?pageSize=100'),
      ]);
      setApplications(appsRes.data || []);
      setJobs(jobsRes.data || []);
      setCandidates(candidatesRes.data || []);
    } catch {
      addToast({
        title: 'Error loading applications',
        description: 'Failed to load pipeline applications',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusTransition = async (applicationId: string, newStatus: ApplicationStatus) => {
    setUpdatingId(applicationId);
    try {
      const res = await api.patch<{ data: ApplicationItem }>(`/api/applications/${applicationId}`, {
        status: newStatus,
      });

      setApplications((prev) =>
        prev.map((app) => (app.id === applicationId ? res.data : app)),
      );

      addToast({
        title: 'Stage Updated',
        description: `Candidate moved to ${newStatus}`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Status transition failed';
      addToast({
        title: 'Transition Failed',
        description: message,
        variant: 'danger',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCandidateId || !newJobId) {
      addToast({
        title: 'Missing Selection',
        description: 'Please select both a candidate and a job requisition',
        variant: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<{ data: ApplicationItem }>('/api/applications', {
        candidateId: newCandidateId,
        jobId: newJobId,
        source: newSource || null,
        status: 'APPLIED',
      });

      setApplications((prev) => [res.data, ...prev]);
      addToast({
        title: 'Application Created',
        description: `Successfully added ${res.data.candidate.name} to ${res.data.job.title}`,
        variant: 'success',
      });

      setIsNewDialogOpen(false);
      setNewCandidateId('');
      setNewJobId('');
      setNewSource('Career Page');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create application';
      addToast({
        title: 'Error',
        description: message,
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered applications
  const filteredApps = React.useMemo(() => {
    return applications.filter((app) => {
      if (selectedJobId !== 'ALL' && app.jobId !== selectedJobId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = app.candidate.name.toLowerCase().includes(q);
        const matchesEmail = app.candidate.email.toLowerCase().includes(q);
        const matchesJob = app.job.title.toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesJob;
      }
      return true;
    });
  }, [applications, selectedJobId, searchQuery]);

  // Stage breakdown counts
  const stageCounts = React.useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      APPLIED: 0,
      SCREENING: 0,
      INTERVIEW: 0,
      OFFER: 0,
      HIRED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };
    for (const app of filteredApps) {
      if (counts[app.status] !== undefined) {
        counts[app.status] += 1;
      }
    }
    return counts;
  }, [filteredApps]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">Applications Pipeline</h1>
          <p className="text-sm text-gray-400">
            Track candidates through recruitment stages from application to offer and hire.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canManage && (
            <Button
              size="sm"
              onClick={() => setIsNewDialogOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Application
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stage Badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((stage) => (
          <div
            key={stage.id}
            className={`rounded-lg border p-3 ${stage.color} transition-colors`}
          >
            <div className="text-xs font-medium text-gray-400">{stage.label}</div>
            <div className="mt-1 text-xl font-bold text-gray-100">
              {stageCounts[stage.id] || 0}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search candidate or job..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Requisition Filter */}
            <div className="w-full sm:w-64">
              <Select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
              >
                <option value="ALL">All Job Requisitions</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} ({job.location})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-md border border-gray-800 bg-gray-900/80 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'board'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : filteredApps.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No applications found"
          description={
            applications.length === 0
              ? 'No candidates have applied to your jobs yet. Create an application to get started.'
              : 'No applications match your active filters.'
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setIsNewDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add First Application
              </Button>
            ) : undefined
          }
        />
      ) : activeTab === 'board' ? (
        /* Kanban Board View */
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
          {STAGES.map((stage) => {
            const stageApps = filteredApps.filter((app) => app.status === stage.id);
            return (
              <div
                key={stage.id}
                className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-gray-800 bg-gray-900/60"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-gray-800 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-200">
                      {stage.label}
                    </span>
                    <Badge variant={stage.badgeVariant} className="px-1.5 py-0 text-[10px]">
                      {stageApps.length}
                    </Badge>
                  </div>
                </div>

                {/* Column Body / Cards */}
                <div className="flex flex-1 flex-col gap-3 p-3 min-h-[300px]">
                  {stageApps.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded border border-dashed border-gray-800/80 p-4 text-center text-xs text-gray-500">
                      No candidates in {stage.label.toLowerCase()}
                    </div>
                  ) : (
                    stageApps.map((app) => {
                      const next = NEXT_STAGE[app.status];
                      const allowed = ALLOWED_TARGETS[app.status] || [];
                      const isUpdating = updatingId === app.id;

                      return (
                        <div
                          key={app.id}
                          className="rounded-md border border-gray-800 bg-gray-950/80 p-3.5 shadow-sm transition hover:border-gray-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/candidates/${app.candidateId}`}
                              className="text-sm font-semibold text-gray-100 hover:text-blue-400 transition-colors"
                            >
                              {app.candidate.name}
                            </Link>
                          </div>

                          <div className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                            <Briefcase className="h-3 w-3 text-gray-500" />
                            <Link
                              href={`/jobs/${app.jobId}`}
                              className="hover:text-gray-200 truncate max-w-[200px]"
                            >
                              {app.job.title}
                            </Link>
                          </div>

                          {/* Candidate Skills preview */}
                          {app.candidate.skills && app.candidate.skills.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {app.candidate.skills.slice(0, 3).map((skill) => (
                                <Badge
                                  key={skill}
                                  variant="default"
                                  className="text-[10px] px-1.5 py-0 bg-gray-900 border-gray-800 text-gray-300"
                                >
                                  {skill}
                                </Badge>
                              ))}
                              {app.candidate.skills.length > 3 && (
                                <span className="text-[10px] text-gray-500 self-center">
                                  +{app.candidate.skills.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Meta: Source & Date */}
                          <div className="mt-3 flex items-center justify-between border-t border-gray-800/60 pt-2 text-[11px] text-gray-500">
                            <span>{app.source || 'Direct'}</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(app.appliedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>

                          {/* Pipeline Transition Actions */}
                          {canManage && allowed.length > 0 && (
                            <div className="mt-3 flex items-center gap-1.5 border-t border-gray-800/80 pt-2.5">
                              {next && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => handleStatusTransition(app.id, next)}
                                  className="flex-1 h-7 text-xs bg-blue-950/30 border-blue-800/60 text-blue-300 hover:bg-blue-900/50 hover:text-white"
                                >
                                  Advance
                                  <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                                </Button>
                              )}
                              <Select
                                disabled={isUpdating}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleStatusTransition(app.id, e.target.value as ApplicationStatus);
                                  }
                                }}
                                className="h-7 text-[11px] py-0 px-2 max-w-[90px]"
                              >
                                <option value="" disabled>
                                  Move...
                                </option>
                                {allowed.map((target) => (
                                  <option key={target} value={target}>
                                    {target}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          )}

                          {allowed.length === 0 && (
                            <div className="mt-2.5 text-center text-[10px] text-gray-500 font-medium py-1 rounded bg-gray-900/60">
                              Terminal Stage
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Requisition</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Applied Date</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.map((app) => {
                const stageConfig = STAGES.find((s) => s.id === app.status);
                const next = NEXT_STAGE[app.status];
                const allowed = ALLOWED_TARGETS[app.status] || [];
                const isUpdating = updatingId === app.id;

                return (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/candidates/${app.candidateId}`}
                          className="font-medium text-gray-100 hover:text-blue-400 transition-colors"
                        >
                          {app.candidate.name}
                        </Link>
                        <div className="text-xs text-gray-500">{app.candidate.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/jobs/${app.jobId}`}
                        className="text-gray-300 hover:text-blue-400 transition-colors"
                      >
                        {app.job.title}
                      </Link>
                      <div className="text-xs text-gray-500">{app.job.location}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={stageConfig?.badgeVariant || 'default'}>
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {app.source || 'Direct'}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {new Date(app.appliedAt).toLocaleDateString()}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {next && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdating}
                              onClick={() => handleStatusTransition(app.id, next)}
                              className="h-8 text-xs"
                            >
                              Advance to {next}
                            </Button>
                          )}
                          {allowed.length > 0 && (
                            <Select
                              disabled={isUpdating}
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleStatusTransition(app.id, e.target.value as ApplicationStatus);
                                }
                              }}
                              className="h-8 text-xs max-w-[130px]"
                            >
                              <option value="" disabled>
                                Change status...
                              </option>
                              {allowed.map((target) => (
                                <option key={target} value={target}>
                                  {target}
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* New Application Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateApplication}>
            <DialogHeader>
              <DialogTitle>New Candidate Application</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Select
                  label="Select Candidate"
                  value={newCandidateId}
                  onChange={(e) => setNewCandidateId(e.target.value)}
                  required
                >
                  <option value="">Choose candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </Select>
                {candidates.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    No candidates available. Create candidate profiles first in Candidates page.
                  </p>
                )}
              </div>

              <div>
                <Select
                  label="Select Job Requisition"
                  value={newJobId}
                  onChange={(e) => setNewJobId(e.target.value)}
                  required
                >
                  <option value="">Choose requisition...</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.location})
                    </option>
                  ))}
                </Select>
                {jobs.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    No jobs available. Create a job requisition first in Jobs page.
                  </p>
                )}
              </div>

              <div>
                <Input
                  label="Application Source"
                  placeholder="e.g. LinkedIn, Referral, Inbound"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !newCandidateId || !newJobId}
              >
                {isSubmitting ? 'Creating...' : 'Create Application'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
