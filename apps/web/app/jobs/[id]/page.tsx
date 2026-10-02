'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  JobItem,
  JobStatus,
  EmploymentType,
  UpdateJobRequest,
  CandidateMatchResult,
  JobMatchesResponse,
} from '@talentpulse/shared';
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
  Download,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ExternalLink,
  User,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { addToast } = useToast();

  const id = params.id as string;
  const [job, setJob] = React.useState<JobItem | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'matches'>('overview');

  // Matches State
  const [matches, setMatches] = React.useState<CandidateMatchResult[]>([]);
  const [isMatchesLoading, setIsMatchesLoading] = React.useState(false);
  const [hasLoadedMatches, setHasLoadedMatches] = React.useState(false);
  const [expandedBreakdowns, setExpandedBreakdowns] = React.useState<Record<string, boolean>>({});

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

  const fetchMatches = React.useCallback(async () => {
    setIsMatchesLoading(true);
    try {
      const res = await api.get<{ data: JobMatchesResponse }>(`/api/jobs/${id}/matches?limit=20`);
      setMatches(res.data.matches || []);
      setHasLoadedMatches(true);
    } catch (err: unknown) {
      addToast({
        title: 'Error ranking candidates',
        description: err instanceof Error ? err.message : 'Failed to fetch candidate matches',
        variant: 'danger',
      });
    } finally {
      setIsMatchesLoading(false);
    }
  }, [id, addToast]);

  React.useEffect(() => {
    if (id) {
      fetchJob();
    }
  }, [id, fetchJob]);

  // Load matches when navigating to matches tab for first time
  React.useEffect(() => {
    if (activeTab === 'matches' && !hasLoadedMatches && !isMatchesLoading) {
      fetchMatches();
    }
  }, [activeTab, hasLoadedMatches, isMatchesLoading, fetchMatches]);

  const toggleBreakdown = (candidateId: string) => {
    setExpandedBreakdowns((prev) => ({
      ...prev,
      [candidateId]: !prev[candidateId],
    }));
  };

  const handleExportCsv = () => {
    if (!matches.length || !job) return;
    const headers = [
      'Rank',
      'Candidate ID',
      'Name',
      'Email',
      'Location',
      'Experience (Yrs)',
      'Overall Fit (%)',
      'Confidence (%)',
      'Semantic Fit (%)',
      'Skills Alignment (%)',
      'Experience (%)',
      'Location (%)',
      'Education (%)',
      'Preferences (%)',
      'Top Reasons',
      'Gaps',
    ];

    const rows = matches.map((m, idx) => [
      idx + 1,
      m.candidateId,
      `"${m.name.replace(/"/g, '""')}"`,
      `"${m.email.replace(/"/g, '""')}"`,
      `"${m.location.replace(/"/g, '""')}"`,
      m.experienceYears,
      Math.round(m.score * 100),
      Math.round(m.confidence * 100),
      Math.round(m.breakdown.semantic * 100),
      Math.round(m.breakdown.skills * 100),
      Math.round(m.breakdown.experience * 100),
      Math.round(m.breakdown.location * 100),
      Math.round(m.breakdown.education * 100),
      Math.round(m.breakdown.preferences * 100),
      `"${m.reasons.join('; ').replace(/"/g, '""')}"`,
      `"${m.gaps.join('; ').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `job-${job.id.slice(0, 8)}-matches.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      title: 'Matches exported',
      description: 'Candidate ranking data downloaded as CSV',
      variant: 'success',
    });
  };

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

  const getScoreBadge = (score: number) => {
    const pct = Math.round(score * 100);
    if (pct >= 80) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {pct}% Fit
        </span>
      );
    }
    if (pct >= 65) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          {pct}% Fit
        </span>
      );
    }
    if (pct >= 50) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {pct}% Fit
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">
        {pct}% Fit
      </span>
    );
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

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'overview' | 'matches')}>
        <TabsList className="bg-[#0E131F] border border-gray-800 p-1">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="matches" className="flex items-center gap-1.5" data-testid="tab-matches">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            AI Matches
            {matches.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-900/60 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                {matches.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab Content */}
        <TabsContent value="overview">
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
        </TabsContent>

        {/* AI Matches Tab Content */}
        <TabsContent value="matches">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#0E131F] border border-gray-800 rounded-lg p-4">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Explainable Hybrid Candidate Ranking
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Multi-factor reranking combining semantic similarity (35%), skills (25%), experience (15%), location (10%), education (10%), and preferences (5%).
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchMatches}
                  isLoading={isMatchesLoading}
                  className="text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Re-rank
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={matches.length === 0}
                  className="text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            {isMatchesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-lg" />
                ))}
              </div>
            ) : matches.length === 0 ? (
              <Card className="bg-[#0E131F] border-gray-800 py-12 text-center">
                <CardContent>
                  <User className="mx-auto h-10 w-10 text-gray-600 mb-3" />
                  <h3 className="text-sm font-semibold text-white">No candidate matches found</h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                    No candidates met the threshold or candidate pool embeddings are being generated.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchMatches}
                    className="mt-4"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Run Hybrid Matcher
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {matches.map((match, idx) => {
                  const isExpanded = !!expandedBreakdowns[match.candidateId];
                  const fitPercent = Math.round(match.score * 100);
                  const confidencePercent = Math.round(match.confidence * 100);

                  return (
                    <Card
                      key={match.candidateId}
                      className="bg-[#0E131F] border-gray-800 hover:border-gray-700 transition-colors"
                      data-testid={`match-card-${idx}`}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          {/* Left: Info & Badges */}
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2.5">
                              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-800 text-[11px] font-mono font-bold text-gray-300">
                                #{idx + 1}
                              </span>
                              <Link
                                href={`/candidates/${match.candidateId}`}
                                className="text-base font-semibold text-white hover:text-blue-400 transition-colors flex items-center gap-1.5"
                              >
                                {match.name}
                                <ExternalLink className="h-3 w-3 text-gray-500 hover:text-blue-400" />
                              </Link>
                              {getScoreBadge(match.score)}
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950/40 text-blue-300 border border-blue-800/40">
                                <ShieldCheck className="h-3 w-3 text-blue-400" />
                                {confidencePercent}% confidence
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                              <span className="text-gray-300">{match.email}</span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-gray-500" />
                                {match.location} {match.remoteOk && '(Remote OK)'}
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-gray-500" />
                                {match.experienceYears} yrs exp
                              </span>
                            </div>

                            {/* Candidate Skills Pills */}
                            <div className="flex flex-wrap gap-1 pt-1">
                              {match.skills.slice(0, 6).map((skill) => (
                                <span
                                  key={skill}
                                  className="inline-block px-1.5 py-0.5 rounded bg-gray-800/80 text-[10px] text-gray-300 font-mono"
                                >
                                  {skill}
                                </span>
                              ))}
                              {match.skills.length > 6 && (
                                <span className="text-[10px] text-gray-500 self-center">
                                  +{match.skills.length - 6} more
                                </span>
                              )}
                            </div>

                            {/* Reasons & Gaps */}
                            <div className="pt-2 space-y-1.5">
                              {match.reasons.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Strengths:
                                  </span>
                                  {match.reasons.map((reason, rIdx) => (
                                    <span
                                      key={rIdx}
                                      className="inline-flex items-center text-[11px] bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 px-2 py-0.5 rounded"
                                    >
                                      {reason}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {match.gaps.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Gaps:
                                  </span>
                                  {match.gaps.map((gap, gIdx) => (
                                    <span
                                      key={gIdx}
                                      className="inline-flex items-center text-[11px] bg-amber-950/30 border border-amber-800/40 text-amber-300 px-2 py-0.5 rounded"
                                    >
                                      {gap}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Score Visual & Toggle */}
                          <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 md:min-w-[140px] pt-2 md:pt-0 border-t md:border-t-0 border-gray-800">
                            <div className="text-right">
                              <div className="text-2xl font-bold font-mono text-white">
                                {fitPercent}%
                              </div>
                              <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                                Match Score
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleBreakdown(match.candidateId)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                              data-testid={`toggle-why-${match.candidateId}`}
                            >
                              Why?
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5 ml-1" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 ml-1" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Expandable Breakdown Drawer */}
                        {isExpanded && (
                          <div
                            className="mt-4 pt-4 border-t border-gray-800/80 bg-gray-900/50 rounded-lg p-3 space-y-3"
                            data-testid={`breakdown-details-${match.candidateId}`}
                          >
                            <div className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                              Score Breakdown by Dimension
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-gray-300">Semantic Fit</span>
                                  <span className="font-mono text-blue-400">
                                    {Math.round(match.breakdown.semantic * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round(match.breakdown.semantic * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-500">Weight: 35%</span>
                              </div>

                              <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-gray-300">Skills Alignment</span>
                                  <span className="font-mono text-blue-400">
                                    {Math.round(match.breakdown.skills * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round(match.breakdown.skills * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-500">Weight: 25%</span>
                              </div>

                              <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-gray-300">Experience Match</span>
                                  <span className="font-mono text-blue-400">
                                    {Math.round(match.breakdown.experience * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round(match.breakdown.experience * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-500">Weight: 15%</span>
                              </div>

                              <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-gray-300">Location Fit</span>
                                  <span className="font-mono text-blue-400">
                                    {Math.round(match.breakdown.location * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round(match.breakdown.location * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-500">Weight: 10%</span>
                              </div>

                              <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-gray-300">Education Level</span>
                                  <span className="font-mono text-blue-400">
                                    {Math.round(match.breakdown.education * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round(match.breakdown.education * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-500">Weight: 10%</span>
                              </div>

                              <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-gray-300">Role Preferences</span>
                                  <span className="font-mono text-blue-400">
                                    {Math.round(match.breakdown.preferences * 100)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.round(match.breakdown.preferences * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-500">Weight: 5%</span>
                              </div>
                            </div>

                            <div className="flex justify-end pt-1">
                              <Link href={`/candidates/${match.candidateId}`}>
                                <Button size="sm" variant="outline" className="text-xs">
                                  View Candidate Profile
                                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
