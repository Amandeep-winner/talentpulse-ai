'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, Layers, Cpu } from 'lucide-react';
import Link from 'next/link';
import { HealthResponse } from '@talentpulse/shared';

export default function HomePage() {
  const { data: health, isLoading, isError, refetch } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    retry: 1,
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">System Overview</h1>
          <p className="text-xs text-gray-400 mt-1">
            TalentPulse AI platform health, agent availability, and quick actions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} isLoading={isLoading}>
            Refresh Status
          </Button>
          <Link href="/dashboard">
            <Button size="sm">
              Launch Dashboard
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Core API Health</CardTitle>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <CardDescription>Connectivity to Express backend service</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                Checking API health...
              </div>
            ) : isError ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                  API offline or initializing
                </div>
                <Badge variant="danger">DISCONNECTED</Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  API operational
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">STATUS: {health?.status?.toUpperCase() || 'OK'}</Badge>
                  <span className="text-[11px] text-gray-500">v{health?.version || '1.0.0'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Intelligence Services</CardTitle>
              <Sparkles className="h-4 w-4 text-purple-400" />
            </div>
            <CardDescription>Semantic matching and RAG engine</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="info">384-D LOCAL EMBEDDINGS</Badge>
              <p className="text-xs text-gray-400">
                Deterministic hybrid ranking and offline vector index active.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Optimizer & Bandits</CardTitle>
              <Cpu className="h-4 w-4 text-emerald-400" />
            </div>
            <CardDescription>Contextual bandit and allocation engine</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Badge variant="success">LINUCB / EPSILON-GREEDY</Badge>
              <p className="text-xs text-gray-400">
                Continuous programmatic ad allocation simulation ready.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-400" />
              <CardTitle>Recruitment Intelligence Features</CardTitle>
            </div>
            <CardDescription>Core capabilities included in TalentPulse AI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-gray-300">
              <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <span>Multi-tenant SaaS with strict organization-level isolation and RBAC.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-300">
              <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <span>Explainable hybrid matching combining vector semantics and structured filters.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-300">
              <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <span>Guarded natural language text-to-SQL with AST query validation.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-gray-300">
              <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <span>Idempotent webhook ingestion with signature verification and retry dead-letter.</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Navigation</CardTitle>
            <CardDescription>Jump straight to key workflows</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2.5">
            <Link href="/dashboard" className="p-3 rounded-lg border border-gray-800 bg-gray-800/40 hover:bg-gray-800 transition text-xs font-medium text-gray-200 flex items-center justify-between">
              <span>Recruiter Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
            </Link>
            <Link href="/jobs" className="p-3 rounded-lg border border-gray-800 bg-gray-800/40 hover:bg-gray-800 transition text-xs font-medium text-gray-200 flex items-center justify-between">
              <span>Jobs Management</span>
              <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
            </Link>
            <Link href="/candidates" className="p-3 rounded-lg border border-gray-800 bg-gray-800/40 hover:bg-gray-800 transition text-xs font-medium text-gray-200 flex items-center justify-between">
              <span>Candidate Matching</span>
              <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
            </Link>
            <Link href="/ai" className="p-3 rounded-lg border border-gray-800 bg-gray-800/40 hover:bg-gray-800 transition text-xs font-medium text-gray-200 flex items-center justify-between">
              <span>Ask TalentPulse AI</span>
              <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
