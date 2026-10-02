import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ForecastPage from '../app/forecast/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/forecast',
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

const mockCampaigns = {
  items: [
    { id: 'c1', name: 'Q1 Hiring Sprint' },
    { id: 'c2', name: 'Sales Surge' },
  ],
};

const mockForecastSuccess = {
  metric: 'applications',
  horizon: 7,
  campaignId: 'c1',
  campaignName: 'Q1 Hiring Sprint',
  history: [
    { date: '2026-02-01', value: 10 },
    { date: '2026-02-02', value: 14 },
    { date: '2026-02-03', value: 12 },
  ],
  forecast: [
    { date: '2026-02-04', value: 15, lower: 11, upper: 19 },
    { date: '2026-02-05', value: 16, lower: 12, upper: 20 },
  ],
  method: 'holt_winters',
  backtest: {
    mae: 1.25,
    rmse: 1.55,
    mape: 0.1,
    baselineMae: 2.85,
  },
  insight: {
    expectedTotalNext7d: 31,
    actualLast7d: 36,
    trendPctVsLast7d: -13.9,
    shortfallAlert: true,
    targetPace7d: 50,
    message: 'Projected applications: 31 over the next 7 days (-13.9% vs prior 7 days). Shortfall alert: pacing below target pace of 50 applications.',
  },
  recommendationId: 'rec-123',
};

describe('Forecast Page Web Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/campaigns')) {
        return mockCampaigns;
      }
      if (url.startsWith('/api/forecast')) {
        return mockForecastSuccess;
      }
      return {};
    });
  });

  it('renders forecast page with KPI summary cards and model badge', async () => {
    render(<ForecastPage />);

    expect(screen.getByText('Forecasting Intelligence')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Expected applications (Next 7d)')).toBeInTheDocument();
      expect(screen.getByText('31')).toBeInTheDocument();
      expect(screen.getByText('Holt-Winters (Weekly Seasonality)')).toBeInTheDocument();
    });
  });

  it('renders shortfall alert banner when shortfallAlert is true', async () => {
    render(<ForecastPage />);

    await waitFor(() => {
      expect(screen.getByTestId('shortfall-alert-banner')).toBeInTheDocument();
      expect(screen.getByText(/Pacing Shortfall Alert/i)).toBeInTheDocument();
      expect(screen.getByText(/Review Optimization/i)).toBeInTheDocument();
    });
  });

  it('renders backtest metrics table with MAE, RMSE, and MAPE', async () => {
    render(<ForecastPage />);

    await waitFor(() => {
      expect(screen.getByText('Mean Absolute Error (MAE)')).toBeInTheDocument();
      expect(screen.getByText('1.25')).toBeInTheDocument();
      expect(screen.getByText('2.85')).toBeInTheDocument();
      expect(screen.getByText('1.55')).toBeInTheDocument();
      expect(screen.getByText('10.0%')).toBeInTheDocument();
    });
  });

  it('switches metric to spend and requests updated forecast', async () => {
    render(<ForecastPage />);

    await waitFor(() => {
      expect(screen.getByText('Forecasting Intelligence')).toBeInTheDocument();
    });

    const spendButton = screen.getByRole('button', { name: /spend/i });
    fireEvent.click(spendButton);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('metric=spend'));
    });
  });
});
