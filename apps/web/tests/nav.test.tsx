import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

let mockCurrentUser: {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'RECRUITER' | 'ANALYST';
  organizationId: string;
} | null = null;

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    accessToken: 'test-token',
    isLoading: false,
    isAuthenticated: !!mockCurrentUser,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
  }),
}));

describe('Layout and Navigation', () => {
  beforeEach(() => {
    mockCurrentUser = null;
  });

  it('renders sidebar navigation links correctly for default admin', () => {
    render(<Sidebar />);

    expect(screen.getByText('TalentPulse AI')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('Candidates')).toBeInTheDocument();
    expect(screen.getByText('Applications')).toBeInTheDocument();
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('AI Analyst')).toBeInTheDocument();
    expect(screen.getByText('Optimize')).toBeInTheDocument();
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    expect(screen.getByText('Knowledge')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Audit')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides admin-only navigation links for ANALYST role', () => {
    mockCurrentUser = {
      id: '123',
      name: 'Analyst User',
      email: 'analyst@example.com',
      role: 'ANALYST',
      organizationId: 'org-1',
    };

    render(<Sidebar />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.queryByText('Integrations')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Optimize')).not.toBeInTheDocument();
    expect(screen.getByText('Analyst User')).toBeInTheDocument();
    expect(screen.getByText('ANALYST')).toBeInTheDocument();
  });

  it('renders topbar with persistent synthetic demo data badge', () => {
    render(<Topbar />);

    expect(screen.getByText('Synthetic demo data')).toBeInTheDocument();
  });
});
