import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BanditLab } from '../app/optimize/bandit-lab';
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

const mockUser = {
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

const mockSimulationResponse = {
  rounds: 500,
  rewardHistory: [
    { round: 1, linucb: 1.2, epsilon_greedy: 0.9, random: 0.4, static: 0.6 },
    { round: 500, linucb: 620.5, epsilon_greedy: 540.2, random: 290.1, static: 340.0 },
  ],
  regretHistory: [
    { round: 1, linucb: 0.1, epsilon_greedy: 0.4, random: 0.8, static: 0.5 },
    { round: 500, linucb: 42.1, epsilon_greedy: 98.4, random: 310.5, static: 220.0 },
  ],
  summaries: [
    {
      algorithm: 'linucb',
      cumulativeReward: 620.5,
      averageReward: 1.241,
      regret: 42.1,
      actionCounts: {
        increase_bid: 180,
        decrease_bid: 40,
        maintain_bid: 60,
        increase_budget: 190,
        decrease_budget: 30,
      },
    },
    {
      algorithm: 'epsilon_greedy',
      cumulativeReward: 540.2,
      averageReward: 1.08,
      regret: 98.4,
      actionCounts: {
        increase_bid: 140,
        decrease_bid: 60,
        maintain_bid: 80,
        increase_budget: 150,
        decrease_budget: 70,
      },
    },
    {
      algorithm: 'static',
      cumulativeReward: 340.0,
      averageReward: 0.68,
      regret: 220.0,
      actionCounts: {
        increase_bid: 0,
        decrease_bid: 0,
        maintain_bid: 500,
        increase_budget: 0,
        decrease_budget: 0,
      },
    },
    {
      algorithm: 'random',
      cumulativeReward: 290.1,
      averageReward: 0.58,
      regret: 310.5,
      actionCounts: {
        increase_bid: 102,
        decrease_bid: 98,
        maintain_bid: 101,
        increase_budget: 99,
        decrease_budget: 100,
      },
    },
  ],
};

describe('BanditLab Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'post').mockImplementation((url: string) => {
      if (url.includes('/simulate')) {
        return Promise.resolve({ data: mockSimulationResponse });
      }
      return Promise.resolve({ data: { success: true } });
    });
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        algorithm: 'linucb',
        state: { arms: {}, totalPulls: 40 },
      },
    });
  });

  it('renders simulation lab header and controls', async () => {
    render(<BanditLab />);

    expect(screen.getByText('Bandit Simulation Lab')).toBeInTheDocument();
    expect(screen.getByText('Disjoint LinUCB (α=0.8)')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Run Simulation')).toBeInTheDocument();
    });
    expect(screen.getByText('Reset Live Policies')).toBeInTheDocument();
  });

  it('loads and displays simulation summary metrics for all algorithms', async () => {
    render(<BanditLab />);

    await waitFor(() => {
      expect(screen.getByText('620.5')).toBeInTheDocument(); // LinUCB cumulative reward
      expect(screen.getByText('540.2')).toBeInTheDocument(); // EpsilonGreedy cumulative reward
      expect(screen.getByText('290.1')).toBeInTheDocument(); // Random cumulative reward
    });

    // Check regret labels
    expect(screen.getByText('42.1')).toBeInTheDocument();
    expect(screen.getByText('310.5')).toBeInTheDocument();
  });

  it('triggers simulation API when Run Simulation button is clicked', async () => {
    render(<BanditLab />);

    await waitFor(() => {
      expect(screen.getByText('Run Simulation')).toBeInTheDocument();
    });

    const runBtn = screen.getByText('Run Simulation');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/optimization/bandit/simulate',
        expect.objectContaining({
          rounds: 500,
          seed: 42,
        })
      );
    });
  });
});
