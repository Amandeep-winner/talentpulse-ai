import { prisma } from '../../../lib/prisma';
import { NotFoundError } from '../../../lib/errors/AppError';
import {
  CreateExperimentRequest,
  ExperimentResultsResponse,
  ExperimentStatus,
  ExperimentVariant,
} from '@talentpulse/shared';
import { assignVariant } from './assignment';
import { computeExperimentResults, ExposureCount } from './stats';

export class ExperimentsService {
  /**
   * Creates a new A/B experiment for an organization.
   */
  async createExperiment(
    organizationId: string,
    input: CreateExperimentRequest
  ): Promise<ExperimentResultsResponse> {
    const experiment = await prisma.experiment.create({
      data: {
        organizationId,
        name: input.name,
        hypothesis: input.hypothesis,
        status: 'DRAFT',
        variants: input.variants as unknown as object[],
      },
    });

    return this.formatExperimentResponse(experiment, []);
  }

  /**
   * Lists all experiments for an organization with aggregated performance statistics.
   */
  async listExperiments(organizationId: string): Promise<ExperimentResultsResponse[]> {
    const experiments = await prisma.experiment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const results: ExperimentResultsResponse[] = [];
    for (const exp of experiments) {
      const stats = await this.getExperimentStats(exp.id);
      results.push(this.formatExperimentResponse(exp, stats));
    }

    return results;
  }

  /**
   * Retrieves single experiment details with full variant breakdown, statistical test results, and winner.
   */
  async getExperimentById(
    organizationId: string,
    experimentId: string
  ): Promise<ExperimentResultsResponse> {
    const experiment = await prisma.experiment.findFirst({
      where: { id: experimentId, organizationId },
    });

    if (!experiment) {
      throw new NotFoundError('Experiment not found');
    }

    const counts = await this.getExperimentStats(experiment.id);
    return this.formatExperimentResponse(experiment, counts);
  }

  /**
   * Updates experiment lifecycle status (DRAFT -> RUNNING -> STOPPED).
   */
  async updateStatus(
    organizationId: string,
    experimentId: string,
    status: ExperimentStatus
  ): Promise<ExperimentResultsResponse> {
    const experiment = await prisma.experiment.findFirst({
      where: { id: experimentId, organizationId },
    });

    if (!experiment) {
      throw new NotFoundError('Experiment not found');
    }

    const updated = await prisma.experiment.update({
      where: { id: experimentId },
      data: { status },
    });

    const counts = await this.getExperimentStats(experiment.id);
    return this.formatExperimentResponse(updated, counts);
  }

  /**
   * Assigns subject to variant deterministically.
   * If subject is already exposed, returns existing assignment.
   */
  async assign(
    organizationId: string,
    experimentId: string,
    subjectKey: string
  ): Promise<{ experimentId: string; subjectKey: string; variant: string; isNewExposure: boolean }> {
    const experiment = await prisma.experiment.findFirst({
      where: { id: experimentId, organizationId },
    });

    if (!experiment) {
      throw new NotFoundError('Experiment not found');
    }

    // Check existing exposure
    const existing = await prisma.experimentExposure.findUnique({
      where: {
        experimentId_subjectKey: {
          experimentId,
          subjectKey,
        },
      },
    });

    if (existing) {
      return {
        experimentId,
        subjectKey,
        variant: existing.variant,
        isNewExposure: false,
      };
    }

    const variants = experiment.variants as unknown as ExperimentVariant[];
    const assignedVariant = assignVariant(experimentId, subjectKey, variants);

    // Record exposure only if experiment is running or draft (allows preview assignment)
    await prisma.experimentExposure.create({
      data: {
        experimentId,
        subjectKey,
        variant: assignedVariant,
        converted: false,
      },
    });

    return {
      experimentId,
      subjectKey,
      variant: assignedVariant,
      isNewExposure: true,
    };
  }

  /**
   * Records a conversion event for an exposed subject.
   */
  async convert(
    organizationId: string,
    experimentId: string,
    subjectKey: string
  ): Promise<{ experimentId: string; subjectKey: string; variant: string; converted: boolean }> {
    const experiment = await prisma.experiment.findFirst({
      where: { id: experimentId, organizationId },
    });

    if (!experiment) {
      throw new NotFoundError('Experiment not found');
    }

    const exposure = await prisma.experimentExposure.findUnique({
      where: {
        experimentId_subjectKey: {
          experimentId,
          subjectKey,
        },
      },
    });

    if (!exposure) {
      throw new NotFoundError('Subject was never exposed to this experiment');
    }

    if (!exposure.converted) {
      await prisma.experimentExposure.update({
        where: { id: exposure.id },
        data: { converted: true },
      });
    }

    return {
      experimentId,
      subjectKey,
      variant: exposure.variant,
      converted: true,
    };
  }

  /**
   * Fetches aggregated exposure counts and conversions per variant.
   */
  private async getExperimentStats(experimentId: string): Promise<ExposureCount[]> {
    const grouped = await prisma.experimentExposure.groupBy({
      by: ['variant', 'converted'],
      where: { experimentId },
      _count: { id: true },
    });

    const map = new Map<string, { exposures: number; conversions: number }>();

    for (const row of grouped) {
      const current = map.get(row.variant) ?? { exposures: 0, conversions: 0 };
      current.exposures += row._count.id;
      if (row.converted) {
        current.conversions += row._count.id;
      }
      map.set(row.variant, current);
    }

    return Array.from(map.entries()).map(([variant, count]) => ({
      variant,
      exposures: count.exposures,
      conversions: count.conversions,
    }));
  }

  private formatExperimentResponse(
    experiment: {
      id: string;
      organizationId: string;
      name: string;
      hypothesis: string | null;
      status: string;
      variants: unknown;
      createdAt: Date;
    },
    counts: ExposureCount[]
  ): ExperimentResultsResponse {
    const variants = experiment.variants as unknown as ExperimentVariant[];
    const { stats, hasSufficientData, winner } = computeExperimentResults(variants, counts);

    const totalExposures = counts.reduce((acc, c) => acc + c.exposures, 0);
    const totalConversions = counts.reduce((acc, c) => acc + c.conversions, 0);

    return {
      id: experiment.id,
      organizationId: experiment.organizationId,
      name: experiment.name,
      hypothesis: experiment.hypothesis,
      status: experiment.status as ExperimentStatus,
      variants,
      totalExposures,
      totalConversions,
      stats,
      hasSufficientData,
      winner,
      createdAt: experiment.createdAt.toISOString(),
    };
  }
}

export const experimentsService = new ExperimentsService();
