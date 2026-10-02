import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampaignsPage from '../app/campaigns/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/campaigns',
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

const mockCampaigns = [
  {
    id: 'camp-1',
    organizationId: 'org-1',
    jobId: 'job-1',
    name: 'Senior DevOps Hiring Q4',
    budget: 80000,
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
        allocationPct: 100,
        bidCpc: 25,
        dailyBudget: 1500,
      },
    ],
  },
];

const mockPublishers = [
  {
    id: 'pub-1',
    organizationId: 'org-1',
    name: 'LinkedIn Jobs',
    type: 'JOB_BOARD',
  },
  {
    id: 'pub-2',
    organizationId: 'org-1',
    name: 'Google Ads',
    type: 'SEARCH',
  },
];

const mockJobs = [
  {
    id: 'job-1',
    organizationId: 'org-1',
    title: 'Senior DevOps Engineer',
    description: 'Lead cloud infrastructure',
    category: 'Operations',
    location: 'Remote',
    remote: true,
    employmentType: 'FULL_TIME',
    minExperienceYears: 5,
    requiredSkills: ['kubernetes', 'aws'],
    preferredSkills: [],
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  },
];

describe('Campaigns Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/api/campaigns/camp-1/allocations')) {
        return Promise.resolve({
          data: [
            {
              id: 'cp-1',
              campaignId: 'camp-1',
              publisherId: 'pub-1',
              allocationPct: 100,
              bidCpc: 25,
              dailyBudget: 1500,
              publisher: mockPublishers[0],
            },
          ],
        });
      }
      if (url.includes('/api/campaigns')) {
        return Promise.resolve({ data: mockCampaigns });
      }
      if (url.includes('/api/publishers')) {
        return Promise.resolve({ data: mockPublishers });
      }
      if (url.includes('/api/jobs')) {
        return Promise.resolve({ data: mockJobs });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders campaigns directory, stats, and campaign row', async () => {
    render(<CampaignsPage />);

    expect(screen.getByText('Ad Campaigns & Channels')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Senior DevOps Hiring Q4')).toBeInTheDocument();
      expect(screen.getByText('Senior DevOps Engineer')).toBeInTheDocument();
    });

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Simulate Events')).toBeInTheDocument();
  });

  it('triggers event simulator when clicking Simulate Events', async () => {
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      accepted: 3,
      duplicates: 0,
      rejected: [],
    });

    render(<CampaignsPage />);

    await waitFor(() => {
      expect(screen.getByText('Senior DevOps Hiring Q4')).toBeInTheDocument();
    });

    const simBtn = screen.getByRole('button', { name: /Simulate Events/i });
    await userEvent.click(simBtn);

    expect(postSpy).toHaveBeenCalledWith('/api/events', expect.objectContaining({
      events: expect.arrayContaining([
        expect.objectContaining({
          eventType: 'IMPRESSION',
          campaignId: 'camp-1',
        }),
      ]),
    }));
  });

  it('opens allocations editor modal for a campaign', async () => {
    render(<CampaignsPage />);

    await waitFor(() => {
      expect(screen.getByText('Senior DevOps Hiring Q4')).toBeInTheDocument();
    });

    const allocBtn = screen.getByRole('button', { name: /Allocations/i });
    await userEvent.click(allocBtn);

    await waitFor(() => {
      expect(screen.getByText(/Budget Allocations: Senior DevOps Hiring Q4/i)).toBeInTheDocument();
      expect(screen.getByText('100% / 100%')).toBeInTheDocument();
    });
  });
});
