import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobsPage from '../app/jobs/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/jobs',
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

const mockJobs = [
  {
    id: 'job-1',
    organizationId: 'org-1',
    title: 'Senior Software Architect',
    description: 'Lead engineering systems design.',
    category: 'Engineering',
    location: 'Bengaluru',
    remote: true,
    employmentType: 'FULL_TIME',
    salaryMin: 3000000,
    salaryMax: 4500000,
    minExperienceYears: 6,
    requiredSkills: ['Python', 'Kubernetes'],
    preferredSkills: ['PostgreSQL'],
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  },
];

describe('Jobs Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockJobs,
      meta: {
        page: 1,
        pageSize: 15,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('renders jobs list and table correctly', async () => {
    render(<JobsPage />);

    expect(screen.getByText('Job Requisitions')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Senior Software Architect')).toBeInTheDocument();
      expect(screen.getByText(/Bengaluru/)).toBeInTheDocument();
      expect(screen.getByText('Python')).toBeInTheDocument();
      expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    });
  });

  it('opens Create Requisition modal when clicking create button', async () => {
    const user = userEvent.setup();
    render(<JobsPage />);

    const createBtn = screen.getByRole('button', { name: /create requisition/i });
    await user.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Create New Job Requisition')).toBeInTheDocument();
      expect(screen.getByLabelText(/job title/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /publish requisition/i })).toBeInTheDocument();
    });
  });
});
