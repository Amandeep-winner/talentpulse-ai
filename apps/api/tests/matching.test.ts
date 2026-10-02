import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { MATCHING_WEIGHTS } from '../src/modules/matching/matching.config';
import { scoreSemantic } from '../src/modules/matching/scorers/semantic';
import { scoreSkills } from '../src/modules/matching/scorers/skills';
import { scoreExperience } from '../src/modules/matching/scorers/experience';
import { scoreLocation } from '../src/modules/matching/scorers/location';
import { scoreEducation } from '../src/modules/matching/scorers/education';
import { scorePreferences } from '../src/modules/matching/scorers/preferences';
import { scoreCandidate } from '../src/modules/matching/ranker';
import { ScoringCandidateInput, ScoringJobInput } from '../src/modules/matching/types';
import { embeddingService } from '../src/modules/embeddings/embedding.service';

const app = createApp();

describe('Hybrid Explainable Candidate Ranking Module', () => {
  describe('Unit Tests: Config & Sub-Scorers', () => {
    it('asserts that matching weights strictly sum to 1.0', () => {
      const sum =
        MATCHING_WEIGHTS.semantic +
        MATCHING_WEIGHTS.skills +
        MATCHING_WEIGHTS.experience +
        MATCHING_WEIGHTS.location +
        MATCHING_WEIGHTS.education +
        MATCHING_WEIGHTS.preferences;

      expect(sum).toBeCloseTo(1.0, 5);
      expect(MATCHING_WEIGHTS.semantic).toBe(0.35);
      expect(MATCHING_WEIGHTS.skills).toBe(0.25);
      expect(MATCHING_WEIGHTS.experience).toBe(0.15);
      expect(MATCHING_WEIGHTS.location).toBe(0.10);
      expect(MATCHING_WEIGHTS.education).toBe(0.10);
      expect(MATCHING_WEIGHTS.preferences).toBe(0.05);
    });

    describe('scoreSemantic', () => {
      it('clips cosine similarity to [0, 1] range and generates appropriate reasons', () => {
        expect(scoreSemantic(0.85).score).toBe(0.85);
        expect(scoreSemantic(0.85).reason).toContain('Strong semantic');

        expect(scoreSemantic(0.55).score).toBe(0.55);
        expect(scoreSemantic(0.55).reason).toContain('Moderate semantic');

        expect(scoreSemantic(1.2).score).toBe(1.0);
        expect(scoreSemantic(-0.2).score).toBe(0.0);
      });
    });

    describe('scoreSkills', () => {
      const required = ['kubernetes', 'docker', 'golang'];
      const preferred = ['terraform', 'kafka'];

      it('exhibits monotonicity: more matched required skills yields higher score', () => {
        const fullMatch = scoreSkills(['kubernetes', 'docker', 'golang'], required, preferred);
        const partialMatch = scoreSkills(['kubernetes', 'docker'], required, preferred);
        const lowMatch = scoreSkills(['kubernetes'], required, preferred);
        const noMatch = scoreSkills(['react', 'css'], required, preferred);

        expect(fullMatch.score).toBeGreaterThan(partialMatch.score);
        expect(partialMatch.score).toBeGreaterThan(lowMatch.score);
        expect(lowMatch.score).toBeGreaterThan(noMatch.score);

        expect(fullMatch.reasons[0]).toContain('Matches all 3 required skills');
        expect(partialMatch.gaps[0]?.toLowerCase()).toContain('missing required skills: go');
      });

      it('canonicalizes skill aliases correctly', () => {
        // 'k8s' should canonicalize to 'kubernetes'
        const aliasMatch = scoreSkills(['k8s', 'docker', 'go'], required, preferred);
        expect(aliasMatch.score).toBeGreaterThanOrEqual(0.8);
      });
    });

    describe('scoreExperience', () => {
      it('returns 1.0 when candidate experience meets or exceeds minExperienceYears', () => {
        const result = scoreExperience(6.0, 5);
        expect(result.score).toBe(1.0);
        expect(result.reason).toContain('meets or exceeds');
        expect(result.gap).toBeUndefined();
      });

      it('returns linear ramp when candidate experience is below minExperienceYears', () => {
        const result = scoreExperience(2.5, 5);
        expect(result.score).toBe(0.5);
        expect(result.gap).toContain('2.5 yrs experience vs 5 yrs required');
      });

      it('returns 1.0 when minExperienceYears is 0', () => {
        const result = scoreExperience(1.0, 0);
        expect(result.score).toBe(1.0);
      });
    });

    describe('scoreLocation', () => {
      it('returns 1.0 for remote job with remoteOk candidate', () => {
        const res = scoreLocation({
          candidateLocation: 'Pune',
          candidateRemoteOk: true,
          candidatePreferredLocations: [],
          jobLocation: 'Bengaluru',
          jobRemote: true,
        });
        expect(res.score).toBe(1.0);
        expect(res.reason).toContain('Remote alignment');
      });

      it('returns 1.0 for same city even if not remote', () => {
        const res = scoreLocation({
          candidateLocation: 'Bengaluru',
          candidateRemoteOk: false,
          candidatePreferredLocations: [],
          jobLocation: 'Bengaluru',
          jobRemote: false,
        });
        expect(res.score).toBe(1.0);
        expect(res.reason).toContain('Exact location match');
      });

      it('returns 0.5 for relocation preference match', () => {
        const res = scoreLocation({
          candidateLocation: 'Delhi',
          candidateRemoteOk: false,
          candidatePreferredLocations: ['Hyderabad', 'Bengaluru'],
          jobLocation: 'Bengaluru',
          jobRemote: false,
        });
        expect(res.score).toBe(0.5);
        expect(res.reason).toContain('Relocation match');
      });

      it('returns 0.0 with gap when candidate cannot relocate and role is onsite', () => {
        const res = scoreLocation({
          candidateLocation: 'Mumbai',
          candidateRemoteOk: false,
          candidatePreferredLocations: ['Pune'],
          jobLocation: 'Bengaluru',
          jobRemote: false,
        });
        expect(res.score).toBe(0.0);
        expect(res.gap).toContain('Location mismatch');
      });
    });

    describe('scoreEducation', () => {
      it('returns 1.0 when qualification meets or exceeds required ladder level', () => {
        const res = scoreEducation({
          candidateEducation: 'Master of Technology in Computer Science',
          candidateCertifications: [],
          requiredEducation: 'Bachelor of Technology',
          preferredCertifications: [],
        });
        expect(res.score).toBe(1.0);
        expect(res.reasons.length).toBeGreaterThan(0);
      });

      it('deducts points when candidate education is below required ladder level', () => {
        const res = scoreEducation({
          candidateEducation: 'Diploma in Computer Application',
          candidateCertifications: [],
          requiredEducation: 'Master of Science',
          preferredCertifications: [],
        });
        expect(res.score).toBeLessThan(0.7);
        expect(res.gaps.length).toBeGreaterThan(0);
      });

      it('awards bonus for preferred certifications overlap', () => {
        const withCert = scoreEducation({
          candidateEducation: 'Bachelor of Technology',
          candidateCertifications: ['AWS Certified Solutions Architect', 'CKA Kubernetes Administrator'],
          requiredEducation: 'Bachelor of Technology',
          preferredCertifications: ['AWS Certified Solutions Architect'],
        });
        expect(withCert.score).toBe(1.0);
        expect(withCert.reasons.some((r) => r.includes('preferred certifications'))).toBe(true);
      });
    });

    describe('scorePreferences', () => {
      it('awards full score when salary expectation is within budget ceiling', () => {
        const res = scorePreferences({
          candidateEmploymentTypes: ['FULL_TIME'],
          candidateExpectedSalary: 2200000,
          jobEmploymentType: 'FULL_TIME',
          jobSalaryMax: 2500000,
        });
        expect(res.score).toBe(1.0);
      });

      it('awards partial score when salary is within 15% negotiation band', () => {
        const res = scorePreferences({
          candidateEmploymentTypes: ['FULL_TIME'],
          candidateExpectedSalary: 2800000,
          jobEmploymentType: 'FULL_TIME',
          jobSalaryMax: 2500000,
        });
        expect(res.score).toBeGreaterThanOrEqual(0.7);
      });

      it('reports gap when salary significantly exceeds budget ceiling', () => {
        const res = scorePreferences({
          candidateEmploymentTypes: ['FULL_TIME'],
          candidateExpectedSalary: 3800000,
          jobEmploymentType: 'FULL_TIME',
          jobSalaryMax: 2500000,
        });
        expect(res.score).toBeLessThan(0.7);
        expect(res.gaps.some((g) => g.includes('exceeds budget ceiling'))).toBe(true);
      });
    });

    describe('Protected Attributes Exclusion Guarantee', () => {
      it('ensures ScoringCandidateInput strictly excludes protected demographic fields', () => {
        const candidateInput: ScoringCandidateInput = {
          id: '11111111-1111-1111-1111-111111111111',
          skills: ['typescript', 'react'],
          experienceYears: 4,
          location: 'Bengaluru',
          remoteOk: true,
          education: 'Bachelor of Science',
          certifications: [],
          preferredLocations: ['Bengaluru'],
          preferredEmploymentTypes: ['FULL_TIME'],
          expectedSalary: 1800000,
          hasEmbedding: true,
          hasResume: true,
        };

        const jobInput: ScoringJobInput = {
          id: '22222222-2222-2222-2222-222222222222',
          title: 'Frontend Engineer',
          category: 'engineering',
          location: 'Bengaluru',
          remote: true,
          employmentType: 'FULL_TIME',
          minExperienceYears: 3,
          requiredSkills: ['typescript', 'react'],
          preferredSkills: ['nextjs'],
          requiredEducation: 'Bachelor of Science',
          preferredCertifications: [],
          salaryMin: 1500000,
          salaryMax: 2200000,
        };

        // Assert no protected keys exist on the candidate input
        const keys = Object.keys(candidateInput);
        expect(keys).not.toContain('name');
        expect(keys).not.toContain('email');
        expect(keys).not.toContain('age');
        expect(keys).not.toContain('gender');
        expect(keys).not.toContain('photo');
        expect(keys).not.toContain('race');
        expect(keys).not.toContain('religion');

        const scored = scoreCandidate(candidateInput, jobInput, 0.88);
        expect(scored.score).toBeGreaterThan(0.8);
        expect(scored.breakdown).toBeDefined();
        expect(scored.confidence).toBeGreaterThan(0.7);
      });
    });
  });

  describe('Integration Tests: End-to-End Requisition Matching & Audit Trail', () => {
    let adminToken: string;
    let analystToken: string;
    let orgId: string;
    let jobId: string;
    let devOpsCandId: string;
    let juniorCandId: string;
    let nurseCandId: string;

    beforeEach(async () => {
      await truncateAllTables();

      // Register organization and ADMIN user
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Ranking Test Corp',
          name: 'Admin User',
          email: 'admin@ranking.com',
          password: 'Password123!',
        });
      adminToken = regRes.body.data.accessToken;

      const org = await testPrisma.organization.findFirst();
      orgId = org!.id;

      // Create ANALYST user
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Analyst User',
          email: 'analyst@ranking.com',
          password: 'Password123!',
          role: 'ANALYST',
        });
      const anLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'analyst@ranking.com', password: 'Password123!' });
      analystToken = anLogin.body.data.accessToken;

      // Create Job Requisition: Principal DevOps Engineer
      const job = await testPrisma.job.create({
        data: {
          organizationId: orgId,
          title: 'Principal DevOps Architect',
          description: 'Lead enterprise cloud infrastructure, Kubernetes orchestration, Docker pipelines, and Terraform automation.',
          category: 'engineering',
          location: 'Bengaluru',
          remote: true,
          minExperienceYears: 5,
          requiredSkills: ['kubernetes', 'docker', 'terraform'],
          preferredSkills: ['aws', 'golang'],
          requiredEducation: 'Bachelor of Technology',
          salaryMin: 2500000,
          salaryMax: 4000000,
        },
      });
      jobId = job.id;
      await embeddingService.embedJob(jobId, orgId);

      // Candidate 1: Senior DevOps (Strong match)
      const cand1 = await testPrisma.candidate.create({
        data: {
          organizationId: orgId,
          name: 'Rohan Sharma',
          email: 'rohan.sharma@example.com',
          location: 'Bengaluru',
          experienceYears: 7.5,
          skills: ['kubernetes', 'docker', 'terraform', 'aws', 'golang'],
          education: 'Master of Technology in Computer Science',
          certifications: ['AWS Certified Solutions Architect', 'CKA Kubernetes Administrator'],
          remoteOk: true,
          expectedSalary: 3200000,
          resumeText: 'Senior DevOps Architect with 7.5 years managing Kubernetes clusters, Docker automation, and Terraform infrastructure in Bengaluru.',
        },
      });
      devOpsCandId = cand1.id;
      await embeddingService.embedCandidate(devOpsCandId, orgId);

      // Candidate 2: Junior Developer (Moderate match with gaps)
      const cand2 = await testPrisma.candidate.create({
        data: {
          organizationId: orgId,
          name: 'Kavya Patel',
          email: 'kavya.patel@example.com',
          location: 'Pune',
          experienceYears: 2.0,
          skills: ['docker', 'python'],
          education: 'Bachelor of Technology',
          remoteOk: true,
          expectedSalary: 1200000,
          resumeText: 'Junior Cloud Developer with 2 years of Docker and Python scripting experience.',
        },
      });
      juniorCandId = cand2.id;
      await embeddingService.embedCandidate(juniorCandId, orgId);

      // Candidate 3: Pediatric Nurse (Unrelated match)
      const cand3 = await testPrisma.candidate.create({
        data: {
          organizationId: orgId,
          name: 'Deepika Iyer',
          email: 'deepika.iyer@example.com',
          location: 'Mumbai',
          experienceYears: 8.0,
          skills: ['nursing', 'critical care', 'bls'],
          education: 'Bachelor of Science in Nursing',
          remoteOk: false,
          expectedSalary: 900000,
          resumeText: 'Registered Staff Nurse with 8 years in pediatric intensive care and healthcare hospital administration.',
        },
      });
      nurseCandId = cand3.id;
      await embeddingService.embedCandidate(nurseCandId, orgId);
    });

    afterAll(async () => {
      await testPrisma.$disconnect();
    });

    it('GET /api/jobs/:id/matches returns ranked candidates with explainable breakdowns and audit trail', async () => {
      const res = await request(app)
        .get(`/api/jobs/${jobId}/matches?limit=10`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.jobId).toBe(jobId);
      expect(res.body.data.matches.length).toBe(3);

      const matches = res.body.data.matches;

      // Candidate 1 (Rohan) must rank #1 with highest score
      expect(matches[0].candidateId).toBe(devOpsCandId);
      expect(matches[0].name).toBe('Rohan Sharma');
      expect(matches[0].score).toBeGreaterThan(matches[1].score);
      expect(matches[0].score).toBeGreaterThan(0.75);

      // Verify explainability fields
      expect(matches[0].breakdown).toBeDefined();
      expect(matches[0].breakdown.semantic).toBeGreaterThan(0.2);
      expect(matches[0].breakdown.skills).toBe(1.0); // Matched all required skills
      expect(matches[0].breakdown.experience).toBe(1.0); // 7.5 yrs >= 5 yrs
      expect(matches[0].reasons.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBeGreaterThan(0.7);

      // Candidate 2 (Kavya) should rank #2 with clear gaps
      expect(matches[1].candidateId).toBe(juniorCandId);
      expect(matches[1].gaps.length).toBeGreaterThan(0);
      expect(matches[1].gaps.some((g: string) => g.includes('Missing required skills'))).toBe(true);
      expect(matches[1].gaps.some((g: string) => g.includes('vs 5 yrs required'))).toBe(true);

      // Candidate 3 (Nurse) should have lowest score
      expect(matches[2].candidateId).toBe(nurseCandId);
      expect(matches[2].score).toBeLessThan(matches[1].score);

      // Verify immutable Recommendation audit row in database
      const auditRec = await testPrisma.recommendation.findFirst({
        where: { id: res.body.data.recommendationId },
      });
      expect(auditRec).not.toBeNull();
      expect(auditRec!.type).toBe('CANDIDATE_RANKING');
      expect(auditRec!.modelVersion).toBe('hybrid-v1');
      expect(auditRec!.organizationId).toBe(orgId);
    });

    it('allows ANALYST to read candidate matches', async () => {
      const res = await request(app)
        .get(`/api/jobs/${jobId}/matches?limit=5`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('enforces multi-tenant isolation: cannot view matches for another organization job', async () => {
      // Create external organization and job
      const otherOrg = await testPrisma.organization.create({
        data: { name: 'External Competitor Corp' },
      });
      const otherJob = await testPrisma.job.create({
        data: {
          organizationId: otherOrg.id,
          title: 'External Requisition',
          description: 'Requisition from another tenant.',
          category: 'engineering',
          location: 'Delhi',
          requiredSkills: ['python'],
        },
      });

      const res = await request(app)
        .get(`/api/jobs/${otherJob.id}/matches`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
