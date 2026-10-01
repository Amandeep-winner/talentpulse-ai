'use client';

import * as React from 'react';
import Link from 'next/link';
import { JobItem, PaginationMeta, CreateJobRequest, JobStatus, EmploymentType } from '@talentpulse/shared';
import { Briefcase, Plus, Search, Filter, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

export default function JobsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [jobs, setJobs] = React.useState<JobItem[]>([]);
  const [meta, setMeta] = React.useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);

  // Create Job Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    title: '',
    description: '',
    category: 'Engineering',
    location: '',
    remote: true,
    employmentType: 'FULL_TIME' as EmploymentType,
    salaryMin: '',
    salaryMax: '',
    minExperienceYears: 2,
    requiredSkills: '',
    preferredSkills: '',
    status: 'OPEN' as JobStatus,
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';

  const fetchJobs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '15');
      if (search) params.set('q', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);

      const res = await api.get<{ data: JobItem[]; meta: PaginationMeta }>(`/api/jobs?${params.toString()}`);
      setJobs(res.data || []);
      setMeta(res.meta || null);
    } catch {
      addToast({
        title: 'Error loading jobs',
        description: 'Failed to fetch jobs list from server',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, categoryFilter, addToast]);

  React.useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description || !formData.location || !formData.requiredSkills) {
      addToast({
        title: 'Validation Error',
        description: 'Please fill in all required fields (title, description, location, required skills)',
        variant: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateJobRequest = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        location: formData.location,
        remote: formData.remote,
        employmentType: formData.employmentType,
        salaryMin: formData.salaryMin ? Number(formData.salaryMin) : null,
        salaryMax: formData.salaryMax ? Number(formData.salaryMax) : null,
        minExperienceYears: Number(formData.minExperienceYears) || 0,
        requiredSkills: formData.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        preferredSkills: formData.preferredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        status: formData.status,
      };

      await api.post('/api/jobs', payload);
      addToast({
        title: 'Job created',
        description: `Successfully posted ${formData.title}`,
        variant: 'success',
      });
      setIsCreateOpen(false);
      setFormData({
        title: '',
        description: '',
        category: 'Engineering',
        location: '',
        remote: true,
        employmentType: 'FULL_TIME',
        salaryMin: '',
        salaryMax: '',
        minExperienceYears: 2,
        requiredSkills: '',
        preferredSkills: '',
        status: 'OPEN',
      });
      fetchJobs();
    } catch (err: unknown) {
      addToast({
        title: 'Failed to create job',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="success">Open</Badge>;
      case 'PAUSED':
        return <Badge variant="warning">Paused</Badge>;
      case 'CLOSED':
        return <Badge variant="default">Closed</Badge>;
      case 'DRAFT':
      default:
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-500" />
            Job Requisitions
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Manage open roles, required skill sets, and programmatic candidate pipelines
          </p>
        </div>

        {canManage && (
          <Button variant="primary" size="md" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            <span>Create Requisition</span>
          </Button>
        )}
      </div>

      <Card className="bg-[#0E131F] border-gray-800">
        <CardHeader className="pb-3 border-b border-gray-800/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search jobs by title or skills..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/80 pl-9 pr-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Filter className="h-3.5 w-3.5" />
                <span>Filters:</span>
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="Engineering">Engineering</option>
                <option value="Product">Product</option>
                <option value="Marketing">Marketing</option>
                <option value="Design">Design</option>
                <option value="Data">Data & AI</option>
                <option value="Sales">Sales</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="PAUSED">Paused</option>
                <option value="CLOSED">Closed</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No job requisitions found"
              description="Create a new job posting or adjust your search filters."
              action={
                canManage ? (
                  <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create First Requisition
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role & Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Required Skills</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="font-medium text-xs text-blue-400 hover:underline block leading-tight"
                        >
                          {job.title}
                        </Link>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          {job.category} · {job.employmentType.replace('_', ' ')}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-gray-300">
                        <MapPin className="h-3.5 w-3.5 text-gray-500" />
                        <span>{job.location}</span>
                        {job.remote && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 text-emerald-400 border-emerald-800/60">
                            Remote
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {job.requiredSkills.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="inline-block px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 font-mono"
                          >
                            {skill}
                          </span>
                        ))}
                        {job.requiredSkills.length > 3 && (
                          <span className="text-[10px] text-gray-500 self-center">
                            +{job.requiredSkills.length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-gray-300 font-mono">
                      {job.minExperienceYears}+ yrs
                    </TableCell>

                    <TableCell>{getStatusBadge(job.status)}</TableCell>

                    <TableCell className="text-right">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        View Details →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800 text-xs text-gray-400">
              <span>
                Showing Page {meta.page} of {meta.totalPages} ({meta.total} total requisitions)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Job Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create New Job Requisition</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div>
              <Input
                label="Job Title *"
                placeholder="e.g. Senior Machine Learning Engineer"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Data">Data & AI</option>
                  <option value="Product">Product</option>
                  <option value="Design">Design</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Sales">Sales</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Employment Type</label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value as EmploymentType })}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Location *"
                  placeholder="e.g. Bengaluru, India"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 font-medium">
                  <input
                    type="checkbox"
                    checked={formData.remote}
                    onChange={(e) => setFormData({ ...formData, remote: e.target.checked })}
                    className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Remote eligible position</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Input
                  label="Min Salary (₹ / yr)"
                  type="number"
                  placeholder="2000000"
                  value={formData.salaryMin}
                  onChange={(e) => setFormData({ ...formData, salaryMin: e.target.value })}
                />
              </div>
              <div>
                <Input
                  label="Max Salary (₹ / yr)"
                  type="number"
                  placeholder="3500000"
                  value={formData.salaryMax}
                  onChange={(e) => setFormData({ ...formData, salaryMax: e.target.value })}
                />
              </div>
              <div>
                <Input
                  label="Min Experience (yrs)"
                  type="number"
                  min="0"
                  value={formData.minExperienceYears}
                  onChange={(e) => setFormData({ ...formData, minExperienceYears: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Input
                label="Required Skills * (comma-separated, aliases auto-canonicalized)"
                placeholder="e.g. Python, react.js, k8s, FastAPI"
                value={formData.requiredSkills}
                onChange={(e) => setFormData({ ...formData, requiredSkills: e.target.value })}
                required
              />
            </div>

            <div>
              <Input
                label="Preferred Skills (comma-separated)"
                placeholder="e.g. Docker, PostgreSQL, AWS"
                value={formData.preferredSkills}
                onChange={(e) => setFormData({ ...formData, preferredSkills: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Job Description *</label>
              <textarea
                rows={4}
                required
                placeholder="Detailed description of responsibilities and expectations..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Publish Requisition
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
