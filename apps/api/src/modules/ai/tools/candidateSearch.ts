import { knnCandidates } from '../../../lib/vector';
import { embedText } from '../../../lib/embeddings';

export interface CandidateSearchToolResult {
  answer: string;
  candidates: Array<{
    id: string;
    name: string;
    location: string;
    experienceYears: number;
    skills: string[];
    similarity: number;
  }>;
}

export async function searchCandidatesTool(
  orgId: string,
  question: string
): Promise<CandidateSearchToolResult> {
  const queryVector = await embedText(question);
  const candidates = await knnCandidates({
    orgId,
    queryVector,
    limit: 5,
  });

  if (candidates.length === 0) {
    return {
      answer: 'No matching candidates were found in your organization candidate directory.',
      candidates: [],
    };
  }

  const top = candidates.slice(0, 3);
  const listItems = top
    .map(
      (c, idx) =>
        `${idx + 1}. **${c.name}** (${c.location}, ${c.experienceYears} yrs exp) - Skills: ${c.skills.slice(0, 4).join(', ')} · *${Math.round(c.similarity * 100)}% Match*`
    )
    .join('\n');

  const answer = `Here are the top candidates matching your criteria from the database:\n\n${listItems}\n\nYou can view full candidate profiles in the Candidates directory.`;

  return {
    answer,
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      experienceYears: c.experienceYears,
      skills: c.skills,
      similarity: c.similarity,
    })),
  };
}
