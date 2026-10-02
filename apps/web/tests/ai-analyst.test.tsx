import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiAnalystPage from '../app/ai/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/ai',
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@acme.com',
      role: 'ADMIN',
      organizationId: 'org-1',
    },
    accessToken: 'token',
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockConversations = [
  {
    id: 'conv-1111-uuid',
    organizationId: 'org-1',
    userId: 'admin-1',
    title: 'Why did applications fall this month?',
    createdAt: new Date().toISOString(),
    messageCount: 2,
  },
];

const mockDiagnosisResponse = {
  conversationId: 'conv-1111-uuid',
  messageId: 'msg-2222-uuid',
  answer:
    'Total applications experienced a shift of -18.0%. The primary driver behind this decline is SocialReach, where the Application Rate declined by 34.7%.',
  intent: 'metric_diagnosis',
  steps: ['Analyzing query intent', 'Classified intent as "metric_diagnosis"', 'Identified SocialReach as primary contributor'],
  recommendations: [
    'Reallocate 15% to 20% budget away from SocialReach.',
    'Refresh ad creatives to alleviate audience fatigue.',
  ],
  confidence: 0.95,
  chart: {
    type: 'bar',
    title: 'Applications by Publisher',
    xKey: 'name',
    series: ['Previous Period', 'Current Period'],
    data: [
      { name: 'SocialReach', 'Previous Period': 320, 'Current Period': 210 },
      { name: 'JobBoard Prime', 'Previous Period': 240, 'Current Period': 238 },
    ],
  },
};

describe('Ask TalentPulse AI Conversational Analyst UI (Task 15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('renders conversational analyst interface and handles query submission with diagnosis', async () => {
    const user = userEvent.setup();

    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockConversations,
    });

    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      data: mockDiagnosisResponse,
    });

    render(<AiAnalystPage />);

    expect(await screen.findByText('Ask TalentPulse Conversational Analyst')).toBeInTheDocument();
    expect(screen.getByTestId('ai-question-input')).toBeInTheDocument();

    // Type query
    const input = screen.getByTestId('ai-question-input');
    await user.type(input, 'Why did applications fall this month?');

    const sendBtn = screen.getByTestId('ai-send-button');
    await user.click(sendBtn);

    expect(postSpy).toHaveBeenCalledWith('/api/ai/query', {
      question: 'Why did applications fall this month?',
      conversationId: undefined,
    });

    // Check response renders with SocialReach diagnosis and recommendations
    expect(await screen.findByText(/The primary driver behind this decline is SocialReach/i)).toBeInTheDocument();
    expect(screen.getByText('Actionable Recommendations')).toBeInTheDocument();
    expect(screen.getByText(/Reallocate 15% to 20% budget away from SocialReach/i)).toBeInTheDocument();
    expect(screen.getByText('95% Confidence')).toBeInTheDocument();

    // Toggle trace steps
    const traceBtn = screen.getByTestId('toggle-trace-msg-2222-uuid');
    await user.click(traceBtn);
    expect(screen.getByText('Pipeline Execution Trace')).toBeInTheDocument();
    expect(screen.getByText('Classified intent as "metric_diagnosis"')).toBeInTheDocument();
  });

  it('renders Text-to-SQL response with validated SQL, execution time, and row count (Task 16)', async () => {
    const user = userEvent.setup();

    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockConversations,
    });

    const mockSqlResponse = {
      conversationId: 'conv-1111-uuid',
      messageId: 'msg-sql-3333',
      answer: 'JobBoard Prime has the lowest Cost Per Acquisition (CPA) at ₹100.00.',
      intent: 'analytics_sql',
      steps: ['Classified intent as "analytics_sql"', 'Validated AST and executed in 12ms (5 rows)'],
      sql: 'SELECT publisher_name, cpa FROM v_publisher_performance_daily ORDER BY cpa ASC LIMIT 10;',
      executionTimeMs: 12,
      rowCount: 5,
      confidence: 0.96,
      recommendations: ['Increase allocation to JobBoard Prime'],
    };

    jest.spyOn(api, 'post').mockResolvedValue({
      data: mockSqlResponse,
    });

    render(<AiAnalystPage />);

    const input = screen.getByTestId('ai-question-input');
    await user.type(input, 'Which publisher has the lowest CPA?');

    const sendBtn = screen.getByTestId('ai-send-button');
    await user.click(sendBtn);

    expect(await screen.findByText(/JobBoard Prime has the lowest Cost Per Acquisition/i)).toBeInTheDocument();

    // Toggle SQL view
    const sqlBtn = screen.getByTestId('toggle-sql-msg-sql-3333');
    await user.click(sqlBtn);

    expect(screen.getByText('Validated SQL (AST Guarded)')).toBeInTheDocument();
    expect(screen.getByText('Time: 12ms')).toBeInTheDocument();
    expect(screen.getByText('Rows: 5')).toBeInTheDocument();
    expect(screen.getByText(/SELECT publisher_name, cpa FROM v_publisher_performance_daily/i)).toBeInTheDocument();
  });

  it('renders security refusal message when query triggers SQL safety guardrails', async () => {
    const user = userEvent.setup();

    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockConversations,
    });

    const rejectError = Object.assign(
      new Error('Statement type or keyword DROP is strictly forbidden.'),
      {
        response: {
          data: {
            error: {
              code: 'SQL_REJECTED',
              message: 'Statement type or keyword DROP is strictly forbidden.',
            },
          },
        },
      }
    );

    jest.spyOn(api, 'post').mockRejectedValue(rejectError);

    render(<AiAnalystPage />);

    const input = screen.getByTestId('ai-question-input');
    await user.type(input, 'DROP TABLE Job');

    const sendBtn = screen.getByTestId('ai-send-button');
    await user.click(sendBtn);

    expect(await screen.findByText(/Query Refused by Security Guardrails/i)).toBeInTheDocument();
    expect(screen.getByText(/Statement type or keyword DROP is strictly forbidden/i)).toBeInTheDocument();
    expect(screen.getByText(/v_publisher_performance_daily/i)).toBeInTheDocument();
  });
});

