import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExperimentsPage from '../app/experiments/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/experiments',
}));

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

const mockExperiments = [
  {
    id: 'exp-1',
    organizationId: 'org-1',
    name: 'Landing Page Headline Optimization',
    hypothesis: 'Framing job ads with AI boost increases conversion rate.',
    status: 'RUNNING',
    variants: [
      { key: 'control', weight: 50 },
      { key: 'ai_empowered', weight: 50 },
    ],
    totalExposures: 120,
    totalConversions: 32,
    stats: [
      {
        variant: 'control',
        weight: 50,
        exposures: 60,
        conversions: 12,
        conversionRate: 0.2,
        lift: 0,
        zScore: 0,
        pValue: 1.0,
        significant: false,
      },
      {
        variant: 'ai_empowered',
        weight: 50,
        exposures: 60,
        conversions: 20,
        conversionRate: 0.3333,
        lift: 0.6667,
        zScore: 1.67,
        pValue: 0.095,
        significant: false,
      },
    ],
    hasSufficientData: true,
    winner: null,
    createdAt: new Date().toISOString(),
  },
];

describe('ExperimentsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockExperiments,
    });
    jest.spyOn(api, 'post').mockResolvedValue({
      data: {
        experimentId: 'exp-1',
        subjectKey: 'test-user',
        variant: 'ai_empowered',
        isNewExposure: true,
        converted: true,
      },
    });
  });

  it('renders page title and list of experiments', async () => {
    render(<ExperimentsPage />);

    expect(screen.getByText('A/B Testing & Experiments')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Landing Page Headline Optimization').length).toBeGreaterThan(0);
      expect(screen.getAllByText('RUNNING').length).toBeGreaterThan(0);
      expect(screen.getAllByText('120').length).toBeGreaterThan(0); // total exposures
      expect(screen.getAllByText('32').length).toBeGreaterThan(0); // total conversions
    });
  });

  it('displays variant comparison table with metrics and z-test results', async () => {
    render(<ExperimentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Landing Page Headline Optimization').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Variant Comparison & Significance Analysis')).toBeInTheDocument();
    expect(screen.getByText('control')).toBeInTheDocument();
    expect(screen.getByText('ai_empowered')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument(); // control CR
    expect(screen.getByText('33.3%')).toBeInTheDocument(); // variant CR
    expect(screen.getByText('+66.7%')).toBeInTheDocument(); // lift
  });

  it('allows subject assignment in the sandbox', async () => {
    render(<ExperimentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Landing Page Headline Optimization').length).toBeGreaterThan(0);
      expect(screen.getByText('Deterministic Assignment Sandbox')).toBeInTheDocument();
    });

    const assignBtn = screen.getByText('Assign Subject');
    fireEvent.click(assignBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/experiments/exp-1/assign',
        expect.objectContaining({ subjectKey: 'cand_user_42' })
      );
    });
  });

  it('opens new experiment dialog when clicking New Experiment', async () => {
    render(<ExperimentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Landing Page Headline Optimization').length).toBeGreaterThan(0);
    });

    const newBtn = screen.getByText('New Experiment');
    fireEvent.click(newBtn);

    expect(screen.getByText('Create A/B Experiment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Optimized Apply CTA vs Standard')).toBeInTheDocument();
  });
});
