import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobDetailPage from '../app/jobs/[id]/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useParams: () => ({ id: '11111111-1111-1111-1111-111111111111' }),
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

const mockMatchesResponse = {
  jobId: '11111111-1111-1111-1111-111111111111',
  jobTitle: 'Senior Distributed Systems Engineer',
  totalMatches: 1,
  recommendationId: 'rec-1234-uuid',
  matches: [
    {
      candidateId: 'cand-0001-uuid',
      name: 'Vikram Mehta',
      email: 'vikram.mehta@example.com',
      location: 'Bengaluru',
      experienceYears: 6,
      skills: ['Go', 'Kubernetes', 'Docker', 'PostgreSQL'],
      remoteOk: true,
      score: 0.88,
      breakdown: {
        semantic: 0.85,
        skills: 0.90,
        experience: 1.0,
        location: 1.0,
        education: 0.80,
        preferences: 0.75,
      },
      reasons: ['Covers all required skills (Go, Kubernetes)', 'Meets or exceeds 5 years required experience (6 years)'],
      gaps: ['Preferred skill missing: gRPC'],
      confidence: 0.92,
    },
  ],
};

describe('Job Detail Page - Explainable Candidate Ranking (Task 13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders job overview and navigates to AI Matches tab with explainable breakdown', async () => {
    const user = userEvent.setup();

    jest.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/matches')) {
        return { data: mockMatchesResponse };
      }
      return { data: mockJob };
    });

    render(<JobDetailPage />);

    // Check overview initially renders
    expect(await screen.findByText('Senior Distributed Systems Engineer')).toBeInTheDocument();
    expect(screen.getByText('Role Overview & Description')).toBeInTheDocument();

    // Switch to AI Matches tab
    const matchesTab = screen.getByTestId('tab-matches');
    await user.click(matchesTab);

    // Verify matches list loaded
    await waitFor(() => {
      expect(screen.getByText('Vikram Mehta')).toBeInTheDocument();
    });

    expect(screen.getByText('88% Fit')).toBeInTheDocument();
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
    expect(screen.getByText('Strengths:')).toBeInTheDocument();
    expect(screen.getByText('Covers all required skills (Go, Kubernetes)')).toBeInTheDocument();
    expect(screen.getByText('Gaps:')).toBeInTheDocument();
    expect(screen.getByText('Preferred skill missing: gRPC')).toBeInTheDocument();

    // Toggle "Why?" breakdown
    const whyButton = screen.getByTestId('toggle-why-cand-0001-uuid');
    await user.click(whyButton);

    // Verify 6-dimensional sub-scores are rendered
    expect(await screen.findByTestId('breakdown-details-cand-0001-uuid')).toBeInTheDocument();
    expect(screen.getByText('Semantic Fit')).toBeInTheDocument();
    expect(screen.getByText('Skills Alignment')).toBeInTheDocument();
    expect(screen.getByText('Experience Match')).toBeInTheDocument();
    expect(screen.getByText('Location Fit')).toBeInTheDocument();
    expect(screen.getByText('Education Level')).toBeInTheDocument();
    expect(screen.getByText('Role Preferences')).toBeInTheDocument();
  });
});
