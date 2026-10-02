'use client';

import * as React from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Code,
  BarChart2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CheckCircle2,
  Bot,
  User,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import {
  AiQueryResponse,
  AiConversationItem,
  AiMessageItem,
} from '@talentpulse/shared';

const SUGGESTED_CHIPS = [
  'Why did applications fall this month?',
  'Which publisher has the lowest CPA?',
  'Top candidates for Backend Engineer',
  'What is our interview policy?',
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  payload?: Partial<AiQueryResponse>;
}

export default function AiAnalystPage() {
  const { addToast } = useToast();

  const [conversations, setConversations] = React.useState<AiConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [question, setQuestion] = React.useState('');
  const [isQuerying, setIsQuerying] = React.useState(false);

  // Expandable message sections state (messageId -> { sql: bool, chart: bool, trace: bool })
  const [expandedSections, setExpandedSections] = React.useState<
    Record<string, { sql?: boolean; chart?: boolean; trace?: boolean }>
  >({});

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, isQuerying]);

  const fetchConversations = React.useCallback(async () => {
    try {
      const res = await api.get<{ data: AiConversationItem[] }>('/api/ai/conversations');
      setConversations(res.data);
    } catch {
      // Non-blocking error
    }
  }, []);

  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const loadConversation = async (convId: string) => {
    setActiveConversationId(convId);
    try {
      const res = await api.get<{
        data: {
          id: string;
          messages: AiMessageItem[];
        };
      }>(`/api/ai/conversations/${convId}`);

      const loadedMessages: ChatMessage[] = res.data.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        payload: m.payload as Partial<AiQueryResponse>,
      }));
      setMessages(loadedMessages);
    } catch {
      addToast({
        title: 'Error loading conversation',
        description: 'Failed to retrieve messages',
        variant: 'danger',
      });
    }
  };

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setQuestion('');
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/api/ai/conversations/${convId}`);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        handleStartNewChat();
      }
      addToast({
        title: 'Conversation deleted',
        description: 'Chat session removed',
        variant: 'success',
      });
    } catch {
      addToast({
        title: 'Delete failed',
        description: 'Could not delete conversation',
        variant: 'danger',
      });
    }
  };

  const toggleSection = (messageId: string, section: 'sql' | 'chart' | 'trace') => {
    setExpandedSections((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        [section]: !prev[messageId]?.[section],
      },
    }));
  };

  const handleSend = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q || isQuerying) return;

    if (queryText) {
      setQuestion('');
    } else {
      setQuestion('');
    }

    const tempUserMsgId = `temp-user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: tempUserMsgId,
        role: 'user',
        content: q,
      },
    ];
    setMessages(newMessages);
    setIsQuerying(true);

    try {
      const res = await api.post<{ data: AiQueryResponse }>('/api/ai/query', {
        question: q,
        conversationId: activeConversationId || undefined,
      });

      const data = res.data;
      if (!activeConversationId) {
        setActiveConversationId(data.conversationId);
        fetchConversations();
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: 'assistant',
          content: data.answer,
          payload: data,
        },
      ]);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string; code?: string } } } };
      const errorMsg =
        apiErr?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : 'AI Analyst query error');
      const errorCode = apiErr?.response?.data?.error?.code;

      if (
        errorCode === 'SQL_REJECTED' ||
        errorMsg.includes('SQL_REJECTED') ||
        errorMsg.includes('guardrails') ||
        errorMsg.includes('forbidden') ||
        errorMsg.includes('not permitted')
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `🛡️ **Query Refused by Security Guardrails**\n\n${errorMsg}\n\n*Note: TalentPulse enforces AST parsing, tenant isolation, and strict view allowlisting. You can query:*\n- \`v_job_funnel_daily\` (Funnel conversions & spend)\n- \`v_publisher_performance_daily\` (Publisher CPA, CTR, CPC)\n- \`v_campaign_summary\` (Campaign budgets & hires)\n- \`v_applications_overview\` (Sourcing & stages)\n- \`v_jobs_overview\` (Job requisitions & skills)`,
          },
        ]);
      } else {
        addToast({
          title: 'Query failed',
          description: errorMsg,
          variant: 'danger',
        });
      }
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4 max-w-7xl mx-auto">
      {/* Sidebar: Conversation History */}
      <aside className="w-64 hidden md:flex flex-col bg-[#0E131F] border border-gray-800 rounded-lg p-3 space-y-3">
        <Button
          variant="primary"
          size="sm"
          onClick={handleStartNewChat}
          className="w-full justify-start text-xs"
          data-testid="btn-new-chat"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Conversation
        </Button>

        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 pt-1">
          Recent Sessions
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {conversations.length === 0 ? (
            <div className="text-xs text-gray-500 p-2 text-center">No past chats yet</div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs transition-colors ${
                    isActive ? 'bg-blue-900/30 text-blue-300 font-medium' : 'text-gray-300 hover:bg-gray-800/60'
                  }`}
                  data-testid={`conv-item-${c.id}`}
                >
                  <span className="truncate flex-1 pr-2">{c.title}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-0.5 transition-opacity"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Container */}
      <main className="flex-1 flex flex-col bg-[#0E131F] border border-gray-800 rounded-lg overflow-hidden">
        {/* Chat Header */}
        <header className="px-5 py-3 border-b border-gray-800/80 flex items-center justify-between bg-gray-900/40">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Ask TalentPulse Conversational Analyst</h1>
              <p className="text-[11px] text-gray-400">
                Diagnostic Root-Cause Analysis · SQL Queries · RAG Policy Search
              </p>
            </div>
          </div>
        </header>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6" data-testid="chat-messages-container">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Bot className="h-6 w-6" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-base font-semibold text-white">Welcome to TalentPulse Intelligence</h3>
                <p className="text-xs text-gray-400">
                  Ask me why applications dropped, find high-match candidates, inspect acquisition costs, or query internal recruitment policies.
                </p>
              </div>

              {/* Suggestion Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 max-w-lg w-full">
                {SUGGESTED_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSend(chip)}
                    className="p-3 text-left bg-gray-900/80 hover:bg-gray-800 border border-gray-800 rounded-lg text-xs text-gray-300 transition-all flex items-center justify-between"
                  >
                    <span>{chip}</span>
                    <ArrowRight className="h-3 w-3 text-gray-500 shrink-0 ml-1.5" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isAssistant = m.role === 'assistant';
              const p = m.payload;
              const sections = expandedSections[m.id] || {};

              return (
                <div
                  key={m.id}
                  className={`flex gap-3 ${isAssistant ? 'items-start' : 'items-start flex-row-reverse'}`}
                  data-testid={`message-${m.id}`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                      isAssistant
                        ? 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
                        : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                    }`}
                  >
                    {isAssistant ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                  </div>

                  <div className={`space-y-3 max-w-2xl ${isAssistant ? 'w-full' : ''}`}>
                    {/* Message Bubble */}
                    <div
                      className={`p-4 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                        isAssistant
                          ? 'bg-gray-900/90 border border-gray-800 text-gray-100'
                          : 'bg-blue-600 text-white font-medium ml-auto'
                      }`}
                    >
                      {m.content}
                    </div>

                    {/* Assistant Metadata & Visuals */}
                    {isAssistant && p && (
                      <div className="space-y-3 pt-1">
                        {/* Badges / Confidence */}
                        <div className="flex flex-wrap items-center gap-2">
                          {p.confidence !== undefined && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/40 text-blue-300 border border-blue-800/40">
                              <ShieldCheck className="h-3 w-3 text-blue-400" />
                              {Math.round(p.confidence * 100)}% Confidence
                            </span>
                          )}

                          {p.chart && (
                            <button
                              type="button"
                              onClick={() => toggleSection(m.id, 'chart')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300 hover:text-white border border-gray-700 transition-colors"
                              data-testid={`toggle-chart-${m.id}`}
                            >
                              <BarChart2 className="h-3 w-3 text-emerald-400" />
                              {sections.chart ? 'Hide Chart' : 'View Interactive Chart'}
                              {sections.chart ? (
                                <ChevronUp className="h-2.5 w-2.5 ml-1" />
                              ) : (
                                <ChevronDown className="h-2.5 w-2.5 ml-1" />
                              )}
                            </button>
                          )}

                          {p.sql && (
                            <button
                              type="button"
                              onClick={() => toggleSection(m.id, 'sql')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300 hover:text-white border border-gray-700 transition-colors"
                              data-testid={`toggle-sql-${m.id}`}
                            >
                              <Code className="h-3 w-3 text-blue-400" />
                              {sections.sql ? 'Hide SQL' : 'View Executed SQL'}
                              {sections.sql ? (
                                <ChevronUp className="h-2.5 w-2.5 ml-1" />
                              ) : (
                                <ChevronDown className="h-2.5 w-2.5 ml-1" />
                              )}
                            </button>
                          )}

                          {p.steps && p.steps.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleSection(m.id, 'trace')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-gray-500 hover:text-gray-400 transition-colors"
                              data-testid={`toggle-trace-${m.id}`}
                            >
                              <span>{p.steps.length} Pipeline Steps</span>
                              {sections.trace ? (
                                <ChevronUp className="h-2.5 w-2.5" />
                              ) : (
                                <ChevronDown className="h-2.5 w-2.5" />
                              )}
                            </button>
                          )}
                        </div>

                        {/* Interactive Chart Container */}
                        {p.chart && sections.chart !== false && (
                          <Card className="bg-gray-950/80 border-gray-800 p-4 rounded-lg">
                            <CardContent className="p-0 space-y-2">
                              {p.chart.title && (
                                <div className="text-xs font-semibold text-gray-200">
                                  {p.chart.title}
                                </div>
                              )}
                              <div className="h-48 w-full pt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                  {p.chart.type === 'line' ? (
                                    <LineChart data={p.chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                                      <XAxis dataKey={p.chart.xKey} stroke="#9CA3AF" fontSize={10} />
                                      <YAxis stroke="#9CA3AF" fontSize={10} />
                                      <Tooltip
                                        contentStyle={{
                                          backgroundColor: '#111827',
                                          borderColor: '#374151',
                                          fontSize: '11px',
                                        }}
                                      />
                                      {p.chart.series.map((s, idx) => (
                                        <Line
                                          key={s}
                                          type="monotone"
                                          dataKey={s}
                                          stroke={idx === 0 ? '#3B82F6' : '#10B981'}
                                          strokeWidth={2}
                                        />
                                      ))}
                                    </LineChart>
                                  ) : (
                                    <BarChart data={p.chart.data}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                                      <XAxis dataKey={p.chart.xKey} stroke="#9CA3AF" fontSize={10} />
                                      <YAxis stroke="#9CA3AF" fontSize={10} />
                                      <Tooltip
                                        contentStyle={{
                                          backgroundColor: '#111827',
                                          borderColor: '#374151',
                                          fontSize: '11px',
                                        }}
                                      />
                                      {p.chart.series.map((s, idx) => (
                                        <Bar
                                          key={s}
                                          dataKey={s}
                                          fill={idx === 0 ? '#3B82F6' : '#10B981'}
                                          radius={[4, 4, 0, 0]}
                                        />
                                      ))}
                                    </BarChart>
                                  )}
                                </ResponsiveContainer>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Executed SQL Box */}
                        {p.sql && sections.sql && (
                          <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="flex items-center gap-1.5 text-blue-400 uppercase tracking-wider font-semibold">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                Validated SQL (AST Guarded)
                              </span>
                              <div className="flex items-center gap-3 text-gray-400">
                                {p.executionTimeMs !== undefined && (
                                  <span>Time: {p.executionTimeMs}ms</span>
                                )}
                                {p.rowCount !== undefined && (
                                  <span>Rows: {p.rowCount}</span>
                                )}
                              </div>
                            </div>
                            <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre p-2 bg-black/40 rounded border border-gray-800/60">
                              {p.sql}
                            </pre>
                          </div>
                        )}

                        {/* Actionable Recommendations */}
                        {p.recommendations && p.recommendations.length > 0 && (
                          <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-3 space-y-2">
                            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Actionable Recommendations
                            </div>
                            <ul className="space-y-1.5 pl-1">
                              {p.recommendations.map((rec, rIdx) => (
                                <li key={rIdx} className="text-xs text-emerald-200/90 flex items-start gap-2">
                                  <span className="font-bold text-emerald-400">·</span>
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Citations */}
                        {p.citations && p.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {p.citations.map((c) => (
                              <span
                                key={c.n}
                                className="inline-flex items-center gap-1 text-[11px] bg-blue-950/30 border border-blue-800/40 text-blue-300 px-2 py-0.5 rounded font-mono"
                              >
                                [{c.n}] {c.title} ({Math.round(c.similarity * 100)}%)
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Pipeline Execution Trace */}
                        {p.steps && sections.trace && (
                          <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 space-y-1.5 text-[11px]">
                            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                              Pipeline Execution Trace
                            </div>
                            {p.steps.map((step, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-2 text-gray-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                <span>{step}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isQuerying && (
            <div className="flex gap-3 items-center text-xs text-gray-400 animate-pulse">
              <div className="h-7 w-7 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span>Analyst is classifying intent, aggregating data, and synthesizing response...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <footer className="p-4 border-t border-gray-800/80 bg-gray-900/30 space-y-3">
          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSend(chip)}
                className="text-[11px] text-gray-400 hover:text-gray-200 bg-gray-900/60 hover:bg-gray-800 border border-gray-800 px-2.5 py-1 rounded transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Ask TalentPulse anything about funnel shifts, CPA rankings, policies, or candidates..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={isQuerying}
              className="text-xs"
              data-testid="ai-question-input"
            />
            <Button
              type="submit"
              variant="primary"
              isLoading={isQuerying}
              disabled={!question.trim()}
              data-testid="ai-send-button"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Ask
            </Button>
          </form>
        </footer>
      </main>
    </div>
  );
}
