import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OptimizePage from '../app/optimize/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/optimize',
}));

jest.mock('recharts', () => {
  const Original = jest.requireActual('recharts');
  return {
    ...Original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

let mockUser = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@talentpulse.com',
  role: 'ADMIN',
  organizationId: 'org-1',
};

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    accessToken: 'test-token',
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockCampaigns = [
  {
    id: 'camp-1',
    organizationId: 'org-1',
    jobId: 'job-1',
    name: 'Growth Marketing Lead Campaign',
    budget: 50000,
    status: 'ACTIVE',
    startDate: new Date().toISOString(),
    publishers: [
      {
        id: 'cp-1',
        campaignId: 'camp-1',
        publisherId: 'pub-a',
        allocationPct: 30,
        publisher: { id: 'pub-a', name: 'JobBoard Prime', type: 'JOB_BOARD' },
      },
      {
        id: 'cp-2',
        campaignId: 'camp-1',
        publisherId: 'pub-b',
        allocationPct: 40,
        publisher: { id: 'pub-b', name: 'SocialReach', type: 'SOCIAL' },
      },
      {
        id: 'cp-3',
        campaignId: 'camp-1',
        publisherId: 'pub-d',
        allocationPct: 30,
        publisher: { id: 'pub-d', name: 'AggregatorX', type: 'AGGREGATOR' },
      },
    ],
  },
];

const mockRecommendation = {
  id: 'rec-12345678-abcd',
  organizationId: 'org-1',
  type: 'CAMPAIGN_ALLOCATION',
  modelVersion: 'rules+score-v1',
  confidence: 0.88,
  status: 'PROPOSED',
  createdAt: new Date().toISOString(),
  decision: {
    current: {
      'pub-a': 30,
      'pub-b': 40,
      'pub-d': 30,
    },
    recommended: {
      'pub-a': 28,
      'pub-b': 30,
      'pub-d': 42,
    },
    actions: [
      {
        publisherId: 'pub-b',
        publisherName: 'SocialReach',
        action: 'reduce_allocation',
        reason: 'CPA increased 18% with declining application rate',
      },
      {
        publisherId: 'pub-d',
        publisherName: 'AggregatorX',
        action: 'increase_allocation',
        reason: 'CPA decreased 14% with strong qualified conversion',
      },
    ],
  },
  explanation: {
    summary: 'Automated 7-day velocity optimization proposal.',
    details: [
      'SocialReach: reduce allocation from 40% to 30%',
      'AggregatorX: increase allocation from 30% to 42%',
    ],
  },
};

describe('Web Optimize Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@talentpulse.com',
      role: 'ADMIN',
      organizationId: 'org-1',
    };
    jest.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/api/campaigns')) {
        return Promise.resolve({ data: mockCampaigns } as never);
      }
      if (url.includes('/api/optimization/recommendations')) {
        return Promise.resolve({ data: [mockRecommendation] } as never);
      }
      return Promise.resolve({ data: null } as never);
    });
    jest.spyOn(api, 'post').mockImplementation((url: string) => {
      if (url.includes('/api/optimization/propose')) {
        return Promise.resolve({ data: mockRecommendation } as never);
      }
      if (url.includes('/approve')) {
        return Promise.resolve({
          data: { ...mockRecommendation, status: 'APPLIED' },
        } as never);
      }
      if (url.includes('/reject')) {
        return Promise.resolve({
          data: { ...mockRecommendation, status: 'REJECTED' },
        } as never);
      }
      return Promise.resolve({ data: null } as never);
    });
  });

  it('renders page header and loads campaign recommendations', async () => {
    render(<OptimizePage />);

    expect(screen.getByText('Budget Optimization Engine')).toBeInTheDocument();
    expect(screen.getByText(/Algorithmic channel scoring/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Recommendation #rec-1234/)).toBeInTheDocument();
      expect(screen.getAllByText('PROPOSED').length).toBeGreaterThan(0);
      expect(screen.getAllByText('rules+score-v1').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('SocialReach')).toBeInTheDocument();
    expect(screen.getByText('REDUCE ALLOCATION')).toBeInTheDocument();
    expect(screen.getByText('AggregatorX')).toBeInTheDocument();
    expect(screen.getByText('INCREASE ALLOCATION')).toBeInTheDocument();
  });

  it('handles approving a proposed recommendation', async () => {
    render(<OptimizePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve Allocations/i })).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /Approve Allocations/i });
    expect(approveBtn).not.toBeDisabled();

    await userEvent.click(approveBtn);

    expect(api.post).toHaveBeenCalledWith(
      '/api/optimization/recommendations/rec-12345678-abcd/approve'
    );
  });

  it('handles rejecting a proposed recommendation', async () => {
    render(<OptimizePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
    });

    const rejectBtn = screen.getByRole('button', { name: /Reject/i });
    expect(rejectBtn).not.toBeDisabled();

    await userEvent.click(rejectBtn);

    expect(api.post).toHaveBeenCalledWith(
      '/api/optimization/recommendations/rec-12345678-abcd/reject'
    );
  });

  it('disables approve/reject and displays notice for ANALYST role', async () => {
    mockUser = {
      id: 'analyst-1',
      name: 'Analyst User',
      email: 'analyst@talentpulse.com',
      role: 'ANALYST',
      organizationId: 'org-1',
    };

    render(<OptimizePage />);

    await waitFor(() => {
      expect(screen.getByText(/You are logged in as an/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Approve Allocations/i })).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /Approve Allocations/i });
    const rejectBtn = screen.getByRole('button', { name: /Reject/i });

    expect(approveBtn).toBeDisabled();
    expect(rejectBtn).toBeDisabled();
  });
});
