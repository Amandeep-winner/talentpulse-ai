import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../app/(auth)/login/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/login',
}));

const mockLogin = jest.fn();
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    accessToken: null,
    isLoading: false,
    isAuthenticated: false,
    logout: jest.fn(),
    refresh: jest.fn(),
  }),
}));

describe('Login Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form elements correctly', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /sign in to talentpulse ai/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/create an organization/i)).toBeInTheDocument();
  });

  it('validates required fields on submit with empty form', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits successfully with valid credentials and redirects to dashboard', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/work email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'jane@acme.com');
    await user.type(passwordInput, 'Password123!');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'jane@acme.com',
        password: 'Password123!',
      });
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('populates demo admin credentials when clicking demo button', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const demoBtn = screen.getByText(/fill demo admin credentials/i);
    await user.click(demoBtn);

    const emailInput = screen.getByLabelText(/work email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    expect(emailInput.value).toBe('admin@acme.com');
    expect(passwordInput.value).toBe('AdminPass123!');
  });
});
