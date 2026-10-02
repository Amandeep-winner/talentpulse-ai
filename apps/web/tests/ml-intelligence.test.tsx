import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import JobDetailPage from '../app/jobs/[id]/page';
import CampaignDetailPage from '../app/campaigns/[id]/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useParams: () => ({ id: '11111111-1111-1111-1111-111111111111' }),
  usePathname: () => '/jobs/11111111-1111-1111-1111-111111111111',
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

const mockJob = {
  id: '11111111-1111-1111-1111-111111111111',
  organizationId: 'org-1',
  title: 'Senior Distributed Systems Engineer',
  description: 'Looking for a senior engineer with Go and Kubernetes experience.',
  category: 'Engineering',
  location: 'Bengaluru',
  remote: true,
  employmentType: 'FULL_TIME',
  salaryMin: 3500000,
  salaryMax: 4500000,
  minExperienceYears: 5,
  requiredSkills: ['Go', 'Kubernetes'],
  preferredSkills: ['gRPC', 'PostgreSQL'],
  status: 'OPEN',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const mockCampaign = {
  id: '11111111-1111-1111-1111-111111111111',
  organizationId: 'org-1',
  jobId: '11111111-1111-1111-1111-111111111111',
  name: 'DevOps Scale Campaign',
  budget: 50000,
  status: 'ACTIVE',
  startDate: new Date().toISOString(),
  endDate: null,
  createdAt: new Date().toISOString(),
  job: {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Senior Distributed Systems Engineer',
    location: 'Bengaluru',
    category: 'Engineering',
    minExperienceYears: 5,
    remote: true,
  },
  publishers: [
    {
      id: 'cp-1',
      campaignId: '11111111-1111-1111-1111-111111111111',
      publisherId: 'pub-1',
      allocationPct: 100,
      bidCpc: 25,
      dailyBudget: 1500,
      publisher: {
        id: 'pub-1',
        name: 'TechBoard Pro',
        type: 'JOB_BOARD',
      },
    },
  ],
};

describe('Frontend Predictive Intelligence (Task 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Job Detail Page - Fill Probability Card', () => {
    it('renders fill probability, risk badge, and explainability factors when prediction succeeds', async () => {
      jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/api/jobs/')) {
          return { data: mockJob } as never;
        }
        return { data: null } as never;
      });

      jest.spyOn(api, 'post').mockImplementation(async (url: string) => {
        if (url.includes('/api/ml/predict/fill')) {
          return {
            data: {
              jobId: mockJob.id,
              jobTitle: mockJob.title,
              probability: 0.78,
              risk: 'Low',
              modelVersion: 'rf_20261002_v1',
              topFactors: [
                {
                  feature: 'applications_first_7d',
                  impact: 'positive',
                  weight: 0.35,
                  description: 'High early application volume (12 in first 7d)',
                },
                {
                  feature: 'salary_band',
                  impact: 'positive',
                  weight: 0.28,
                  description: 'Competitive compensation bracket (₹40.0L avg)',
                },
              ],
            },
          } as never;
        }
        return { data: null } as never;
      });

      render(<JobDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Predictive Intelligence')).toBeInTheDocument();
      });

      expect(screen.getByText('78%')).toBeInTheDocument();
      expect(screen.getByText('Fill Probability')).toBeInTheDocument();
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
      expect(screen.getByText('High early application volume (12 in first 7d)')).toBeInTheDocument();
      expect(screen.getByText('Model: rf_20261002_v1')).toBeInTheDocument();
    });

    it('shows graceful fallback state when ML prediction fails', async () => {
      jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/api/jobs/')) {
          return { data: mockJob } as never;
        }
        return { data: null } as never;
      });

      jest.spyOn(api, 'post').mockRejectedValue(new Error('ML service unavailable'));

      render(<JobDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Predictive Intelligence')).toBeInTheDocument();
      });

      expect(screen.getByText('Unable to generate fill forecast')).toBeInTheDocument();
      expect(screen.getByText('Retry Forecast')).toBeInTheDocument();
    });
  });

  describe('Campaign Detail Page - Predicted Application Probability', () => {
    it('renders predicted conversion rate column and ML values per publisher', async () => {
      jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/api/campaigns/')) {
          return { data: mockCampaign } as never;
        }
        if (url.includes('/api/publishers')) {
          return { data: [mockCampaign.publishers[0]!.publisher] } as never;
        }
        return { data: null } as never;
      });

      jest.spyOn(api, 'post').mockImplementation(async (url: string) => {
        if (url.includes('/api/ml/predict/application')) {
          return {
            data: {
              probability: 0.214,
              modelVersion: 'gb_20261002_active',
              topFactors: [
                {
                  feature: 'historical_conv',
                  impact: 'positive',
                  weight: 0.32,
                  description: 'Strong publisher conversion baseline',
                },
              ],
            },
          } as never;
        }
        return { data: null } as never;
      });

      render(<CampaignDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('TechBoard Pro')).toBeInTheDocument();
      });

      expect(screen.getByText('Pred. Conv')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('21.4%')).toBeInTheDocument();
      });

      expect(screen.getByText(/Predicted conversion: gradient boosting classifier model/i)).toBeInTheDocument();
    });
  });
});
