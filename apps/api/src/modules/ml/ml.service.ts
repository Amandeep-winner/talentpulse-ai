import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { mlClient, MlServiceError } from './ml.client';
import {
  MlModelName,
  PredictApplicationRequest,
  PredictApplicationResponse,
  PredictFillResponse,
  MlRiskBucket,
  MlTopFactor,
} from '@talentpulse/shared';

export class MlService {
  private syntheticDataDir = path.resolve(process.cwd(), 'data/synthetic');

  constructor() {
    if (!fs.existsSync(this.syntheticDataDir)) {
      fs.mkdirSync(this.syntheticDataDir, { recursive: true });
    }
  }

  /**
   * Generates or extracts training rows for application_prob model.
   */
  public async exportApplicationTrainingRows(organizationId: string): Promise<Array<Record<string, unknown>>> {
    // 1. Check live database events
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId },
      include: {
        job: true,
        publishers: { include: { publisher: true } },
        events: true,
      },
    });

    const rows: Array<Record<string, unknown>> = [];

    // Extract from campaigns if events exist
    for (const campaign of campaigns) {
      const clicks = campaign.events.filter((e) => e.eventType === 'CLICK');
      const apps = campaign.events.filter((e) => e.eventType === 'APPLICATION' || e.eventType === 'APPLICATION_START');
      const totalClicks = clicks.reduce((sum, c) => sum + c.quantity, 0);
      const totalApps = apps.reduce((sum, a) => sum + a.quantity, 0);

      const convRate = totalClicks > 0 ? totalApps / totalClicks : 0.15;
      const ctr = 0.045;
      const cpa = 120.0;

      for (const cp of campaign.publishers) {
        const exp = campaign.job.minExperienceYears || 3;
        const loc = campaign.job.remote ? 'remote' : 'tier_1';
        const pubType = cp.publisher.type.toLowerCase();

        // Sample click interactions
        const sampleCount = Math.min(Math.max(totalClicks, 10), 50);
        for (let i = 0; i < sampleCount; i++) {
          const isConverted = (i / sampleCount) < convRate ? 1 : 0;
          rows.push({
            job_category: campaign.job.category.toLowerCase(),
            experience_req: exp,
            location_tier: loc,
            publisher_type: pubType,
            historical_ctr: ctr,
            historical_cpa: cpa,
            historical_conv: convRate,
            day_of_week: i % 7,
            bid: Number(cp.bidCpc) || 2.5,
            budget: Number(campaign.budget) || 1500.0,
            converted: isConverted,
          });
        }
      }
    }

    // Fallback/enrichment to ensure robust sample size (> 50 rows)
    if (rows.length < 50) {
      const synthetic = this.generateSyntheticApplicationRows(100);
      rows.push(...synthetic);
    }

    // Save CSV copy for audit and reproducibility
    const csvPath = path.join(this.syntheticDataDir, 'application_training.csv');
    this.writeCsv(csvPath, rows);

    return rows;
  }

  /**
   * Generates or extracts training rows for fill_prob model and writes data/synthetic/fill_training.csv.
   */
  public async exportFillTrainingRows(organizationId: string): Promise<Array<Record<string, unknown>>> {
    const jobs = await prisma.job.findMany({
      where: { organizationId },
      include: {
        applications: true,
        campaigns: { include: { spends: true } },
      },
    });

    const rows: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      const salaryMin = job.salaryMin ? Number(job.salaryMin) : 90000;
      const salaryMax = job.salaryMax ? Number(job.salaryMax) : 150000;
      const salaryBand = (salaryMin + salaryMax) / 2000.0; // In thousands

      const skillsCount = Array.isArray(job.requiredSkills) ? job.requiredSkills.length : 5;

      const creationTime = new Date(job.createdAt).getTime();
      const sevenDaysLater = creationTime + 7 * 24 * 60 * 60 * 1000;

      const apps7d = job.applications.filter(
        (a) => new Date(a.appliedAt).getTime() <= sevenDaysLater
      ).length;

      const totalApps = job.applications.length;
      const qualApps = job.applications.filter((a) =>
        ['SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED'].includes(a.status)
      ).length;
      const qualRate = totalApps > 0 ? qualApps / totalApps : 0.25;

      let totalSpend = 0;
      for (const camp of job.campaigns) {
        for (const sp of camp.spends) {
          totalSpend += Number(sp.amount);
        }
      }

      const expReq = job.minExperienceYears || 3;

      // Simulated label: filled within 45 days if status is CLOSED with hired candidate, or high qual yield
      const hasHire = job.applications.some((a) => a.status === 'HIRED');
      const filled = (job.status === 'CLOSED' && hasHire) || (totalApps >= 15 && qualApps >= 4) ? 1 : 0;

      rows.push({
        salary_band: salaryBand,
        skills_count: skillsCount,
        applications_first_7d: apps7d,
        qualified_rate: qualRate,
        spend: totalSpend,
        experience_req: expReq,
        filled_within_45d: filled,
      });
    }

    // Enrich with synthetic rows to meet ML training volume (> 80 rows)
    if (rows.length < 80) {
      const synthetic = this.generateSyntheticFillRows(100);
      rows.push(...synthetic);
    }

    // Save to data/synthetic/fill_training.csv
    const csvPath = path.join(this.syntheticDataDir, 'fill_training.csv');
    this.writeCsv(csvPath, rows);

    return rows;
  }

  /**
   * Trains a predictive model, saves version in database, and returns metadata.
   */
  public async trainModel(organizationId: string, modelName: MlModelName): Promise<{
    model: string;
    version: string;
    metrics: Record<string, unknown>;
    trainingRows: number;
    trainedAt: string;
    isActive: boolean;
  }> {
    logger.info({ msg: 'Initiating ML model training', modelName, organizationId });

    let rows: Array<Record<string, unknown>>;
    if (modelName === 'application_prob') {
      rows = await this.exportApplicationTrainingRows(organizationId);
    } else if (modelName === 'fill_prob') {
      rows = await this.exportFillTrainingRows(organizationId);
    } else {
      throw new Error(`Unsupported model name: ${modelName}`);
    }

    // Train via ML service
    const trainResult = await mlClient.trainModel(modelName, rows);

    // Save ModelVersion in PostgreSQL transactionally
    await prisma.$transaction(async (tx) => {
      // Mark existing versions of this model as inactive
      await tx.modelVersion.updateMany({
        where: { name: modelName },
        data: { isActive: false },
      });

      // Insert or upsert new version
      await tx.modelVersion.upsert({
        where: {
          name_version: {
            name: modelName,
            version: trainResult.version,
          },
        },
        update: {
          metrics: trainResult.metrics as Prisma.InputJsonValue,
          trainingRows: trainResult.trainingRows,
          trainedAt: new Date(trainResult.trainedAt),
          isActive: true,
        },
        create: {
          name: modelName,
          version: trainResult.version,
          metrics: trainResult.metrics as Prisma.InputJsonValue,
          trainingRows: trainResult.trainingRows,
          trainedAt: new Date(trainResult.trainedAt),
          isActive: true,
        },
      });
    });

    logger.info({
      msg: 'Successfully trained and registered ML model version',
      modelName,
      version: trainResult.version,
      trainingRows: trainResult.trainingRows,
    });

    return {
      model: trainResult.model,
      version: trainResult.version,
      metrics: trainResult.metrics,
      trainingRows: trainResult.trainingRows,
      trainedAt: trainResult.trainedAt,
      isActive: true,
    };
  }

  /**
   * Predicts application conversion probability for a given click context.
   */
  public async predictApplication(
    _organizationId: string,
    data: PredictApplicationRequest
  ): Promise<PredictApplicationResponse> {
    const pythonPayload = {
      job_category: data.jobCategory,
      experience_req: data.experienceReq,
      location_tier: data.locationTier,
      publisher_type: data.publisherType,
      historical_ctr: data.historicalCtr,
      historical_cpa: data.historicalCpa,
      historical_conv: data.historicalConv,
      day_of_week: data.dayOfWeek,
      bid: data.bid,
      budget: data.budget,
    };

    try {
      const res = await mlClient.predict<{
        probability: number;
        modelVersion: string;
        topFactors: MlTopFactor[];
      }>('application_prob', pythonPayload);

      return {
        probability: res.probability,
        modelVersion: res.modelVersion,
        topFactors: res.topFactors || [],
      };
    } catch (err: unknown) {
      if (err instanceof MlServiceError) {
        logger.warn({ msg: 'ML service unavailable for application prediction, using heuristic fallback', error: err.message });
        // Heuristic fallback
        const baseProb = Math.min(Math.max(data.historicalConv * 0.8 + data.historicalCtr * 2.0, 0.05), 0.50);
        return {
          probability: Math.round(baseProb * 1000) / 1000,
          modelVersion: 'heuristic-fallback',
          topFactors: [
            {
              feature: 'historicalConv',
              impact: data.historicalConv >= 0.20 ? 'positive' : 'negative',
              weight: 0.25,
              description: `Baseline historical conversion rate (${(data.historicalConv * 100).toFixed(1)}%)`,
            },
          ],
        };
      }
      throw err;
    }
  }

  /**
   * Predicts job fill probability within 45 days, risk category, and explainability factors.
   */
  public async predictFill(
    organizationId: string,
    jobId: string
  ): Promise<PredictFillResponse> {
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId },
      include: {
        applications: true,
        campaigns: { include: { spends: true } },
      },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const salaryMin = job.salaryMin ? Number(job.salaryMin) : 90000;
    const salaryMax = job.salaryMax ? Number(job.salaryMax) : 150000;
    const salaryBand = (salaryMin + salaryMax) / 2000.0;

    const skillsCount = Array.isArray(job.requiredSkills) ? job.requiredSkills.length : 5;

    const creationTime = new Date(job.createdAt).getTime();
    const sevenDaysLater = creationTime + 7 * 24 * 60 * 60 * 1000;

    const apps7d = job.applications.filter(
      (a) => new Date(a.appliedAt).getTime() <= sevenDaysLater
    ).length;

    const totalApps = job.applications.length;
    const qualApps = job.applications.filter((a) =>
      ['SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED'].includes(a.status)
    ).length;
    const qualRate = totalApps > 0 ? qualApps / totalApps : 0.25;

    let totalSpend = 0;
    for (const camp of job.campaigns) {
      for (const sp of camp.spends) {
        totalSpend += Number(sp.amount);
      }
    }

    const expReq = job.minExperienceYears || 3;

    const featureObj = {
      salaryBand: Math.round(salaryBand),
      skillsCount,
      applicationsFirst7d: apps7d,
      qualifiedRate: Math.round(qualRate * 1000) / 1000,
      spend: Math.round(totalSpend),
      experienceReq: expReq,
    };

    const pythonPayload = {
      salary_band: salaryBand,
      skills_count: skillsCount,
      applications_first_7d: apps7d,
      qualified_rate: qualRate,
      spend: totalSpend,
      experience_req: expReq,
    };

    try {
      const res = await mlClient.predict<{
        probability: number;
        risk: MlRiskBucket;
        modelVersion: string;
        topFactors: MlTopFactor[];
      }>('fill_prob', pythonPayload);

      return {
        jobId: job.id,
        jobTitle: job.title,
        probability: res.probability,
        risk: res.risk || this.deriveRiskBucket(res.probability),
        modelVersion: res.modelVersion,
        topFactors: res.topFactors || [],
        features: featureObj,
      };
    } catch (err: unknown) {
      if (err instanceof MlServiceError) {
        logger.warn({ msg: 'ML service unavailable for fill prediction, using heuristic fallback', error: err.message });
        // Heuristic calculation
        const heuristicProb = Math.min(
          Math.max(0.20 + (apps7d / 30.0) * 0.35 + qualRate * 0.35, 0.10),
          0.92
        );
        const risk = this.deriveRiskBucket(heuristicProb);
        return {
          jobId: job.id,
          jobTitle: job.title,
          probability: Math.round(heuristicProb * 100) / 100,
          risk,
          modelVersion: 'heuristic-fallback',
          topFactors: [
            {
              feature: 'qualified_rate',
              impact: qualRate >= 0.30 ? 'positive' : 'negative',
              weight: 0.35,
              description: `Applicant qualification yield (${(qualRate * 100).toFixed(0)}%)`,
            },
            {
              feature: 'applications_first_7d',
              impact: apps7d >= 10 ? 'positive' : 'negative',
              weight: 0.30,
              description: `Early applicant velocity (${apps7d} in first 7 days)`,
            },
          ],
          features: featureObj,
        };
      }
      throw err;
    }
  }

  /**
   * Lists models registered in the database and ML service.
   */
  public async listModels(_organizationId: string) {
    const dbModels = await prisma.modelVersion.findMany({
      orderBy: { trainedAt: 'desc' },
    });

    const isHealthy = await mlClient.isHealthy();
    let serviceModels: Awaited<ReturnType<typeof mlClient.listModels>> = [];
    if (isHealthy) {
      try {
        serviceModels = await mlClient.listModels();
      } catch {
        // Fallback to DB
      }
    }

    return {
      serviceAvailable: isHealthy,
      activeModels: dbModels.filter((m) => m.isActive),
      allVersions: dbModels,
      serviceRegistry: serviceModels,
    };
  }

  private deriveRiskBucket(prob: number): MlRiskBucket {
    if (prob < 0.35) return 'High';
    if (prob < 0.65) return 'Medium';
    return 'Low';
  }

  private generateSyntheticApplicationRows(n: number): Array<Record<string, unknown>> {
    const cats = ['engineering', 'product', 'sales', 'marketing', 'operations', 'healthcare'];
    const locs = ['tier_1', 'tier_2', 'tier_3', 'remote'];
    const pubs = ['job_board', 'social', 'search', 'aggregator', 'referral'];
    const rows = [];
    for (let i = 0; i < n; i++) {
      const conv = 0.10 + (i % 20) * 0.01;
      const ctr = 0.02 + (i % 15) * 0.003;
      const cpa = 80 + (i % 25) * 10;
      const loc = locs[i % locs.length];
      const pub = pubs[i % pubs.length];
      const isConv = (i % 3 === 0 || (loc === 'remote' && i % 2 === 0)) ? 1 : 0;
      rows.push({
        job_category: cats[i % cats.length],
        experience_req: 1 + (i % 8),
        location_tier: loc,
        publisher_type: pub,
        historical_ctr: ctr,
        historical_cpa: cpa,
        historical_conv: conv,
        day_of_week: i % 7,
        bid: 1.5 + (i % 10) * 0.3,
        budget: 500 + (i % 10) * 400,
        converted: isConv,
      });
    }
    return rows;
  }

  private generateSyntheticFillRows(n: number): Array<Record<string, unknown>> {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const salary = 80 + (i % 20) * 6;
      const skills = 3 + (i % 7);
      const apps = 5 + (i % 35);
      const qual = 0.15 + (i % 20) * 0.025;
      const spend = 300 + (i % 25) * 100;
      const exp = 1 + (i % 7);
      const filled = (apps > 15 && qual > 0.30) || salary > 140 ? 1 : 0;
      rows.push({
        salary_band: salary,
        skills_count: skills,
        applications_first_7d: apps,
        qualified_rate: qual,
        spend,
        experience_req: exp,
        filled_within_45d: filled,
      });
    }
    return rows;
  }

  private writeCsv(filePath: string, rows: Array<Record<string, unknown>>): void {
    if (rows.length === 0 || !rows[0]) return;
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => String(r[h] ?? '')).join(','));
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}

export const mlService = new MlService();
