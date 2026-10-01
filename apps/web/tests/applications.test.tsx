import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApplicationsPage from '../app/applications/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/applications',
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'recruiter-1',
      name: 'Recruiter User',
      email: 'recruiter@talentpulse.com',
      role: 'RECRUITER',
      organizationId: 'org-1',
    },
    accessToken: 'token',
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockApplications = [
  {
    id: 'app-1',
    organizationId: 'org-1',
    candidateId: 'cand-1',
    jobId: 'job-1',
    status: 'APPLIED',
    source: 'LinkedIn',
    appliedAt: new Date().toISOString(),
    candidate: {
      id: 'cand-1',
      name: 'Sarah Connor',
      email: 'sarah@cyberdyne.com',
      location: 'Los Angeles',
      experienceYears: 5,
      skills: ['react', 'typescript'],
    },
    job: {
      id: 'job-1',
      title: 'Senior Frontend Engineer',
      category: 'Engineering',
      location: 'Remote',
      status: 'OPEN',
    },
  },
];

const mockJobs = [
  {
    id: 'job-1',
    organizationId: 'org-1',
    title: 'Senior Frontend Engineer',
    description: 'Lead engineering frontend architecture',
    category: 'Engineering',
    location: 'Remote',
    remote: true,
    employmentType: 'FULL_TIME',
    minExperienceYears: 5,
    requiredSkills: ['react', 'typescript'],
    preferredSkills: [],
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  },
];

const mockCandidates = [
  {
    id: 'cand-1',
    organizationId: 'org-1',
    name: 'Sarah Connor',
    email: 'sarah@cyberdyne.com',
    location: 'Los Angeles',
    remoteOk: true,
    experienceYears: 5,
    skills: ['react', 'typescript'],
    createdAt: new Date().toISOString(),
  },
];

describe('Applications Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/api/applications')) {
        return Promise.resolve({ data: mockApplications });
      }
      if (url.includes('/api/jobs')) {
        return Promise.resolve({ data: mockJobs });
      }
      if (url.includes('/api/candidates')) {
        return Promise.resolve({ data: mockCandidates });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders pipeline stage columns and application card', async () => {
    render(<ApplicationsPage />);

    expect(screen.getByText('Applications Pipeline')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
      expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument();
    });

    // Check pipeline stage headers
    expect(screen.getAllByText('Screening').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Interview').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Offer').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Hired').length).toBeGreaterThanOrEqual(1);
  });

  it('allows advancing candidate from APPLIED to SCREENING', async () => {
    const patchSpy = jest.spyOn(api, 'patch').mockResolvedValue({
      data: {
        ...mockApplications[0],
        status: 'SCREENING',
      },
    });

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    const advanceBtn = screen.getByRole('button', { name: /Advance/i });
    expect(advanceBtn).toBeInTheDocument();

    await userEvent.click(advanceBtn);

    expect(patchSpy).toHaveBeenCalledWith('/api/applications/app-1', {
      status: 'SCREENING',
    });
  });

  it('toggles to list view', async () => {
    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    const listBtn = screen.getByRole('button', { name: /List/i });
    await userEvent.click(listBtn);

    // List view shows table headers
    expect(screen.getByText('Requisition')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
  });
});
