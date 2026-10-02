'use client';

import * as React from 'react';
import {
  BookOpen,
  Search,
  Sparkles,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Layers,
  RefreshCw,
  Send,
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
import {
  KnowledgeDocumentItem,
  AskKnowledgeResponse,
  KnowledgeCitation,
  CreateKnowledgeDocumentRequest,
} from '@talentpulse/shared';

const SUGGESTED_QUESTIONS = [
  'What is our interview and assessment policy?',
  'How does the 90-day onboarding program work?',
  'What are our engineering hiring templates and requirements?',
  'What are the guidelines for fair hiring and diversity?',
];

export default function KnowledgePage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = React.useState<'chat' | 'library'>('chat');
  const [documents, setDocuments] = React.useState<KnowledgeDocumentItem[]>([]);
  const [isDocsLoading, setIsDocsLoading] = React.useState(true);

  // Q&A State
  const [question, setQuestion] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const [isAsking, setIsAsking] = React.useState(false);
  const [qaResult, setQaResult] = React.useState<AskKnowledgeResponse | null>(null);
  const [selectedCitation, setSelectedCitation] = React.useState<KnowledgeCitation | null>(null);

  // Document Ingestion State
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadFormData, setUploadFormData] = React.useState<CreateKnowledgeDocumentRequest>({
    title: '',
    category: 'policy',
    content: '',
  });

  const canManageDocs = user?.role === 'ADMIN' || user?.role === 'RECRUITER';
  const canDeleteDocs = user?.role === 'ADMIN';

  const fetchDocuments = React.useCallback(async () => {
    setIsDocsLoading(true);
    try {
      const res = await api.get<{ data: KnowledgeDocumentItem[] }>('/api/knowledge');
      setDocuments(res.data);
    } catch {
      addToast({
        title: 'Error loading documents',
        description: 'Failed to retrieve knowledge documents',
        variant: 'danger',
      });
    } finally {
      setIsDocsLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q) return;

    if (queryText) {
      setQuestion(queryText);
    }

    setIsAsking(true);
    setQaResult(null);
    setSelectedCitation(null);

    try {
      const res = await api.post<{ data: AskKnowledgeResponse }>('/api/knowledge/ask', {
        question: q,
        category: selectedCategory || undefined,
      });
      setQaResult(res.data);
    } catch (err: unknown) {
      addToast({
        title: 'Query failed',
        description: err instanceof Error ? err.message : 'Failed to query knowledge base',
        variant: 'danger',
      });
    } finally {
      setIsAsking(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      await api.post('/api/knowledge', uploadFormData);
      addToast({
        title: 'Document ingested',
        description: 'Document has been chunked, embedded, and indexed.',
        variant: 'success',
      });
      setIsUploadOpen(false);
      setUploadFormData({ title: '', category: 'policy', content: '' });
      fetchDocuments();
    } catch (err: unknown) {
      addToast({
        title: 'Ingestion failed',
        description: err instanceof Error ? err.message : 'Failed to ingest document',
        variant: 'danger',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? All chunks will be removed.`)) {
      return;
    }

    try {
      await api.delete(`/api/knowledge/${id}`);
      addToast({
        title: 'Document deleted',
        description: `"${title}" was removed from the knowledge base`,
        variant: 'success',
      });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: unknown) {
      addToast({
        title: 'Deletion failed',
        description: err instanceof Error ? err.message : 'Failed to delete document',
        variant: 'danger',
      });
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category.toLowerCase()) {
      case 'policy':
        return <Badge variant="default">Policy</Badge>;
      case 'template':
        return <Badge variant="warning">Template</Badge>;
      case 'playbook':
        return <Badge variant="success">Playbook</Badge>;
      case 'guide':
        return <Badge variant="outline">Guide</Badge>;
      default:
        return <Badge variant="outline">{category}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <BookOpen className="h-6 w-6 text-blue-400" />
            Knowledge Base & RAG Assistant
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Query verified hiring policies, recruitment playbooks, and guidelines with cited retrieval-augmented answers.
          </p>
        </div>

        {canManageDocs && (
          <Button
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            data-testid="btn-add-doc"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Document
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'library')}>
        <TabsList className="bg-[#0E131F] border border-gray-800 p-1">
          <TabsTrigger value="chat" className="flex items-center gap-1.5" data-testid="tab-chat">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            Ask Assistant
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-1.5" data-testid="tab-library">
            <FileText className="h-3.5 w-3.5" />
            Document Library
            {documents.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-900/60 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                {documents.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Ask Assistant Tab */}
        <TabsContent value="chat" className="space-y-6">
          <Card className="bg-[#0E131F] border-gray-800">
            <CardHeader className="border-b border-gray-800/80 pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center justify-between">
                <span>Knowledge Retrieval Query</span>
                <span className="text-[11px] font-normal text-gray-400">
                  Threshold: 15% minimum similarity
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAsk();
                }}
                className="space-y-3"
              >
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Ask anything about hiring policies, interview rubrics, onboarding..."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="pl-9 text-xs"
                      data-testid="rag-question-input"
                    />
                  </div>

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
                    data-testid="rag-category-select"
                  >
                    <option value="">All Categories</option>
                    <option value="policy">Policies</option>
                    <option value="playbook">Playbooks</option>
                    <option value="template">Templates</option>
                    <option value="guide">Guides</option>
                  </select>

                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isAsking}
                    disabled={!question.trim()}
                    data-testid="rag-ask-button"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Ask
                  </Button>
                </div>

                {/* Suggested Prompts */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] text-gray-400">Try asking:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleAsk(q)}
                        className="text-[11px] text-gray-300 bg-gray-800/80 hover:bg-gray-700 border border-gray-700 px-2.5 py-1 rounded transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Loading Skeleton */}
          {isAsking && (
            <Card className="bg-[#0E131F] border-gray-800 animate-pulse">
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-16 w-full" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-6 w-28" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Answer Card */}
          {qaResult && (
            <Card className="bg-[#0E131F] border-gray-800" data-testid="rag-answer-card">
              <CardHeader className="border-b border-gray-800/80 pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Answer
                </CardTitle>
                <Badge variant={qaResult.citations.length > 0 ? 'success' : 'outline'}>
                  {qaResult.citations.length > 0 ? `${qaResult.citations.length} Verified Sources` : 'No Citations'}
                </Badge>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {qaResult.answer}
                </p>

                {qaResult.citations.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-gray-800/80">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Citations & Supporting Context
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {qaResult.citations.map((c) => (
                        <button
                          key={c.n}
                          type="button"
                          onClick={() => setSelectedCitation(c)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-950/40 border border-blue-800/40 text-xs text-blue-300 hover:bg-blue-900/50 hover:border-blue-700 transition-colors"
                          data-testid={`citation-chip-${c.n}`}
                        >
                          <span className="font-bold text-[10px] bg-blue-800/80 rounded px-1">
                            [{c.n}]
                          </span>
                          <span className="font-medium truncate max-w-xs">{c.title}</span>
                          <span className="text-[10px] text-blue-400 font-mono">
                            {Math.round(c.similarity * 100)}%
                          </span>
                          <ChevronRight className="h-3 w-3 text-blue-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/20 border border-amber-800/30 p-2.5 rounded">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Zero passages met the similarity threshold. The LLM was not invoked to prevent hallucination.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Citation Snippet Modal */}
          <Dialog open={!!selectedCitation} onOpenChange={(open) => !open && setSelectedCitation(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Citation [{selectedCitation?.n}]: {selectedCitation?.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div className="flex justify-between items-center bg-gray-900/80 px-3 py-1.5 rounded border border-gray-800 text-[11px] text-gray-400">
                  <span>Cosine Similarity:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {selectedCitation ? Math.round(selectedCitation.similarity * 100) : 0}%
                  </span>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-gray-400 mb-1">Passage Snippet:</div>
                  <div className="bg-gray-950 p-3 rounded border border-gray-800 text-gray-300 font-mono text-[11px] leading-relaxed">
                    {selectedCitation?.snippet}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedCitation(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Document Library Tab */}
        <TabsContent value="library" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {documents.length} verified documents in organization library
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDocuments}
              isLoading={isDocsLoading}
              className="text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          {isDocsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <Card className="bg-[#0E131F] border-gray-800 py-12 text-center">
              <CardContent>
                <FileText className="mx-auto h-10 w-10 text-gray-600 mb-3" />
                <h3 className="text-sm font-semibold text-white">No knowledge documents found</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  Upload hiring guidelines, policy documents, or interview templates to enable cited RAG intelligence.
                </p>
                {canManageDocs && (
                  <Button
                    size="sm"
                    onClick={() => setIsUploadOpen(true)}
                    className="mt-4"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Upload First Document
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map((doc) => (
                <Card
                  key={doc.id}
                  className="bg-[#0E131F] border-gray-800 hover:border-gray-700 transition-colors"
                  data-testid={`doc-card-${doc.id}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{doc.title}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          {getCategoryBadge(doc.category)}
                          <span className="flex items-center gap-1 text-[11px] text-gray-400">
                            <Layers className="h-3 w-3 text-blue-400" />
                            {doc.chunkCount || 0} chunks embedded
                          </span>
                        </div>
                      </div>

                      {canDeleteDocs && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id, doc.title)}
                          className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                          title="Delete document"
                          data-testid={`delete-doc-${doc.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-800/60 text-[10px] text-gray-500">
                      <span>ID: {doc.id.slice(0, 8)}</span>
                      <span>Added: {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Document Modal */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Knowledge Document</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateDocument} className="space-y-4 py-2">
            <div>
              <Input
                label="Document Title *"
                placeholder="e.g. Technical Interview Rubric"
                value={uploadFormData.title}
                onChange={(e) => setUploadFormData({ ...uploadFormData, title: e.target.value })}
                required
                data-testid="input-doc-title"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Category</label>
              <select
                value={uploadFormData.category}
                onChange={(e) => setUploadFormData({ ...uploadFormData, category: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                data-testid="select-doc-category"
              >
                <option value="policy">Policy</option>
                <option value="playbook">Playbook</option>
                <option value="template">Job Template</option>
                <option value="guide">Guide</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Document Content (Markdown / Text) *
              </label>
              <textarea
                rows={8}
                required
                placeholder="Paste the document text here. It will be automatically chunked and embedded..."
                value={uploadFormData.content}
                onChange={(e) => setUploadFormData({ ...uploadFormData, content: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono"
                data-testid="input-doc-content"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsUploadOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isUploading} data-testid="btn-submit-doc">
                Chunk & Ingest
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
