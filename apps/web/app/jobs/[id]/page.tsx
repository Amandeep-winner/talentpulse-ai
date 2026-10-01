'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { JobItem, JobStatus, EmploymentType, UpdateJobRequest } from '@talentpulse/shared';
import {
  Briefcase,
  ArrowLeft,
  MapPin,
  Clock,
  IndianRupee,
  CheckCircle2,
  Edit3,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { addToast } = useToast();

  const id = params.id as string;
  const [job, setJob] = React.useState<JobItem | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [editFormData, setEditFormData] = React.useState({
    title: '',
    description: '',
    category: '',
    location: '',
    remote: false,
    employmentType: 'FULL_TIME' as EmploymentType,
    salaryMin: '',
    salaryMax: '',
    minExperienceYears: 0,
    requiredSkills: '',
    preferredSkills: '',
    status: 'OPEN' as JobStatus,
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';

  const fetchJob = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: JobItem }>(`/api/jobs/${id}`);
      setJob(res.data);
      setEditFormData({
        title: res.data.title,
        description: res.data.description,
        category: res.data.category,
        location: res.data.location,
        remote: res.data.remote,
        employmentType: res.data.employmentType,
        salaryMin: res.data.salaryMin ? String(res.data.salaryMin) : '',
        salaryMax: res.data.salaryMax ? String(res.data.salaryMax) : '',
        minExperienceYears: res.data.minExperienceYears,
        requiredSkills: res.data.requiredSkills.join(', '),
        preferredSkills: res.data.preferredSkills.join(', '),
        status: res.data.status,
      });
    } catch {
      addToast({
        title: 'Error loading job',
        description: 'Failed to fetch job details from server',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, addToast]);

  React.useEffect(() => {
    if (id) {
      fetchJob();
    }
  }, [id, fetchJob]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: UpdateJobRequest = {
        title: editFormData.title,
        description: editFormData.description,
        category: editFormData.category,
        location: editFormData.location,
        remote: editFormData.remote,
        employmentType: editFormData.employmentType,
        salaryMin: editFormData.salaryMin ? Number(editFormData.salaryMin) : null,
        salaryMax: editFormData.salaryMax ? Number(editFormData.salaryMax) : null,
        minExperienceYears: Number(editFormData.minExperienceYears) || 0,
        requiredSkills: editFormData.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        preferredSkills: editFormData.preferredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        status: editFormData.status,
      };

      const res = await api.patch<{ data: JobItem }>(`/api/jobs/${id}`, payload);
      setJob(res.data);
      addToast({
        title: 'Job updated',
        description: 'Job requisition has been updated successfully',
        variant: 'success',
      });
      setIsEditOpen(false);
    } catch (err: unknown) {
      addToast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Failed to update job',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this job requisition? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/api/jobs/${id}`);
      addToast({
        title: 'Job deleted',
        description: 'The job requisition has been removed',
        variant: 'success',
      });
      router.push('/jobs');
    } catch (err: unknown) {
      addToast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Failed to delete job',
        variant: 'danger',
      });
    }
  };

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return 'Competitive';
    if (min && max) return `₹${(min / 100000).toFixed(1)}L - ₹${(max / 100000).toFixed(1)}L / yr`;
    if (min) return `From ₹${(min / 100000).toFixed(1)}L / yr`;
    return `Up to ₹${(max! / 100000).toFixed(1)}L / yr`;
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-12 text-center">
        <Briefcase className="mx-auto h-10 w-10 text-gray-500" />
        <h2 className="mt-3 text-base font-semibold text-white">Job requisition not found</h2>
        <p className="mt-1 text-xs text-gray-400">The requisition may have been deleted or moved.</p>
        <Link href="/jobs" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Jobs
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Requisitions</span>
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">{job.title}</h1>
              {getStatusBadge(job.status)}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-2">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5 text-blue-400" />
                {job.category} · {job.employmentType.replace('_', ' ')}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                {job.location} {job.remote && '(Remote Eligible)'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {job.minExperienceYears}+ years experience
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <IndianRupee className="h-3.5 w-3.5" />
                {formatSalary(job.salaryMin, job.salaryMax)}
              </span>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="bg-[#0E131F] border-gray-800">
            <CardHeader className="border-b border-gray-800/80 pb-3">
              <CardTitle className="text-sm font-semibold text-white">Role Overview & Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                {job.description}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[#0E131F] border-gray-800">
            <CardHeader className="border-b border-gray-800/80 pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-400" />
                Required Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-1.5">
                {job.requiredSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-block px-2 py-1 rounded bg-blue-900/30 border border-blue-800/60 text-xs text-blue-300 font-mono"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {job.preferredSkills.length > 0 && (
            <Card className="bg-[#0E131F] border-gray-800">
              <CardHeader className="border-b border-gray-800/80 pb-3">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  Preferred Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-1.5">
                  {job.preferredSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-block px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 font-mono"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-[#0E131F] border-gray-800">
            <CardHeader className="border-b border-gray-800/80 pb-3">
              <CardTitle className="text-sm font-semibold text-white">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-2 text-xs text-gray-400">
              <div className="flex justify-between">
                <span>Created Date:</span>
                <span className="text-gray-200">{new Date(job.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Requisition ID:</span>
                <span className="font-mono text-[10px] text-gray-400">{job.id.slice(0, 8)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Job Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Job Requisition</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
            <div>
              <Input
                label="Job Title *"
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Category</label>
                <select
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
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
                <label className="block text-xs font-medium text-gray-300 mb-1">Status</label>
                <select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as JobStatus })}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="OPEN">Open</option>
                  <option value="PAUSED">Paused</option>
                  <option value="CLOSED">Closed</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Location"
                  value={editFormData.location}
                  onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                  required
                />
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 font-medium">
                  <input
                    type="checkbox"
                    checked={editFormData.remote}
                    onChange={(e) => setEditFormData({ ...editFormData, remote: e.target.checked })}
                    className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Remote eligible position</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Input
                  label="Min Salary (₹)"
                  type="number"
                  value={editFormData.salaryMin}
                  onChange={(e) => setEditFormData({ ...editFormData, salaryMin: e.target.value })}
                />
              </div>
              <div>
                <Input
                  label="Max Salary (₹)"
                  type="number"
                  value={editFormData.salaryMax}
                  onChange={(e) => setEditFormData({ ...editFormData, salaryMax: e.target.value })}
                />
              </div>
              <div>
                <Input
                  label="Min Experience (yrs)"
                  type="number"
                  min="0"
                  value={editFormData.minExperienceYears}
                  onChange={(e) => setEditFormData({ ...editFormData, minExperienceYears: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Input
                label="Required Skills (comma-separated)"
                value={editFormData.requiredSkills}
                onChange={(e) => setEditFormData({ ...editFormData, requiredSkills: e.target.value })}
                required
              />
            </div>

            <div>
              <Input
                label="Preferred Skills (comma-separated)"
                value={editFormData.preferredSkills}
                onChange={(e) => setEditFormData({ ...editFormData, preferredSkills: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
              <textarea
                rows={4}
                required
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
