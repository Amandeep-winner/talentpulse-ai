'use client';

import * as React from 'react';
import Link from 'next/link';
import { CandidateItem, PaginationMeta, CreateCandidateRequest } from '@talentpulse/shared';
import { Users, Plus, Search, MapPin, CheckCircle2 } from 'lucide-react';
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

export default function CandidatesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [candidates, setCandidates] = React.useState<CandidateItem[]>([]);
  const [meta, setMeta] = React.useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [search, setSearch] = React.useState('');
  const [locationFilter, setLocationFilter] = React.useState('');
  const [remoteOnly, setRemoteOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);

  // Add Candidate Dialog
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    location: '',
    remoteOk: true,
    experienceYears: 3,
    skills: '',
    education: '',
    expectedSalary: '',
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';

  const fetchCandidates = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '15');
      if (search) params.set('q', search);
      if (locationFilter) params.set('location', locationFilter);
      if (remoteOnly) params.set('remoteOk', 'true');

      const res = await api.get<{ data: CandidateItem[]; meta: PaginationMeta }>(
        `/api/candidates?${params.toString()}`,
      );
      setCandidates(res.data || []);
      setMeta(res.meta || null);
    } catch {
      addToast({
        title: 'Error loading candidates',
        description: 'Failed to fetch candidates from server',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, locationFilter, remoteOnly, addToast]);

  React.useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.location) {
      addToast({
        title: 'Validation Error',
        description: 'Please provide full name, work email, and location',
        variant: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateCandidateRequest = {
        name: formData.name,
        email: formData.email,
        location: formData.location,
        remoteOk: formData.remoteOk,
        experienceYears: Number(formData.experienceYears) || 0,
        skills: formData.skills.split(',').map((s) => s.trim()).filter(Boolean),
        certifications: [],
        preferredLocations: [],
        preferredEmploymentTypes: [],
        education: formData.education || null,
        expectedSalary: formData.expectedSalary ? Number(formData.expectedSalary) : null,
      };

      await api.post('/api/candidates', payload);
      addToast({
        title: 'Candidate added',
        description: `Successfully created profile for ${formData.name}`,
        variant: 'success',
      });
      setIsAddOpen(false);
      setFormData({
        name: '',
        email: '',
        location: '',
        remoteOk: true,
        experienceYears: 3,
        skills: '',
        education: '',
        expectedSalary: '',
      });
      fetchCandidates();
    } catch (err: unknown) {
      addToast({
        title: 'Failed to add candidate',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Candidate Directory
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Talent profiles, parsed resumes, skills taxonomy, and vector search embeddings
          </p>
        </div>

        {canManage && (
          <Button variant="primary" size="md" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            <span>Add Candidate</span>
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
                  placeholder="Search candidates by name, email, or skill..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/80 pl-9 pr-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Filter by city..."
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-36 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              >
              </input>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={(e) => setRemoteOnly(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
                <span>Remote OK</span>
              </label>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No candidates found"
              description="Add your first candidate or adjust search filters."
              action={
                canManage ? (
                  <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Candidate Profile
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Resume</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((cand) => (
                  <TableRow key={cand.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/candidates/${cand.id}`}
                          className="font-medium text-xs text-blue-400 hover:underline block leading-tight"
                        >
                          {cand.name}
                        </Link>
                        <span className="text-[11px] text-gray-400 block mt-0.5">{cand.email}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-gray-300">
                        <MapPin className="h-3.5 w-3.5 text-gray-500" />
                        <span>{cand.location}</span>
                        {cand.remoteOk && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 text-emerald-400 border-emerald-800/60">
                            Remote
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-gray-300 font-mono">
                      {cand.experienceYears} yrs
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {cand.skills.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="inline-block px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 font-mono"
                          >
                            {skill}
                          </span>
                        ))}
                        {cand.skills.length > 3 && (
                          <span className="text-[10px] text-gray-500 self-center">
                            +{cand.skills.length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {cand.resumeText ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Uploaded</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-500">Pending</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <Link
                        href={`/candidates/${cand.id}`}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        View Profile →
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
                Page {meta.page} of {meta.totalPages} ({meta.total} candidates)
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

      {/* Add Candidate Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Candidate Profile</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Candidate Name *"
                  placeholder="e.g. John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Input
                  label="Email Address *"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Location *"
                  placeholder="e.g. Hyderabad, India"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 font-medium">
                  <input
                    type="checkbox"
                    checked={formData.remoteOk}
                    onChange={(e) => setFormData({ ...formData, remoteOk: e.target.checked })}
                    className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Open to remote opportunities</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Experience (years)"
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.experienceYears}
                  onChange={(e) => setFormData({ ...formData, experienceYears: Number(e.target.value) })}
                />
              </div>
              <div>
                <Input
                  label="Expected Salary (₹ / yr)"
                  type="number"
                  placeholder="e.g. 2400000"
                  value={formData.expectedSalary}
                  onChange={(e) => setFormData({ ...formData, expectedSalary: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Input
                label="Skills (comma-separated, auto-canonicalized)"
                placeholder="e.g. Python, React, PostgreSQL, Docker, AWS"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
              />
            </div>

            <div>
              <Input
                label="Education / Degree"
                placeholder="e.g. B.Tech Computer Science, IIT Bombay"
                value={formData.education}
                onChange={(e) => setFormData({ ...formData, education: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Save Candidate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
