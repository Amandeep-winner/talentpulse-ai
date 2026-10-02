import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KnowledgePage from '../app/knowledge/page';
import { api } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/knowledge',
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

const mockDocuments = [
  {
    id: 'doc-1',
    organizationId: 'org-1',
    title: 'Recruitment Policy 2026',
    category: 'policy',
    createdAt: new Date().toISOString(),
    chunkCount: 7,
  },
  {
    id: 'doc-2',
    organizationId: 'org-1',
    title: 'Engineering Job Template',
    category: 'template',
    createdAt: new Date().toISOString(),
    chunkCount: 5,
  },
];

const mockAskResponse = {
  answer: 'Engineers undergo a structured 90-day onboarding program [1].',
  citations: [
    {
      n: 1,
      documentId: 'doc-1',
      title: 'Recruitment Policy 2026',
      snippet: 'Engineers undergo a structured 90-day onboarding program with mentor pairs.',
      similarity: 0.82,
    },
  ],
};

describe('Knowledge Base & RAG Assistant UI (Task 14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Q&A assistant and performs cited question answering', async () => {
    const user = userEvent.setup();

    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockDocuments,
    });

    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      data: mockAskResponse,
    });

    render(<KnowledgePage />);

    // Check title renders
    expect(await screen.findByText('Knowledge Base & RAG Assistant')).toBeInTheDocument();
    expect(screen.getByTestId('rag-question-input')).toBeInTheDocument();

    // Type question and click ask
    const input = screen.getByTestId('rag-question-input');
    await user.type(input, 'What is the onboarding program?');

    const askButton = screen.getByTestId('rag-ask-button');
    await user.click(askButton);

    expect(postSpy).toHaveBeenCalledWith('/api/knowledge/ask', {
      question: 'What is the onboarding program?',
      category: undefined,
    });

    // Verify answer card and citation chip
    expect(await screen.findByTestId('rag-answer-card')).toBeInTheDocument();
    expect(screen.getByText('Engineers undergo a structured 90-day onboarding program [1].')).toBeInTheDocument();

    const citationChip = screen.getByTestId('citation-chip-1');
    expect(citationChip).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();

    // Click citation chip to view snippet
    await user.click(citationChip);

    expect(await screen.findByText(/Passage Snippet:/i)).toBeInTheDocument();
    expect(screen.getByText(/Engineers undergo a structured 90-day onboarding program with mentor pairs/i)).toBeInTheDocument();
  });

  it('navigates to Document Library and lists organization documents', async () => {
    const user = userEvent.setup();

    jest.spyOn(api, 'get').mockResolvedValue({
      data: mockDocuments,
    });

    render(<KnowledgePage />);

    // Click Document Library tab
    const libraryTab = screen.getByTestId('tab-library');
    await user.click(libraryTab);

    // Verify document cards render with chunk counts
    expect(await screen.findByText('Recruitment Policy 2026')).toBeInTheDocument();
    expect(screen.getByText('7 chunks embedded')).toBeInTheDocument();
    expect(screen.getByText('Engineering Job Template')).toBeInTheDocument();
    expect(screen.getByText('5 chunks embedded')).toBeInTheDocument();
  });
});
