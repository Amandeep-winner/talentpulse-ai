import {
  PrismaClient,
  Role,
  JobStatus,
  EmploymentType,
  ApplicationStatus,
  CampaignStatus,
  PublisherType,
  EventType,
  ExperimentStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { embeddingService } from '../apps/api/src/modules/embeddings/embedding.service';
import { knowledgeService } from '../apps/api/src/modules/knowledge/knowledge.service';

const prisma = new PrismaClient();

// Seeded PRNG (mulberry32) with fixed seed 42
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(42);

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function randomChoices<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => rnd() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function randomInt(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round((min + rnd() * (max - min)) * factor) / factor;
}

const CITIES = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai'];

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Advaith', 'Aaryav', 'Dhruv', 'Kabir', 'Rishi', 'Kian',
  'Diya', 'Saanvi', 'Ananya', 'Aadhya', 'Pari', 'Kiara', 'Isha', 'Riya', 'Ananya', 'Myra',
  'Navya', 'Avani', 'Shanaya', 'Sara', 'Tara', 'Anika', 'Meera', 'Pooja', 'Neha', 'Priyanka',
  'Rohan', 'Vikram', 'Siddharth', 'Karthik', 'Suresh', 'Manish', 'Deepak', 'Gaurav', 'Naveen', 'Ankit',
  'Swati', 'Sneha', 'Tanvi', 'Kavya', 'Divya', 'Deepika', 'Shreya', 'Sunita', 'Aditi', 'Nandini',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Mehta', 'Joshi', 'Chopra', 'Malhotra',
  'Bhatia', 'Saxena', 'Kulkarni', 'Deshmukh', 'Menon', 'Pillai', 'Rao', 'Gowda', 'Kumar', 'Singh',
  'Chauhan', 'Gupta', 'Agarwal', 'Bansal', 'Mittal', 'Jain', 'Shah', 'Pandey', 'Mishra', 'Trivedi',
];

async function main() {
  console.log('⚠ Synthetic recruitment dataset generated for demonstration.');

  // 1. Load Skills taxonomy
  const taxonomyPath = path.resolve(__dirname, '../data/taxonomy/skills.json');
  const skillsData: Array<{ canonical: string; aliases: string[]; category: string }> = JSON.parse(
    fs.readFileSync(taxonomyPath, 'utf8')
  );

  const skillsByCategory: Record<string, string[]> = {};
  for (const s of skillsData) {
    if (!skillsByCategory[s.category]) {
      skillsByCategory[s.category] = [];
    }
    skillsByCategory[s.category].push(s.canonical);
  }

  // 2. Clean up existing demo organization if present (Idempotent seed)
  const existingOrg = await prisma.organization.findFirst({
    where: { name: 'Demo Talent Co' },
  });

  if (existingOrg) {
    console.log('Cleaning up existing Demo Talent Co organization data...');
    const orgId = existingOrg.id;
    await prisma.campaignSpend.deleteMany({ where: { organizationId: orgId } });
    await prisma.campaignEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.campaignPublisher.deleteMany({
      where: { campaign: { organizationId: orgId } },
    });
    await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
    await prisma.application.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateChunk.deleteMany({
      where: { candidate: { organizationId: orgId } },
    });
    await prisma.candidate.deleteMany({ where: { organizationId: orgId } });
    await prisma.job.deleteMany({ where: { organizationId: orgId } });
    await prisma.publisher.deleteMany({ where: { organizationId: orgId } });
    await prisma.knowledgeChunk.deleteMany({ where: { organizationId: orgId } });
    await prisma.knowledgeDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.experimentExposure.deleteMany({
      where: { experiment: { organizationId: orgId } },
    });
    await prisma.experiment.deleteMany({ where: { organizationId: orgId } });
    await prisma.apiKey.deleteMany({ where: { organizationId: orgId } });
    await prisma.refreshToken.deleteMany({
      where: { user: { organizationId: orgId } },
    });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    console.log('Previous demo data wiped.');
  }

  // 3. Create Demo Talent Co Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Demo Talent Co',
    },
  });
  console.log(`Created organization: ${org.name} (${org.id})`);

  // 4. Create Standard Demo Users
  const passwordSalt = 10;
  const adminPasswordHash = await bcrypt.hash('Admin123!', passwordSalt);
  const recruiterPasswordHash = await bcrypt.hash('Recruit123!', passwordSalt);
  const analystPasswordHash = await bcrypt.hash('Analyst123!', passwordSalt);

  await prisma.user.createMany({
    data: [
      {
        organizationId: org.id,
        email: 'admin@demo.com',
        name: 'Demo Admin',
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
      },
      {
        organizationId: org.id,
        email: 'recruiter@demo.com',
        name: 'Demo Recruiter',
        passwordHash: recruiterPasswordHash,
        role: Role.RECRUITER,
      },
      {
        organizationId: org.id,
        email: 'analyst@demo.com',
        name: 'Demo Analyst',
        passwordHash: analystPasswordHash,
        role: Role.ANALYST,
      },
    ],
  });
  console.log('Created standard demo users (admin, recruiter, analyst).');

  // 5. Ingest Knowledge Documents
  const knowledgeDir = path.resolve(__dirname, '../data/knowledge');
  if (fs.existsSync(knowledgeDir)) {
    const docFiles = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));
    let totalChunks = 0;
    for (const file of docFiles) {
      const fullPath = path.join(knowledgeDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const firstLine = content.split('\n')[0] || '';
      const title = firstLine.replace(/^#\s*/, '').trim() || file.replace('.md', '');
      let category = 'policy';
      if (file.includes('template')) category = 'template';
      else if (file.includes('playbook')) category = 'playbook';
      else if (file.includes('guide')) category = 'guide';

      const doc = await knowledgeService.ingestDocument({
        orgId: org.id,
        title,
        category,
        content,
      });
      totalChunks += doc.chunkCount;
    }
    console.log(`Ingested ${docFiles.length} knowledge documents (${totalChunks} chunks embedded) into database.`);
  }

  // 6. Create 5 Standard Publishers
  const publisherConfigs: Array<{ name: string; type: PublisherType }> = [
    { name: 'JobBoard Prime', type: PublisherType.JOB_BOARD },
    { name: 'SocialReach', type: PublisherType.SOCIAL },
    { name: 'SearchHire', type: PublisherType.SEARCH },
    { name: 'AggregatorX', type: PublisherType.AGGREGATOR },
    { name: 'ReferralNet', type: PublisherType.REFERRAL },
  ];

  const publishers = await Promise.all(
    publisherConfigs.map((p) =>
      prisma.publisher.create({
        data: {
          organizationId: org.id,
          name: p.name,
          type: p.type,
        },
      })
    )
  );
  console.log(`Created ${publishers.length} publishers.`);

  // 7. Create 30 Jobs across 5 Categories
  const jobDefinitions = [
    // Engineering (10)
    { title: 'Staff Backend Distributed Systems Engineer', category: 'engineering', minSalary: 3500000, maxSalary: 5500000, minExp: 7 },
    { title: 'Senior Fullstack Next.js Engineer', category: 'engineering', minSalary: 2400000, maxSalary: 3800000, minExp: 5 },
    { title: 'Lead DevOps & Kubernetes Architect', category: 'engineering', minSalary: 3000000, maxSalary: 4800000, minExp: 6 },
    { title: 'Senior Frontend React Engineer', category: 'engineering', minSalary: 2000000, maxSalary: 3200000, minExp: 4 },
    { title: 'Site Reliability Engineering Specialist', category: 'engineering', minSalary: 2200000, maxSalary: 3500000, minExp: 4 },
    { title: 'Microservices Backend Engineer (Go/Node)', category: 'engineering', minSalary: 1800000, maxSalary: 2800000, minExp: 3 },
    { title: 'Lead Security & AppSec Engineer', category: 'engineering', minSalary: 2800000, maxSalary: 4200000, minExp: 6 },
    { title: 'Senior Cloud Infrastructure Architect', category: 'engineering', minSalary: 3200000, maxSalary: 5000000, minExp: 7 },
    { title: 'QA Automation Lead (TypeScript/Playwright)', category: 'engineering', minSalary: 1600000, maxSalary: 2500000, minExp: 4 },
    { title: 'Junior Backend Software Engineer', category: 'engineering', minSalary: 900000, maxSalary: 1500000, minExp: 1 },

    // Data (6)
    { title: 'Principal Machine Learning Scientist', category: 'data', minSalary: 3800000, maxSalary: 6000000, minExp: 8 },
    { title: 'Senior Analytics Engineer (dbt & Snowflake)', category: 'data', minSalary: 2200000, maxSalary: 3400000, minExp: 4 },
    { title: 'Lead Data Platform Engineer (Spark/Kafka)', category: 'data', minSalary: 3000000, maxSalary: 4600000, minExp: 6 },
    { title: 'AI/LLM Application Engineer (RAG Systems)', category: 'data', minSalary: 2600000, maxSalary: 4000000, minExp: 4 },
    { title: 'Senior Business Intelligence Analyst', category: 'data', minSalary: 1600000, maxSalary: 2500000, minExp: 4 },
    { title: 'Data Scientist (Predictive Modeling)', category: 'data', minSalary: 2000000, maxSalary: 3200000, minExp: 3 },

    // Sales (5)
    { title: 'Enterprise Account Executive (SaaS)', category: 'sales', minSalary: 2200000, maxSalary: 3600000, minExp: 5 },
    { title: 'Director of Strategic Commercial Sales', category: 'sales', minSalary: 4000000, maxSalary: 6500000, minExp: 9 },
    { title: 'Senior Inbound Business Development Rep', category: 'sales', minSalary: 1000000, maxSalary: 1600000, minExp: 2 },
    { title: 'Key Account & Renewals Manager', category: 'sales', minSalary: 1800000, maxSalary: 2800000, minExp: 4 },
    { title: 'Outbound Enterprise SDR Lead', category: 'sales', minSalary: 1400000, maxSalary: 2200000, minExp: 3 },

    // Healthcare (5)
    { title: 'Clinical Operations Director', category: 'healthcare', minSalary: 2800000, maxSalary: 4500000, minExp: 7 },
    { title: 'Senior Health Informatics Specialist', category: 'healthcare', minSalary: 1800000, maxSalary: 2800000, minExp: 4 },
    { title: 'Lead Clinical Research Coordinator', category: 'healthcare', minSalary: 1600000, maxSalary: 2600000, minExp: 4 },
    { title: 'Healthcare Quality & Compliance Officer', category: 'healthcare', minSalary: 2000000, maxSalary: 3200000, minExp: 5 },
    { title: 'Telemedicine Patient Experience Specialist', category: 'healthcare', minSalary: 1200000, maxSalary: 1900000, minExp: 2 },

    // Operations (4)
    { title: 'VP of Global Supply Chain & Logistics', category: 'operations', minSalary: 3800000, maxSalary: 6200000, minExp: 9 },
    { title: 'Senior Strategic Procurement Manager', category: 'operations', minSalary: 2200000, maxSalary: 3400000, minExp: 5 },
    { title: 'Business Process Optimization Lead', category: 'operations', minSalary: 2000000, maxSalary: 3000000, minExp: 4 },
    { title: 'Technical Project Program Manager (Agile)', category: 'operations', minSalary: 2400000, maxSalary: 3600000, minExp: 5 },
  ];

  const jobs = [];
  for (let i = 0; i < jobDefinitions.length; i++) {
    const def = jobDefinitions[i];
    const categorySkills = skillsByCategory[def.category] || skillsByCategory['engineering'];
    const requiredSkills = randomChoices(categorySkills, 4);
    const preferredSkills = randomChoices(
      categorySkills.filter((s) => !requiredSkills.includes(s)),
      3
    );
    const isRemote = rnd() > 0.4;
    const location = isRemote ? 'Remote' : randomChoice(CITIES);

    let status = JobStatus.OPEN;
    if (i === 28) status = JobStatus.FILLED;
    else if (i === 29) status = JobStatus.PAUSED;

    const job = await prisma.job.create({
      data: {
        organizationId: org.id,
        title: def.title,
        description: `We are looking for an exceptional ${def.title} to join our high-performing team at Demo Talent Co. In this role, you will lead key strategic initiatives, drive technical and operational excellence, and collaborate with cross-functional partners to scale our organization.`,
        category: def.category,
        location,
        remote: isRemote,
        employmentType: EmploymentType.FULL_TIME,
        status,
        minExperienceYears: def.minExp,
        requiredSkills,
        preferredSkills,
        salaryMin: def.minSalary,
        salaryMax: def.maxSalary,
      },
    });
    jobs.push(job);
  }
  console.log(`Created ${jobs.length} jobs.`);

  // 8. Generate 400 Candidates
  console.log('Generating 400 deterministic candidates...');
  const candidatesData = [];
  const candidateCategories = ['engineering', 'data', 'sales', 'healthcare', 'operations', 'design'];
  const degrees = [
    'Bachelor of Technology in Computer Science',
    'Master of Science in Software Engineering',
    'Bachelor of Science in Information Technology',
    'Master of Business Administration (MBA)',
    'Bachelor of Science in Statistics and Mathematics',
    'Bachelor of Medicine, Bachelor of Surgery (MBBS)',
    'Bachelor of Science in Nursing',
    'Master of Technology in Artificial Intelligence',
    'Bachelor of Commerce in Accounting & Finance',
    'Bachelor of Design in Interaction & User Experience',
  ];

  for (let i = 1; i <= 400; i++) {
    const firstName = randomChoice(FIRST_NAMES);
    const lastName = randomChoice(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const email = `candidate.${i}.${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
    const cat = candidateCategories[i % candidateCategories.length];
    const catSkills = skillsByCategory[cat] || skillsByCategory['engineering'];
    const skills = randomChoices(catSkills, randomInt(4, 7));
    const experienceYears = randomFloat(1.0, 15.0, 1);
    const location = randomChoice(CITIES);
    const education = randomChoice(degrees);
    const remoteOk = rnd() > 0.3;
    const expectedSalary = Math.round(600000 + experienceYears * 180000 + (rnd() * 200000 - 100000));

    const resumeText = `Professional Profile for ${name}:
Experienced professional with ${experienceYears} years of hands-on expertise in ${cat}. Proven track record of architecting reliable solutions, driving team velocity, and delivering measurable business outcomes.
Core competencies include: ${skills.join(', ')}.
Education: ${education}.
Prior experience encompasses leading mission-critical initiatives, collaborating with cross-functional stakeholders, and continuously improving operational standards. Experienced in fast-paced production environments with stringent SLA and quality benchmarks. Recognized for proactive problem-solving, structured analytical reasoning, and exceptional teamwork.
Interested in roles based in ${location} or remote opportunities with competitive growth potential.`;

    candidatesData.push({
      organizationId: org.id,
      name,
      email,
      location,
      experienceYears,
      skills,
      education,
      certifications: [randomChoice(['AWS Certified Solutions Architect', 'PMP Certified', 'CKA Kubernetes Administrator', 'Six Sigma Green Belt', 'Certified Scrum Master'])],
      resumeText,
      preferredLocations: [location, 'Bengaluru', 'Remote'],
      preferredEmploymentTypes: [EmploymentType.FULL_TIME],
      remoteOk,
      expectedSalary,
    });
  }

  // Insert candidates in batches of 100
  const createdCandidates = [];
  for (let i = 0; i < candidatesData.length; i += 100) {
    const batch = candidatesData.slice(i, i + 100);
    const result = await Promise.all(
      batch.map((c) =>
        prisma.candidate.create({
          data: c,
        })
      )
    );
    createdCandidates.push(...result);
  }
  console.log(`Created ${createdCandidates.length} candidates.`);

  // 8b. Synchronously generate embeddings for all jobs and candidates (Task 11)
  console.log('Generating embeddings for all jobs and candidates...');
  for (const job of jobs) {
    await embeddingService.embedJob(job.id, org.id);
  }
  console.log(`Generated embeddings for ${jobs.length} jobs.`);

  for (const cand of createdCandidates) {
    await embeddingService.embedCandidate(cand.id, org.id);
  }
  console.log(`Generated embeddings and chunks for ${createdCandidates.length} candidates.`);

  // 9. Generate ~1,500 Applications with Valid State Machine Transitions
  console.log('Generating ~1,500 applications across candidates and jobs...');
  const publisherNames = ['JobBoard Prime', 'SocialReach', 'SearchHire', 'AggregatorX', 'ReferralNet'];
  const applicationRows: Array<{
    organizationId: string;
    candidateId: string;
    jobId: string;
    status: ApplicationStatus;
    source: string;
    appliedAt: Date;
  }> = [];

  const candidateJobPairs = new Set<string>();
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  // Let's create an application distribution where overall applications in last 30 days are ~18% lower than prior 30 days
  // Days 0-59 (prior 60 days): higher application volume
  // Days 60-89 (last 30 days): lower application volume
  for (const candidate of createdCandidates) {
    // 3 to 5 applications per candidate
    const appCount = randomInt(3, 5);
    for (let j = 0; j < appCount; j++) {
      const job = randomChoice(jobs);
      const pairKey = `${candidate.id}-${job.id}`;
      if (candidateJobPairs.has(pairKey)) continue;
      candidateJobPairs.add(pairKey);

      // Determine appliedAt timestamp
      // 65% chance in days 0-59, 35% chance in days 60-89
      let dayOffset: number;
      if (rnd() > 0.35) {
        dayOffset = randomInt(30, 89); // earlier period
      } else {
        dayOffset = randomInt(0, 29); // last 30 days
      }
      const appliedAt = new Date(now - dayOffset * 24 * 60 * 60 * 1000);

      // Status distribution based on state machine progression
      const statusRoll = rnd();
      let status = ApplicationStatus.APPLIED;
      if (statusRoll < 0.35) {
        status = ApplicationStatus.SCREENING;
      } else if (statusRoll < 0.60) {
        status = ApplicationStatus.INTERVIEW;
      } else if (statusRoll < 0.72) {
        status = ApplicationStatus.OFFER;
      } else if (statusRoll < 0.82) {
        status = ApplicationStatus.HIRED;
      } else if (statusRoll < 0.94) {
        status = ApplicationStatus.REJECTED;
      } else {
        status = ApplicationStatus.WITHDRAWN;
      }

      applicationRows.push({
        organizationId: org.id,
        candidateId: candidate.id,
        jobId: job.id,
        status,
        source: randomChoice(publisherNames),
        appliedAt,
      });

      if (applicationRows.length >= 1500) break;
    }
    if (applicationRows.length >= 1500) break;
  }

  // Insert applications in batches of 200
  for (let i = 0; i < applicationRows.length; i += 200) {
    const batch = applicationRows.slice(i, i + 200);
    await prisma.application.createMany({
      data: batch,
    });
  }
  console.log(`Created ${applicationRows.length} applications.`);

  // 10. Create 12 Campaigns across Jobs over 90 Days
  console.log('Creating 12 campaigns with publisher allocations...');
  const campaignJobs = jobs.slice(0, 12);
  const createdCampaigns = [];

  for (let i = 0; i < campaignJobs.length; i++) {
    const job = campaignJobs[i];
    const budget = randomInt(8000, 25000);
    const campaign = await prisma.campaign.create({
      data: {
        organizationId: org.id,
        jobId: job.id,
        name: `Q3-Hiring: ${job.title.slice(0, 32)}`,
        budget,
        status: CampaignStatus.ACTIVE,
        startDate: new Date(now - ninetyDaysMs),
        endDate: new Date(now + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Create CampaignPublisher allocations summing to 100%
    // Publisher allocations: JobBoard Prime: 30%, SocialReach: 25%, SearchHire: 20%, AggregatorX: 15%, ReferralNet: 10%
    const allocations = [
      { publisherId: publishers[0].id, allocationPct: 30.0, bidCpc: 2.2, dailyBudget: (budget / 90) * 0.3 },
      { publisherId: publishers[1].id, allocationPct: 25.0, bidCpc: 1.2, dailyBudget: (budget / 90) * 0.25 },
      { publisherId: publishers[2].id, allocationPct: 20.0, bidCpc: 3.5, dailyBudget: (budget / 90) * 0.2 },
      { publisherId: publishers[3].id, allocationPct: 15.0, bidCpc: 0.9, dailyBudget: (budget / 90) * 0.15 },
      { publisherId: publishers[4].id, allocationPct: 10.0, bidCpc: 1.5, dailyBudget: (budget / 90) * 0.1 },
    ];

    for (const alloc of allocations) {
      await prisma.campaignPublisher.create({
        data: {
          campaignId: campaign.id,
          publisherId: alloc.publisherId,
          allocationPct: alloc.allocationPct,
          bidCpc: alloc.bidCpc,
          dailyBudget: Math.round(alloc.dailyBudget * 100) / 100,
        },
      });
    }

    createdCampaigns.push(campaign);
  }
  console.log(`Created ${createdCampaigns.length} campaigns with 5 publisher allocations each.`);

  // 11. Generate 90 Days of Aggregated Events and Spends with Engineered Scenarios
  console.log('Generating 90 days of deterministic events and spends with engineered scenarios...');
  const eventsToInsert: Array<{
    eventId: string;
    organizationId: string;
    campaignId: string;
    publisherId: string;
    eventType: EventType;
    quantity: number;
    qualifiedQuantity: number;
    timestamp: Date;
  }> = [];

  const spendsToInsert: Array<{
    organizationId: string;
    campaignId: string;
    publisherId: string;
    date: Date;
    amount: number;
  }> = [];

  // 90 days: day 0 = 89 days ago, day 89 = today
  for (let day = 0; day < 90; day++) {
    const dayDate = new Date(now - (89 - day) * 24 * 60 * 60 * 1000);
    const dayOfWeek = dayDate.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekendMultiplier = isWeekend ? 0.65 : 1.0;

    // Last 30 days is days 60 to 89
    // Macro factor: applications overall drop ~18% in last 30 days (days 60..89)
    const isLast30Days = day >= 60;
    const macroAppMultiplier = isLast30Days ? 0.82 : 1.0;

    // Engineered scenario 1: Publisher B (SocialReach) degrades ~35% over last 21 days (days 69..89)
    const isLast21Days = day >= 69;

    const dateStr = dayDate.toISOString().slice(0, 10);

    for (const campaign of createdCampaigns) {
      for (const publisher of publishers) {
        let baseImpressions = 0;
        let baseCTR = 0.025;
        let baseAppRate = 0.08;
        let qualifiedFraction = 0.65;
        let interviewRate = 0.15;
        let hireRate = 0.03;
        let cpc = 2.0;

        if (publisher.name === 'JobBoard Prime') {
          baseImpressions = 500;
          baseCTR = 0.028;
          baseAppRate = 0.085;
          qualifiedFraction = 0.70;
          interviewRate = 0.16;
          hireRate = 0.032;
          cpc = 2.20;
        } else if (publisher.name === 'SocialReach') {
          baseImpressions = 750;
          baseCTR = 0.038;
          baseAppRate = 0.088;
          qualifiedFraction = 0.60;
          interviewRate = 0.12;
          hireRate = 0.022;
          cpc = 1.25;

          // Publisher B degradation over last 21 days
          if (isLast21Days) {
            baseAppRate *= 0.65; // ~35% drop in application rate
            qualifiedFraction *= 0.58; // quality degrades significantly
            cpc *= 1.15; // CPA rises sharply!
          }
        } else if (publisher.name === 'SearchHire') {
          baseImpressions = 320;
          baseCTR = 0.042;
          baseAppRate = 0.125;
          qualifiedFraction = 0.78;
          interviewRate = 0.22;
          hireRate = 0.045;
          cpc = 3.40;
        } else if (publisher.name === 'AggregatorX') {
          baseImpressions = 650;
          baseCTR = 0.020;
          baseAppRate = 0.052;
          qualifiedFraction = 0.52;
          interviewRate = 0.10;
          hireRate = 0.020;
          cpc = 0.90;

          // Publisher D steadily improves over last 30 days
          if (isLast30Days) {
            const improvementProgress = (day - 60) / 29; // 0.0 to 1.0
            baseAppRate *= 1.0 + 0.50 * improvementProgress; // steadily ramps up +50%
            qualifiedFraction *= 1.0 + 0.35 * improvementProgress;
          }
        } else if (publisher.name === 'ReferralNet') {
          baseImpressions = 120;
          baseCTR = 0.055;
          baseAppRate = 0.240;
          qualifiedFraction = 0.92;
          interviewRate = 0.38;
          hireRate = 0.120;
          cpc = 1.50;
        }

        // Apply noise & weekend multiplier
        const noise = 0.85 + rnd() * 0.3; // 0.85 to 1.15
        const impressions = Math.max(10, Math.round(baseImpressions * weekendMultiplier * noise));
        const clicks = Math.max(1, Math.round(impressions * baseCTR * (0.9 + rnd() * 0.2)));
        const appStarts = Math.max(1, Math.round(clicks * 0.45));
        const applications = Math.max(
          0,
          Math.round(clicks * baseAppRate * macroAppMultiplier * (0.9 + rnd() * 0.2))
        );
        const qualifiedApplications = Math.min(
          applications,
          Math.round(applications * qualifiedFraction)
        );
        const interviews = Math.min(
          applications,
          Math.round(applications * interviewRate * (0.8 + rnd() * 0.4))
        );
        const hires = Math.min(
          interviews,
          Math.round(interviews * hireRate * 5 * (0.7 + rnd() * 0.6))
        );

        // Daily spend consistent with clicks * CPC
        const dailySpend = Math.round(clicks * cpc * 100) / 100;

        const pubSlug = publisher.name.toLowerCase().replace(/\s+/g, '');
        const campPrefix = campaign.id.slice(0, 8);

        // Events
        eventsToInsert.push({
          eventId: `seed-${campPrefix}-${pubSlug}-imp-${dateStr}`,
          organizationId: org.id,
          campaignId: campaign.id,
          publisherId: publisher.id,
          eventType: EventType.IMPRESSION,
          quantity: impressions,
          qualifiedQuantity: 0,
          timestamp: dayDate,
        });

        eventsToInsert.push({
          eventId: `seed-${campPrefix}-${pubSlug}-clk-${dateStr}`,
          organizationId: org.id,
          campaignId: campaign.id,
          publisherId: publisher.id,
          eventType: EventType.CLICK,
          quantity: clicks,
          qualifiedQuantity: 0,
          timestamp: dayDate,
        });

        eventsToInsert.push({
          eventId: `seed-${campPrefix}-${pubSlug}-appstart-${dateStr}`,
          organizationId: org.id,
          campaignId: campaign.id,
          publisherId: publisher.id,
          eventType: EventType.APPLICATION_START,
          quantity: appStarts,
          qualifiedQuantity: 0,
          timestamp: dayDate,
        });

        if (applications > 0) {
          eventsToInsert.push({
            eventId: `seed-${campPrefix}-${pubSlug}-app-${dateStr}`,
            organizationId: org.id,
            campaignId: campaign.id,
            publisherId: publisher.id,
            eventType: EventType.APPLICATION,
            quantity: applications,
            qualifiedQuantity: qualifiedApplications,
            timestamp: dayDate,
          });
        }

        if (interviews > 0) {
          eventsToInsert.push({
            eventId: `seed-${campPrefix}-${pubSlug}-int-${dateStr}`,
            organizationId: org.id,
            campaignId: campaign.id,
            publisherId: publisher.id,
            eventType: EventType.INTERVIEW,
            quantity: interviews,
            qualifiedQuantity: 0,
            timestamp: dayDate,
          });
        }

        if (hires > 0) {
          eventsToInsert.push({
            eventId: `seed-${campPrefix}-${pubSlug}-hire-${dateStr}`,
            organizationId: org.id,
            campaignId: campaign.id,
            publisherId: publisher.id,
            eventType: EventType.HIRE,
            quantity: hires,
            qualifiedQuantity: 0,
            timestamp: dayDate,
          });
        }

        // Daily Spend
        spendsToInsert.push({
          organizationId: org.id,
          campaignId: campaign.id,
          publisherId: publisher.id,
          date: dayDate,
          amount: dailySpend,
        });
      }
    }
  }

  // Insert events in batches of 500
  console.log(`Inserting ${eventsToInsert.length} campaign events...`);
  for (let i = 0; i < eventsToInsert.length; i += 500) {
    const chunk = eventsToInsert.slice(i, i + 500);
    await prisma.campaignEvent.createMany({
      data: chunk,
    });
  }

  // Insert spends in batches of 500
  console.log(`Inserting ${spendsToInsert.length} campaign spend records...`);
  for (let i = 0; i < spendsToInsert.length; i += 500) {
    const chunk = spendsToInsert.slice(i, i + 500);
    await prisma.campaignSpend.createMany({
      data: chunk,
    });
  }

  // 12. Create 1 Seeded Running Experiment
  console.log('Creating running experiment and exposures...');
  const experiment = await prisma.experiment.create({
    data: {
      organizationId: org.id,
      name: 'Landing Page Headline Optimization - AI Focus',
      hypothesis:
        'Framing technical job descriptions with AI capabilities increases qualified application completion rate by 15%.',
      status: ExperimentStatus.RUNNING,
      variants: [
        { key: 'control', weight: 50 },
        { key: 'ai_empowered', weight: 50 },
      ],
    },
  });

  const exposures = [];
  for (let i = 1; i <= 60; i++) {
    const variant = i % 2 === 0 ? 'control' : 'ai_empowered';
    const converted = variant === 'ai_empowered' ? rnd() < 0.28 : rnd() < 0.18;
    exposures.push({
      experimentId: experiment.id,
      subjectKey: `subject-exp-${i}`,
      variant,
      converted,
    });
  }

  await prisma.experimentExposure.createMany({
    data: exposures,
  });
  console.log(`Created experiment with ${exposures.length} exposures.`);

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
