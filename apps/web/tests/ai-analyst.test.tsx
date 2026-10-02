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
});
