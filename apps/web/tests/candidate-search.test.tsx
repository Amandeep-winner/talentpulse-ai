import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CandidatesPage from '../app/candidates/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/candidates',
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

const mockCandidates = [
  {
    id: 'cand-1',
    organizationId: 'org-1',
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    location: 'Bengaluru',
    remoteOk: true,
    experienceYears: 5,
    skills: ['Kubernetes', 'Docker'],
    createdAt: new Date().toISOString(),
  },
];

const mockSearchResults = {
  query: 'Kubernetes DevOps Engineer',
  total: 1,
  candidates: [
    {
      id: 'cand-1',
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      location: 'Bengaluru',
      remoteOk: true,
      experienceYears: 5,
      skills: ['Kubernetes', 'Docker'],
      distance: 0.08,
      similarity: 0.92,
    },
  ],
};

describe('Candidate Directory & Semantic Vector Search UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders directory and semantic search bar with suggestions', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockCandidates,
      meta: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
    });

    render(<CandidatesPage />);

    expect(screen.getByText('Candidate Directory')).toBeInTheDocument();
    expect(
      screen.getByText('Semantic Candidate Search (pgvector)'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Enter job requirements or natural language profile/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Kubernetes DevOps Engineer')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });
  });

  it('executes semantic search and renders similarity match chips', async () => {
    const apiGetSpy = jest.spyOn(api, 'get');
    apiGetSpy.mockImplementation((url: string) => {
      if (url.includes('/api/candidates/search')) {
        return Promise.resolve({ data: mockSearchResults });
      }
      return Promise.resolve({
        data: mockCandidates,
        meta: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
      });
    });

    render(<CandidatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    const semanticInput = screen.getByPlaceholderText(
      /Enter job requirements or natural language profile/i,
    );
    const searchButton = screen.getByRole('button', { name: /Vector Search/i });

    await userEvent.type(semanticInput, 'Kubernetes DevOps Engineer');
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/candidates/search?q=Kubernetes+DevOps+Engineer'),
      );
    });

    // Check similarity badge rendering
    await waitFor(() => {
      expect(screen.getByText('92% Match')).toBeInTheDocument();
      expect(screen.getByText(/sim: 0.920/i)).toBeInTheDocument();
    });

    // Check clear vector search button
    const clearButton = screen.getByRole('button', { name: /Clear Vector Search/i });
    expect(clearButton).toBeInTheDocument();
    await userEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.queryByText('92% Match')).not.toBeInTheDocument();
    });
  });
});
