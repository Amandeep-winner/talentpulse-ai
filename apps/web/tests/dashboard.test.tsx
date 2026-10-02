import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '../app/dashboard/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/dashboard',
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

const mockOverview = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  previousPeriod: { from: '2026-08-01', to: '2026-08-31' },
  totals: {
    jobs: 30,
    applications: 1520,
    interviews: 280,
    hires: 45,
    spend: 18500.5,
    impressions: 450000,
    clicks: 14200,
    cpa: 12.17,
    cph: 411.12,
    ctr: 3.16,
    applicationRate: 10.7,
    conversionRate: 0.01,
  },
  deltas: {
    jobs: 0,
    applications: -15.5,
    interviews: -12.5,
    hires: -10.0,
    spend: -2.6,
    cpa: 15.2,
    cph: 8.2,
    conversionRate: -0.05,
  },
};

const mockFunnel = [
  { stage: 'IMPRESSION', name: 'Impressions', count: 450000, conversionRate: null, dropOffRate: null },
  { stage: 'CLICK', name: 'Clicks', count: 14200, conversionRate: 3.16, dropOffRate: 96.84 },
  { stage: 'APPLICATION_START', name: 'Application Starts', count: 6400, conversionRate: 45.07, dropOffRate: 54.93 },
  { stage: 'APPLICATION', name: 'Applications', count: 1520, conversionRate: 23.75, dropOffRate: 76.25 },
  { stage: 'QUALIFIED_APPLICATION', name: 'Qualified Applications', count: 980, conversionRate: 64.47, dropOffRate: 35.53 },
  { stage: 'INTERVIEW', name: 'Interviews', count: 280, conversionRate: 28.57, dropOffRate: 71.43 },
  { stage: 'HIRE', name: 'Hires', count: 45, conversionRate: 16.07, dropOffRate: 83.93 },
];

const mockTimeseries = [
  { date: '2026-09-01', impressions: 5000, clicks: 150, applications: 18, interviews: 3, hires: 1, spend: 200 },
  { date: '2026-09-02', impressions: 5200, clicks: 160, applications: 20, interviews: 4, hires: 1, spend: 210 },
];

const mockPublishers = [
  {
    publisherId: 'pub-1',
    publisherName: 'JobBoard Prime',
    publisherType: 'JOB_BOARD',
    impressions: 150000,
    clicks: 4200,
    applications: 350,
    qualifiedApplications: 245,
    interviews: 65,
    hires: 12,
    spend: 7700,
    ctr: 2.8,
    applicationRate: 8.33,
    cpc: 1.83,
    cpa: 22.0,
    cph: 641.67,
  },
  {
    publisherId: 'pub-2',
    publisherName: 'SocialReach',
    publisherType: 'SOCIAL',
    impressions: 200000,
    clicks: 6500,
    applications: 420,
    qualifiedApplications: 180,
    interviews: 40,
    hires: 8,
    spend: 8125,
    ctr: 3.25,
    applicationRate: 6.46,
    cpc: 1.25,
    cpa: 19.35,
    cph: 1015.63,
  },
];

const mockCampaigns = [
  {
    campaignId: 'camp-1',
    campaignName: 'Staff Backend Q4 Hiring Wave',
    jobTitle: 'Staff Backend Distributed Systems Engineer',
    status: 'ACTIVE',
    budget: 20000,
    spend: 6500,
    impressions: 120000,
    clicks: 3400,
    applications: 380,
    interviews: 70,
    hires: 10,
    cpa: 17.11,
    cph: 650.0,
  },
];

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/analytics/overview')) return mockOverview;
      if (url.includes('/analytics/funnel')) return mockFunnel;
      if (url.includes('/analytics/timeseries')) return mockTimeseries;
      if (url.includes('/analytics/publishers')) return mockPublishers;
      if (url.includes('/analytics/campaigns')) return mockCampaigns;
      return null;
    });
  });

  it('renders dashboard with KPI cards and funnel metrics', async () => {
    render(<DashboardPage />);

    // Header
    expect(screen.getByText('Recruitment Intelligence')).toBeInTheDocument();

    // KPI cards
    await waitFor(() => {
      expect(screen.getByText('$18,500.50')).toBeInTheDocument();
      expect(screen.getAllByText('1,520').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('$12.17')).toBeInTheDocument();
      expect(screen.getAllByText('45').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('$411.12')).toBeInTheDocument();
    });

    // Funnel stages
    expect(screen.getByText('Recruitment Funnel')).toBeInTheDocument();
    expect(screen.getByText('Application Starts')).toBeInTheDocument();
    expect(screen.getByText('Qualified Applications')).toBeInTheDocument();

    // Publisher comparison table
    expect(screen.getByText('JobBoard Prime')).toBeInTheDocument();
    expect(screen.getByText('SocialReach')).toBeInTheDocument();

    // Campaign table
    expect(screen.getByText('Staff Backend Distributed Systems Engineer')).toBeInTheDocument();
  });
});
