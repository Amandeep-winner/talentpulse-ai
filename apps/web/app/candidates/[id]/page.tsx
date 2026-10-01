'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CandidateItem } from '@talentpulse/shared';
import {
  Users,
  ArrowLeft,
  MapPin,
  Clock,
  IndianRupee,
  FileText,
  Upload,
  CheckCircle2,
  Trash2,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { addToast } = useToast();

  const id = params.id as string;
  const [candidate, setCandidate] = React.useState<CandidateItem | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Resume Upload State
  const [resumeMode, setResumeMode] = React.useState<'upload' | 'paste'>('upload');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [pastedText, setPastedText] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);

  const canManage = user?.role === 'ADMIN' || user?.role === 'RECRUITER';

  const fetchCandidate = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: CandidateItem }>(`/api/candidates/${id}`);
      setCandidate(res.data);
    } catch {
      addToast({
        title: 'Error loading candidate',
        description: 'Failed to fetch candidate profile from server',
        variant: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, addToast]);

  React.useEffect(() => {
    if (id) {
      fetchCandidate();
    }
  }, [id, fetchCandidate]);

  const handleResumeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      if (resumeMode === 'upload') {
        if (!selectedFile) {
          addToast({
            title: 'File missing',
            description: 'Please select a PDF or plain text resume file to upload',
            variant: 'warning',
          });
          setIsUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append('resume', selectedFile);

        const res = await api.post<{ data: { resumeText: string; message: string } }>(
          `/api/candidates/${id}/resume`,
          formData,
        );

        addToast({
          title: 'Resume uploaded',
          description: res.data.message || 'Resume text extracted successfully',
          variant: 'success',
        });
        setSelectedFile(null);
      } else {
        if (!pastedText || pastedText.trim().length < 10) {
          addToast({
            title: 'Invalid text',
            description: 'Pasted resume text must be at least 10 characters long',
            variant: 'warning',
          });
          setIsUploading(false);
          return;
        }

        const res = await api.post<{ data: { resumeText: string; message: string } }>(
          `/api/candidates/${id}/resume`,
          { resumeText: pastedText },
        );

        addToast({
          title: 'Resume updated',
          description: res.data.message || 'Pasted resume saved successfully',
          variant: 'success',
        });
        setPastedText('');
      }

      fetchCandidate();
    } catch (err: unknown) {
      addToast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to process resume',
        variant: 'danger',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this candidate profile?')) {
      return;
    }

    try {
      await api.delete(`/api/candidates/${id}`);
      addToast({
        title: 'Candidate deleted',
        description: 'Candidate profile was removed successfully',
        variant: 'success',
      });
      router.push('/candidates');
    } catch (err: unknown) {
      addToast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Failed to delete candidate',
        variant: 'danger',
      });
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

  if (!candidate) {
    return (
      <div className="py-12 text-center">
        <Users className="mx-auto h-10 w-10 text-gray-500" />
        <h2 className="mt-3 text-base font-semibold text-white">Candidate not found</h2>
        <p className="mt-1 text-xs text-gray-400">The candidate may have been deleted.</p>
        <Link href="/candidates" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Candidates
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Candidates</span>
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-base font-bold shrink-0">
              {candidate.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">{candidate.name}</h1>
                {candidate.resumeText && (
                  <Badge variant="success" className="text-[10px] py-0.5">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Resume Verified
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-1">
                <span>{candidate.email}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-gray-500" />
                  {candidate.location} {candidate.remoteOk && '(Remote OK)'}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-gray-500" />
                  {candidate.experienceYears} years exp
                </span>
                {candidate.expectedSalary && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <IndianRupee className="h-3 w-3" />
                      ₹{(candidate.expectedSalary / 100000).toFixed(1)}L / yr
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {canManage && (
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete Profile
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Profile Overview</TabsTrigger>
          <TabsTrigger value="resume">Resume & Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card className="bg-[#0E131F] border-gray-800">
                <CardHeader className="border-b border-gray-800/80 pb-3">
                  <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    Technical Skills & Competencies
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {candidate.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {candidate.skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2.5 py-1 rounded bg-blue-900/30 border border-blue-800/60 text-xs text-blue-300 font-mono"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No skills added yet.</p>
                  )}
                </CardContent>
              </Card>

              {candidate.resumeText && (
                <Card className="bg-[#0E131F] border-gray-800">
                  <CardHeader className="border-b border-gray-800/80 pb-3">
                    <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-400" />
                      Parsed Resume Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="max-h-72 overflow-y-auto rounded bg-gray-950/60 p-3 border border-gray-800/80 text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {candidate.resumeText}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="bg-[#0E131F] border-gray-800">
                <CardHeader className="border-b border-gray-800/80 pb-3">
                  <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-blue-400" />
                    Education & Credentials
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Highest Education</span>
                    <span className="text-gray-200 font-medium">
                      {candidate.education || 'Not specified'}
                    </span>
                  </div>

                  {candidate.certifications && candidate.certifications.length > 0 && (
                    <div>
                      <span className="text-gray-400 block text-[11px] mb-1">Certifications</span>
                      <div className="flex flex-wrap gap-1">
                        {candidate.certifications.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#0E131F] border-gray-800">
                <CardHeader className="border-b border-gray-800/80 pb-3">
                  <CardTitle className="text-sm font-semibold text-white">System Metadata</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-2 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Profile ID:</span>
                    <span className="font-mono text-[10px] text-gray-300">{candidate.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vector Status:</span>
                    <span className="text-gray-200">
                      {candidate.embeddedAt ? 'Indexed' : 'Pending embedding'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Added:</span>
                    <span className="text-gray-200">{new Date(candidate.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="resume" className="mt-4">
          <Card className="bg-[#0E131F] border-gray-800">
            <CardHeader className="border-b border-gray-800 pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-400" />
                Upload or Paste Candidate Resume
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={resumeMode === 'upload' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setResumeMode('upload')}
                >
                  Upload File (.pdf, .txt)
                </Button>
                <Button
                  type="button"
                  variant={resumeMode === 'paste' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setResumeMode('paste')}
                >
                  Paste Plain Text
                </Button>
              </div>

              <form onSubmit={handleResumeSubmit} className="space-y-4">
                {resumeMode === 'upload' ? (
                  <div className="border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-lg p-6 text-center bg-gray-900/40 transition-colors">
                    <input
                      type="file"
                      id="resume-file-input"
                      accept=".pdf,.txt,application/pdf,text/plain"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="resume-file-input" className="cursor-pointer block">
                      <FileText className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <span className="text-xs font-medium text-blue-400 hover:underline block">
                        {selectedFile ? selectedFile.name : 'Click to browse resume file'}
                      </span>
                      <span className="text-[11px] text-gray-500 block mt-1">
                        Supported formats: PDF or plain text TXT (max 5MB)
                      </span>
                    </label>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Paste Resume Raw Text
                    </label>
                    <textarea
                      rows={8}
                      placeholder="Paste resume content here..."
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                )}

                {canManage && (
                  <Button type="submit" variant="primary" isLoading={isUploading}>
                    <Upload className="h-4 w-4 mr-1.5" />
                    Process & Save Resume
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
