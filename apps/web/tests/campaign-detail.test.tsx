import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampaignDetailPage from '../app/campaigns/[id]/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1' }),
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/campaigns/camp-1',
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@talentpulse.com',
      role: 'ADMIN',
      organizationId: 'org-1',
    },
    accessToken: 'token',
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockCampaign = {
  id: 'camp-1',
  organizationId: 'org-1',
  jobId: 'job-1',
  name: 'Senior DevOps Hiring Q4',
  budget: 60000,
  status: 'ACTIVE',
  startDate: new Date().toISOString(),
  endDate: null,
  createdAt: new Date().toISOString(),
  job: {
    id: 'job-1',
    title: 'Senior DevOps Engineer',
    location: 'Remote',
  },
  publishers: [
    {
      id: 'cp-1',
      campaignId: 'camp-1',
      publisherId: 'pub-1',
      allocationPct: 60,
      bidCpc: 22,
      dailyBudget: 1200,
      publisher: {
        id: 'pub-1',
        name: 'JobBoard Prime',
        type: 'JOB_BOARD',
      },
    },
    {
      id: 'cp-2',
      campaignId: 'camp-1',
      publisherId: 'pub-2',
      allocationPct: 40,
      bidCpc: 14,
      dailyBudget: 800,
      publisher: {
        id: 'pub-2',
        name: 'SocialReach',
        type: 'SOCIAL',
      },
    },
  ],
};

const mockPublishers = [
  { id: 'pub-1', name: 'JobBoard Prime', type: 'JOB_BOARD' },
  { id: 'pub-2', name: 'SocialReach', type: 'SOCIAL' },
];

describe('Campaign Detail Page (Task 17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/api/campaigns/camp-1') {
        return Promise.resolve({ data: mockCampaign });
      }
      if (url === '/api/publishers') {
        return Promise.resolve({ data: mockPublishers });
      }
      return Promise.resolve({ data: null });
    });
  });

  it('renders campaign metadata, daily budget, and allocation donut', async () => {
    render(<CampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Senior DevOps Hiring Q4')).toBeInTheDocument();
      expect(screen.getByText('JobBoard Prime')).toBeInTheDocument();
      expect(screen.getByText('SocialReach')).toBeInTheDocument();
    });

    expect(screen.getByTestId('btn-simulate-campaign')).toBeInTheDocument();
    expect(screen.getByText('Publisher Channels')).toBeInTheDocument();
    expect(screen.getByText('Channel Allocation Share')).toBeInTheDocument();
  });

  it('opens and triggers simulation runner modal', async () => {
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      data: {
        campaignId: 'camp-1',
        days: 7,
        eventsCreated: 1400,
        spendsCreated: 14,
        details: [],
      },
    });

    render(<CampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-simulate-campaign')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('btn-simulate-campaign'));

    expect(screen.getByText('Simulate Publisher Performance')).toBeInTheDocument();

    const runBtn = screen.getByTestId('btn-confirm-simulate');
    await userEvent.click(runBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/campaigns/camp-1/simulate', {
        days: 7,
        seed: expect.any(Number),
      });
    });
  });

  it('switches to Performance tab and displays publisher performance cards with trend deltas', async () => {
    const mockPerf = [
      {
        publisherId: 'pub-1',
        publisherName: 'JobBoard Prime',
        publisherType: 'JOB_BOARD',
        impressions: 25000,
        clicks: 850,
        applications: 75,
        qualifiedApplications: 50,
        interviews: 20,
        hires: 5,
        spend: 12000,
        ctr: 0.034,
        applicationRate: 0.088,
        cpc: 14.12,
        cpa: 160.0,
        cpqa: 240.0,
        cph: 2400.0,
        rank: 1,
        trends: {
          ctrDelta: 5.2,
          cpcDelta: -4.1,
          cpaDelta: -10.5,
          cpqaDelta: -8.0,
          cphDelta: -12.0,
          impressionsDelta: 15.0,
          clicksDelta: 12.0,
          applicationsDelta: 20.0,
          spendDelta: 8.0,
        },
        funnel: {
          impressions: 25000,
          clicks: 850,
          applications: 75,
          qualifiedApplications: 50,
          interviews: 20,
          hires: 5,
        },
      },
    ];

    jest.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/api/campaigns/camp-1') {
        return Promise.resolve({ data: mockCampaign });
      }
      if (url === '/api/publishers') {
        return Promise.resolve({ data: mockPublishers });
      }
      if (url.includes('/api/analytics/publishers')) {
        return Promise.resolve({ data: mockPerf });
      }
      return Promise.resolve({ data: null });
    });

    render(<CampaignDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-performance')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('tab-performance'));

    await waitFor(() => {
      expect(screen.getByText(/Publisher Performance Cards/i)).toBeInTheDocument();
      expect(screen.getByText(/Publisher Efficiency & Ranking Table/i)).toBeInTheDocument();
      expect(screen.getByText(/Top Performer/i)).toBeInTheDocument();
    });
  });
});
