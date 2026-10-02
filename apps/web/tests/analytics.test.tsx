import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AnalyticsPage from '../app/analytics/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/analytics',
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

const mockCampaignList = {
  items: [
    { id: 'c1', name: 'Q3 Backend Hiring' },
    { id: 'c2', name: 'Sales Expansion' },
  ],
};

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
];

describe('AnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/campaigns?limit=50')) return mockCampaignList;
      if (url.includes('/analytics/overview')) return mockOverview;
      if (url.includes('/analytics/funnel')) return mockFunnel;
      if (url.includes('/analytics/timeseries')) return mockTimeseries;
      if (url.includes('/analytics/publishers')) return mockPublishers;
      if (url.includes('/analytics/campaigns')) return [];
      return null;
    });
  });

  it('renders analytics page with filters and tabs', async () => {
    render(<AnalyticsPage />);

    expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
    expect(screen.getByText('Funnel Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Channel Comparisons')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Full Stage Conversion Table')).toBeInTheDocument();
      expect(screen.getByText('Application Starts')).toBeInTheDocument();
    });

    // Switch to Channel Comparisons tab
    fireEvent.click(screen.getByText('Channel Comparisons'));
    await waitFor(() => {
      expect(screen.getByText('Publisher Channel Volume vs CPA')).toBeInTheDocument();
      expect(screen.getAllByText('JobBoard Prime').length).toBeGreaterThanOrEqual(1);
    });

    // Switch to Unit Economics tab
    fireEvent.click(screen.getByText('Unit Economics'));
    await waitFor(() => {
      expect(screen.getByText('Channel Unit Economics and Acquisition Cost Matrix')).toBeInTheDocument();
      expect(screen.getAllByText('JobBoard Prime').length).toBeGreaterThanOrEqual(1);
    });
  });
});
