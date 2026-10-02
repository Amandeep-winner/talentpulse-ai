'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CampaignItem,
  CampaignStatus,
  PublisherItem,
  PublisherType,
  JobItem,
  CampaignPublisherItem,
  EventsIngestionResponse,
} from '@talentpulse/shared';
import {
  Plus,
  Search,
  Megaphone,
  Share2,
  Calendar,
  RefreshCw,
  Play,
  Sliders,
  AlertCircle,
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

const STATUS_BADGES: Record<CampaignStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
};

const PUBLISHER_TYPES: PublisherType[] = [
  'JOB_BOARD',
  'SOCIAL',
  'SEARCH',
  'AGGREGATOR',
  'REFERRAL',
];

export default function CampaignsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [campaigns, setCampaigns] = React.useState<CampaignItem[]>([]);
  const [publishers, setPublishers] = React.useState<PublisherItem[]>([]);
  const [jobs, setJobs] = React.useState<JobItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  // Create Campaign Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [newCampaign, setNewCampaign] = React.useState({
    name: '',
    jobId: '',
    budget: 50000,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
  });

  // Publishers Management Modal
  const [isPublishersOpen, setIsPublishersOpen] = React.useState(false);
  const [newPubName, setNewPubName] = React.useState('');
  const [newPubType, setNewPubType] = React.useState<PublisherType>('JOB_BOARD');
  const [isAddingPub, setIsAddingPub] = React.useState(false);

  // Allocations Editor Modal
  const [selectedCampaign, setSelectedCampaign] = React.useState<CampaignItem | null>(null);
  const [allocations, setAllocations] = React.useState<
    Array<{ publisherId: string; allocationPct: number; bidCpc: number; dailyBudget: number }>
  >([]);
  const [isSavingAllocations, setIsSavingAllocations] = React.useState(false);

  // Event Simulator State
  const [isSimulating, setIsSimulating] = React.useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';
  const isAdmin = user?.role === 'ADMIN';

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [campRes, pubRes, jobsRes] = await Promise.all([
        api.get<{ data: CampaignItem[] }>('/api/campaigns?pageSize=50'),
        api.get<{ data: PublisherItem[] }>('/api/publishers'),
        api.get<{ data: JobItem[] }>('/api/jobs?pageSize=100'),
      ]);
      setCampaigns(campRes.data || []);
      setPublishers(pubRes.data || []);
      setJobs(jobsRes.data || []);
    } catch {
      addToast({
        title: 'Loading failed',
        description: 'Failed to load campaigns and publishers from API',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Create Campaign
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.name || !newCampaign.jobId || !newCampaign.budget) {
      addToast({
        title: 'Validation Error',
        description: 'Please provide campaign name, linked job, and budget',
        variant: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<{ data: CampaignItem }>('/api/campaigns', {
        name: newCampaign.name,
        jobId: newCampaign.jobId,
        budget: Number(newCampaign.budget),
        startDate: new Date(newCampaign.startDate || Date.now()).toISOString(),
        endDate: newCampaign.endDate ? new Date(newCampaign.endDate).toISOString() : null,
        status: 'ACTIVE',
      });

      setCampaigns((prev) => [res.data, ...prev]);
      addToast({
        title: 'Campaign Created',
        description: `Successfully launched campaign "${newCampaign.name}"`,
        variant: 'success',
      });

      setIsCreateOpen(false);
      setNewCampaign({
        name: '',
        jobId: '',
        budget: 50000,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign';
      addToast({
        title: 'Create Failed',
        description: message,
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Publisher
  const handleAddPublisher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPubName.trim()) return;

    setIsAddingPub(true);
    try {
      const res = await api.post<{ data: PublisherItem }>('/api/publishers', {
        name: newPubName.trim(),
        type: newPubType,
      });

      setPublishers((prev) => [...prev, res.data]);
      setNewPubName('');
      addToast({
        title: 'Publisher Connected',
        description: `Added "${res.data.name}" to channel network`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not add publisher';
      addToast({
        title: 'Error',
        description: message,
        variant: 'danger',
      });
    } finally {
      setIsAddingPub(false);
    }
  };

  // Open Allocations Editor
  const openAllocationsModal = async (campaign: CampaignItem) => {
    setSelectedCampaign(campaign);
    try {
      const res = await api.get<{ data: CampaignPublisherItem[] }>(
        `/api/campaigns/${campaign.id}/allocations`,
      );
      if (res.data && res.data.length > 0) {
        setAllocations(
          res.data.map((cp) => ({
            publisherId: cp.publisherId,
            allocationPct: cp.allocationPct,
            bidCpc: cp.bidCpc,
            dailyBudget: cp.dailyBudget,
          })),
        );
      } else if (publishers.length > 0) {
        // Default equal distribution across first 2 publishers
        const defaultPubs = publishers.slice(0, 2);
        const split = Math.floor(100 / defaultPubs.length);
        setAllocations(
          defaultPubs.map((p, idx) => ({
            publisherId: p.id,
            allocationPct: idx === 0 ? 100 - split * (defaultPubs.length - 1) : split,
            bidCpc: 25,
            dailyBudget: 1000,
          })),
        );
      } else {
        setAllocations([]);
      }
    } catch {
      setAllocations([]);
    }
  };

  // Save Allocations
  const handleSaveAllocations = async () => {
    if (!selectedCampaign) return;

    const totalPct = allocations.reduce((sum, a) => sum + Number(a.allocationPct || 0), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      addToast({
        title: 'Allocation Error',
        description: `Total allocations sum to ${totalPct.toFixed(1)}%. They must equal exactly 100%.`,
        variant: 'warning',
      });
      return;
    }

    setIsSavingAllocations(true);
    try {
      await api.put(`/api/campaigns/${selectedCampaign.id}/allocations`, {
        allocations: allocations.map((a) => ({
          publisherId: a.publisherId,
          allocationPct: Number(a.allocationPct),
          bidCpc: Number(a.bidCpc),
          dailyBudget: Number(a.dailyBudget),
        })),
      });

      addToast({
        title: 'Allocations Saved',
        description: 'Publisher distribution updated successfully',
        variant: 'success',
      });

      setSelectedCampaign(null);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save allocations';
      addToast({
        title: 'Error',
        description: message,
        variant: 'danger',
      });
    } finally {
      setIsSavingAllocations(false);
    }
  };

  // Run Event Simulator (Admin tool)
  const handleRunSimulator = async () => {
    if (campaigns.length === 0 || publishers.length === 0) {
      addToast({
        title: 'Simulation Unavailable',
        description: 'Need at least one campaign and publisher to simulate events',
        variant: 'warning',
      });
      return;
    }

    setIsSimulating(true);
    try {
      const activeCampaign = campaigns[0];
      const pub = publishers[0];
      if (!activeCampaign || !pub) {
        addToast({
          title: 'Simulation Unavailable',
          description: 'Need at least one campaign and publisher to simulate events',
          variant: 'warning',
        });
        return;
      }

      const now = new Date().toISOString();

      const demoEvents = [
        {
          eventId: `sim-imp-${Date.now()}-1`,
          campaignId: activeCampaign.id,
          publisherId: pub.id,
          eventType: 'IMPRESSION' as const,
          timestamp: now,
          quantity: 25,
        },
        {
          eventId: `sim-clk-${Date.now()}-2`,
          campaignId: activeCampaign.id,
          publisherId: pub.id,
          eventType: 'CLICK' as const,
          timestamp: now,
          quantity: 5,
        },
        {
          eventId: `sim-app-${Date.now()}-3`,
          campaignId: activeCampaign.id,
          publisherId: pub.id,
          eventType: 'APPLICATION' as const,
          timestamp: now,
          quantity: 2,
          qualifiedQuantity: 1,
        },
      ];

      const res = await api.post<EventsIngestionResponse>('/api/events', {
        events: demoEvents,
      });

      addToast({
        title: 'Simulator Completed',
        description: `Ingested ${res.accepted} events, ${res.duplicates} duplicates, ${res.rejected.length} rejected`,
        variant: 'success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Simulation failed';
      addToast({
        title: 'Simulation Error',
        description: message,
        variant: 'danger',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Filtered campaigns
  const filteredCampaigns = React.useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesJob = c.job?.title.toLowerCase().includes(q);
        return matchesName || matchesJob;
      }
      return true;
    });
  }, [campaigns, statusFilter, search]);

  const totalBudget = React.useMemo(() => {
    return campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
  }, [campaigns]);

  const activeCount = React.useMemo(() => {
    return campaigns.filter((c) => c.status === 'ACTIVE').length;
  }, [campaigns]);

  const currentAllocationTotal = React.useMemo(() => {
    return allocations.reduce((sum, a) => sum + Number(a.allocationPct || 0), 0);
  }, [allocations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">
            Ad Campaigns & Channels
          </h1>
          <p className="text-sm text-gray-400">
            Distribute recruitment spend across job boards and search networks with dynamic allocations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunSimulator}
              disabled={isSimulating}
              className="flex items-center gap-1.5 border-purple-800/60 bg-purple-950/30 text-purple-300 hover:bg-purple-900/50 hover:text-white"
            >
              <Play className={`h-3.5 w-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              {isSimulating ? 'Simulating...' : 'Simulate Events'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPublishersOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5 text-gray-400" />
            Publishers ({publishers.length})
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-gray-400">Active Campaigns</div>
          <div className="mt-1 text-2xl font-bold text-gray-100">{activeCount}</div>
          <div className="mt-1 text-xs text-gray-500">
            {campaigns.length} total campaigns configured
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-gray-400">Total Program Budget</div>
          <div className="mt-1 text-2xl font-bold text-gray-100">
            ₹{totalBudget.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-gray-500">Across all requisition channels</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-gray-400">Connected Publishers</div>
          <div className="mt-1 text-2xl font-bold text-gray-100">{publishers.length}</div>
          <div className="mt-1 text-xs text-gray-500">Job boards & search networks</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-gray-400">Event Ingestion</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">Active & Idempotent</div>
          <div className="mt-1 text-xs text-gray-500">Dual JWT and API-key verified</div>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search campaigns or jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-40"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="PAUSED">Paused</option>
              <option value="COMPLETED">Completed</option>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              className="h-9 px-3"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns found"
            description="Create your first advertising campaign to distribute open requisitions."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Launch First Campaign
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Linked Requisition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((camp) => (
                <TableRow key={camp.id}>
                  <TableCell>
                    <div className="font-semibold text-gray-100">{camp.name}</div>
                    <div className="text-xs text-gray-500">
                      {camp.publishers?.length || 0} publishers allocated
                    </div>
                  </TableCell>
                  <TableCell>
                    {camp.job ? (
                      <div>
                        <Link
                          href={`/jobs/${camp.job.id}`}
                          className="font-medium text-gray-200 hover:text-blue-400 transition-colors"
                        >
                          {camp.job.title}
                        </Link>
                        <div className="text-xs text-gray-500">{camp.job.location}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">Job ID: {camp.jobId}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGES[camp.status]}>{camp.status}</Badge>
                  </TableCell>
                  <TableCell className="font-medium text-gray-200">
                    ₹{camp.budget.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-gray-500" />
                      {new Date(camp.startDate).toLocaleDateString()}
                      {camp.endDate ? ` - ${new Date(camp.endDate).toLocaleDateString()}` : ' (Ongoing)'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAllocationsModal(camp)}
                        className="h-8 text-xs gap-1"
                      >
                        <Sliders className="h-3 w-3" />
                        Allocations
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create Campaign Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>Launch Ad Campaign</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Input
                label="Campaign Name"
                placeholder="e.g. Q4 Cloud Architect Drive"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                required
              />

              <Select
                label="Target Job Requisition"
                value={newCampaign.jobId}
                onChange={(e) => setNewCampaign({ ...newCampaign, jobId: e.target.value })}
                required
              >
                <option value="">Select requisition...</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} ({job.location})
                  </option>
                ))}
              </Select>

              <Input
                label="Total Campaign Budget (₹)"
                type="number"
                min="1000"
                value={newCampaign.budget}
                onChange={(e) =>
                  setNewCampaign({ ...newCampaign, budget: Number(e.target.value) })
                }
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Start Date"
                  type="date"
                  value={newCampaign.startDate}
                  onChange={(e) =>
                    setNewCampaign({ ...newCampaign, startDate: e.target.value })
                  }
                  required
                />
                <Input
                  label="End Date (Optional)"
                  type="date"
                  value={newCampaign.endDate}
                  onChange={(e) => setNewCampaign({ ...newCampaign, endDate: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Launching...' : 'Create Campaign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Publishers Management Dialog */}
      <Dialog open={isPublishersOpen} onOpenChange={setIsPublishersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connected Advertising Channels</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {canManage && (
              <form onSubmit={handleAddPublisher} className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
                <div className="text-xs font-semibold text-gray-300">Connect New Channel</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Publisher Name (e.g. Indeed)"
                    value={newPubName}
                    onChange={(e) => setNewPubName(e.target.value)}
                    required
                  />
                  <Select
                    value={newPubType}
                    onChange={(e) => setNewPubType(e.target.value as PublisherType)}
                  >
                    {PUBLISHER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isAddingPub || !newPubName.trim()}
                  className="w-full"
                >
                  {isAddingPub ? 'Connecting...' : 'Add Channel'}
                </Button>
              </form>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2">
              <div className="text-xs font-medium text-gray-400">Configured Publishers:</div>
              {publishers.length === 0 ? (
                <div className="text-xs text-gray-500 py-2">No publishers configured yet.</div>
              ) : (
                publishers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-200">{p.name}</span>
                    <Badge variant="default" className="text-[10px]">
                      {p.type}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPublishersOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocations Editor Dialog */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Budget Allocations: {selectedCampaign?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Total Allocation:</span>
              <span
                className={`font-bold ${
                  Math.abs(currentAllocationTotal - 100) < 0.01
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {currentAllocationTotal}% / 100%
              </span>
            </div>

            {Math.abs(currentAllocationTotal - 100) >= 0.01 && (
              <div className="flex items-center gap-1.5 rounded bg-amber-950/30 border border-amber-800/60 p-2 text-xs text-amber-300">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                Allocations must sum to exactly 100% across all publishers.
              </div>
            )}

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {publishers.map((pub) => {
                const current = allocations.find((a) => a.publisherId === pub.id) || {
                  publisherId: pub.id,
                  allocationPct: 0,
                  bidCpc: 25,
                  dailyBudget: 1000,
                };

                return (
                  <div
                    key={pub.id}
                    className="rounded border border-gray-800 bg-gray-900/60 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-200">{pub.name}</span>
                      <Badge variant="default" className="text-[10px]">
                        {pub.type}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] text-gray-400">Allocation (%)</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={current.allocationPct}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAllocations((prev) => {
                              const existingIdx = prev.findIndex((a) => a.publisherId === pub.id);
                              if (existingIdx >= 0 && prev[existingIdx]) {
                                const next = [...prev];
                                const currentItem = prev[existingIdx]!;
                                next[existingIdx] = { ...currentItem, allocationPct: val };
                                return next;
                              }
                              return [
                                ...prev,
                                {
                                  publisherId: pub.id,
                                  allocationPct: val,
                                  bidCpc: current.bidCpc,
                                  dailyBudget: current.dailyBudget,
                                },
                              ];
                            });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-gray-400">Bid CPC (₹)</label>
                        <Input
                          type="number"
                          min="1"
                          value={current.bidCpc}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAllocations((prev) => {
                              const existingIdx = prev.findIndex((a) => a.publisherId === pub.id);
                              if (existingIdx >= 0 && prev[existingIdx]) {
                                const next = [...prev];
                                const currentItem = prev[existingIdx]!;
                                next[existingIdx] = { ...currentItem, bidCpc: val };
                                return next;
                              }
                              return [
                                ...prev,
                                {
                                  publisherId: pub.id,
                                  allocationPct: current.allocationPct,
                                  bidCpc: val,
                                  dailyBudget: current.dailyBudget,
                                },
                              ];
                            });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-gray-400">Daily Cap (₹)</label>
                        <Input
                          type="number"
                          min="0"
                          value={current.dailyBudget}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAllocations((prev) => {
                              const existingIdx = prev.findIndex((a) => a.publisherId === pub.id);
                              if (existingIdx >= 0 && prev[existingIdx]) {
                                const next = [...prev];
                                const currentItem = prev[existingIdx]!;
                                next[existingIdx] = { ...currentItem, dailyBudget: val };
                                return next;
                              }
                              return [
                                ...prev,
                                {
                                  publisherId: pub.id,
                                  allocationPct: current.allocationPct,
                                  bidCpc: current.bidCpc,
                                  dailyBudget: val,
                                },
                              ];
                            });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedCampaign(null)}
              disabled={isSavingAllocations}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveAllocations}
              disabled={isSavingAllocations || Math.abs(currentAllocationTotal - 100) >= 0.01}
            >
              {isSavingAllocations ? 'Saving...' : 'Save Allocations'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
