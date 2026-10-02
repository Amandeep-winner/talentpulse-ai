import { prisma } from '../../lib/prisma';
import { invalidate } from '../../lib/cache';
import { NotFoundError, ForbiddenError, ValidationError } from '../../lib/errors/AppError';
import { analyticsService } from '../analytics/analytics.service';
import { evaluatePublisherRules } from './rules';
import { scorePublishers } from './score';
import { computeAllocations } from './allocate';
import {
  PublisherRuleInput,
  PublisherScoreInput,
  ScoringWeights,
  AllocationOptions,
} from './types';
import {
  OptimizationRuleActionItem,
  OptimizationDecision,
  RecommendationItem,
  RecommendationStatus,
} from '@talentpulse/shared';

export interface ProposeParams {
  campaignId: string;
  weights?: Partial<ScoringWeights>;
  tau?: number;
}

export class OptimizationService {
  /**
   * Generates a deterministic optimization recommendation combining:
   * 1. Rule Engine heuristic actions (reduce, increase, pacing, review)
   * 2. Quality & Efficiency Scoring
   * 3. Constrained Softmax Budget Allocation (floor 5%, cap 50%, max change ±10 pp, sum 100%)
   */
  async propose(
    organizationId: string,
    params: ProposeParams,
    userId?: string
  ): Promise<RecommendationItem> {
    const { campaignId, weights, tau } = params;

    // 1. Fetch Campaign and current allocations
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: {
        publishers: {
          include: {
            publisher: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found`);
    }

    const campaignPublishers = campaign.publishers || [];
    if (campaignPublishers.length === 0) {
      throw new ValidationError('Campaign has no publisher channels configured for optimization');
    }

    const currentAllocations: Record<string, number> = {};
    for (const cp of campaignPublishers) {
      currentAllocations[cp.publisherId] = Number(cp.allocationPct);
    }

    // 2. Fetch publisher performance and 7-day trend deltas
    const pubAnalytics = await analyticsService.getPublishers(organizationId, {
      campaignId,
    });

    // 3. Evaluate Rule Engine for each publisher
    const ruleActionItems: OptimizationRuleActionItem[] = [];
    const ruleInputs: PublisherRuleInput[] = [];

    let totalClicks = 0;
    const campaignBudget = Number(campaign.budget);
    const dailyTargetBudget = campaignBudget / 30;

    for (const cp of campaignPublishers) {
      const perf = pubAnalytics.find((p) => p.publisherId === cp.publisherId);
      const clicks = perf?.clicks || 0;
      totalClicks += clicks;

      const pacingRatio =
        dailyTargetBudget > 0 && perf
          ? (perf.spend / 7) / (dailyTargetBudget * (Number(cp.allocationPct) / 100))
          : 1.0;

      const ruleInput: PublisherRuleInput = {
        publisherId: cp.publisherId,
        publisherName: cp.publisher?.name || 'Publisher',
        clicks,
        impressions: perf?.impressions || 0,
        applications: perf?.applications || 0,
        qualifiedApplications: perf?.qualifiedApplications || 0,
        ctr: perf?.ctr ?? null,
        cpa: perf?.cpa ?? null,
        cpaDelta: perf?.trends?.cpaDelta ?? null,
        appRateDelta: perf?.trends?.applicationsDelta ?? null,
        qualifiedDelta:
          perf?.trends && perf.qualifiedApplications > 0
            ? perf.trends.applicationsDelta
            : null,
        pacingRatio,
      };

      ruleInputs.push(ruleInput);
      const ruleRes = evaluatePublisherRules(ruleInput);
      ruleActionItems.push({
        publisherId: ruleRes.publisherId,
        publisherName: ruleRes.publisherName,
        action: ruleRes.action,
        reason: ruleRes.reason,
      });
    }

    // 4. Score Publishers
    const scoreInputs: PublisherScoreInput[] = campaignPublishers.map((cp) => {
      const perf = pubAnalytics.find((p) => p.publisherId === cp.publisherId);
      return {
        publisherId: cp.publisherId,
        publisherName: cp.publisher?.name || 'Publisher',
        clicks: perf?.clicks || 0,
        applications: perf?.applications || 0,
        qualifiedApplications: perf?.qualifiedApplications || 0,
        hires: perf?.hires || 0,
        spend: perf?.spend || 0,
        cpa: perf?.cpa ?? null,
        cph: perf?.cph ?? null,
        hireRate: perf?.applications && perf.applications > 0 ? (perf.hires || 0) / perf.applications : 0,
      };
    });

    const scoreResults = scorePublishers(scoreInputs, weights);

    // 5. Constrained Softmax Allocation
    const allocationOpts: AllocationOptions = {
      tau: tau || 0.5,
      floor: 5.0,
      cap: 50.0,
      maxChange: 10.0,
    };
    const allocationResult = computeAllocations(
      scoreResults,
      currentAllocations,
      allocationOpts
    );

    // 6. Calculate Confidence score based on click volume
    let confidence = 0.5;
    if (totalClicks >= 500) confidence = 0.92;
    else if (totalClicks >= 200) confidence = 0.82;
    else if (totalClicks >= 50) confidence = 0.70;
    else confidence = 0.45;

    // 7. Compose Natural Language Explanation
    const explanationLines: string[] = [
      `Optimization proposal generated for campaign "${campaign.name}" evaluating ${campaignPublishers.length} publisher channels over 7-day velocity windows.`,
    ];

    for (const action of ruleActionItems) {
      const curr = currentAllocations[action.publisherId] ?? 0;
      const rec = allocationResult.allocations[action.publisherId] ?? 0;
      const change = rec - curr;
      const sign = change > 0 ? '+' : '';
      explanationLines.push(
        `- ${action.publisherName} (${action.action}): Allocation ${curr.toFixed(1)}% -> ${rec.toFixed(1)}% (${sign}${change.toFixed(1)} pp). ${action.reason}.`
      );
    }

    const decision: OptimizationDecision = {
      current: currentAllocations,
      recommended: allocationResult.allocations,
      actions: ruleActionItems,
    };

    const explanation = {
      summary: explanationLines[0]!,
      details: explanationLines.slice(1),
      fullText: explanationLines.join('\n'),
    };

    // 8. Persist Recommendation in database
    const recRecord = await prisma.recommendation.create({
      data: {
        organizationId,
        userId: userId || null,
        type: 'CAMPAIGN_ALLOCATION',
        modelVersion: 'rules+score-v1',
        inputRef: {
          campaignId,
          weights: weights || {},
          tau: tau || 0.5,
        },
        decision: decision as unknown as object,
        explanation: explanation as unknown as object,
        confidence,
        status: 'PROPOSED',
      },
    });

    await invalidate(organizationId, 'recommendations');

    return {
      id: recRecord.id,
      organizationId: recRecord.organizationId,
      userId: recRecord.userId,
      type: recRecord.type,
      modelVersion: recRecord.modelVersion,
      inputRef: recRecord.inputRef as Record<string, unknown>,
      decision,
      explanation,
      confidence: recRecord.confidence,
      status: recRecord.status as RecommendationStatus,
      decidedBy: recRecord.decidedBy,
      decidedAt: recRecord.decidedAt ? recRecord.decidedAt.toISOString() : null,
      createdAt: recRecord.createdAt.toISOString(),
    };
  }

  /**
   * Approves a proposed budget recommendation and atomically applies it
   * to CampaignPublisher records while invalidating Redis caches.
   */
  async approve(
    organizationId: string,
    recommendationId: string,
    userId: string,
    userRole: string
  ): Promise<RecommendationItem> {
    if (userRole === 'ANALYST') {
      throw new ForbiddenError('Analysts are not authorized to approve budget allocation recommendations');
    }

    const rec = await prisma.recommendation.findFirst({
      where: { id: recommendationId, organizationId },
    });

    if (!rec) {
      throw new NotFoundError(`Recommendation '${recommendationId}' not found`);
    }

    if (rec.status !== 'PROPOSED') {
      throw new ValidationError(`Recommendation is already in '${rec.status}' status and cannot be approved`);
    }

    const decision = rec.decision as unknown as OptimizationDecision;
    const inputRef = rec.inputRef as { campaignId?: string };
    const campaignId = inputRef.campaignId;

    if (!campaignId || !decision.recommended) {
      throw new ValidationError('Malformed recommendation decision payload');
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
    });

    if (!campaign) {
      throw new NotFoundError(`Target campaign '${campaignId}' not found`);
    }

    const campaignBudget = Number(campaign.budget);

    // Transactionally update all publisher allocations and mark recommendation APPLIED
    await prisma.$transaction(async (tx) => {
      for (const [publisherId, newPct] of Object.entries(decision.recommended)) {
        const dailyBudget = Math.round((campaignBudget * (newPct / 100)) / 30);
        await tx.campaignPublisher.upsert({
          where: {
            campaignId_publisherId: {
              campaignId,
              publisherId,
            },
          },
          update: {
            allocationPct: newPct,
            dailyBudget,
          },
          create: {
            campaignId,
            publisherId,
            allocationPct: newPct,
            bidCpc: 20.0,
            dailyBudget,
          },
        });
      }

      await tx.recommendation.update({
        where: { id: recommendationId },
        data: {
          status: 'APPLIED',
          decidedBy: userId,
          decidedAt: new Date(),
        },
      });
    });

    // Invalidate Redis caches
    await Promise.all([
      invalidate(organizationId, 'campaigns'),
      invalidate(organizationId, 'analytics'),
      invalidate(organizationId, 'recommendations'),
    ]);

    const updated = await prisma.recommendation.findUniqueOrThrow({
      where: { id: recommendationId },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      userId: updated.userId,
      type: updated.type,
      modelVersion: updated.modelVersion,
      inputRef: updated.inputRef as Record<string, unknown>,
      decision: updated.decision as unknown as OptimizationDecision,
      explanation: updated.explanation as Record<string, unknown>,
      confidence: updated.confidence,
      status: updated.status as RecommendationStatus,
      decidedBy: updated.decidedBy,
      decidedAt: updated.decidedAt ? updated.decidedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Rejects a proposed recommendation.
   */
  async reject(
    organizationId: string,
    recommendationId: string,
    userId: string,
    userRole: string
  ): Promise<RecommendationItem> {
    if (userRole === 'ANALYST') {
      throw new ForbiddenError('Analysts are not authorized to reject budget allocation recommendations');
    }

    const rec = await prisma.recommendation.findFirst({
      where: { id: recommendationId, organizationId },
    });

    if (!rec) {
      throw new NotFoundError(`Recommendation '${recommendationId}' not found`);
    }

    if (rec.status !== 'PROPOSED') {
      throw new ValidationError(`Recommendation is already in '${rec.status}' status and cannot be rejected`);
    }

    const updated = await prisma.recommendation.update({
      where: { id: recommendationId },
      data: {
        status: 'REJECTED',
        decidedBy: userId,
        decidedAt: new Date(),
      },
    });

    await invalidate(organizationId, 'recommendations');

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      userId: updated.userId,
      type: updated.type,
      modelVersion: updated.modelVersion,
      inputRef: updated.inputRef as Record<string, unknown>,
      decision: updated.decision as unknown as OptimizationDecision,
      explanation: updated.explanation as Record<string, unknown>,
      confidence: updated.confidence,
      status: updated.status as RecommendationStatus,
      decidedBy: updated.decidedBy,
      decidedAt: updated.decidedAt ? updated.decidedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Lists recommendations for the organization.
   */
  async list(
    organizationId: string,
    options: { campaignId?: string; status?: RecommendationStatus } = {}
  ): Promise<RecommendationItem[]> {
    const records = await prisma.recommendation.findMany({
      where: {
        organizationId,
        type: 'CAMPAIGN_ALLOCATION',
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let filtered = records;
    if (options.campaignId) {
      filtered = records.filter((r) => {
        const ref = r.inputRef as { campaignId?: string };
        return ref?.campaignId === options.campaignId;
      });
    }

    return filtered.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      userId: r.userId,
      type: r.type,
      modelVersion: r.modelVersion,
      inputRef: r.inputRef as Record<string, unknown>,
      decision: r.decision as unknown as OptimizationDecision,
      explanation: r.explanation as Record<string, unknown>,
      confidence: r.confidence,
      status: r.status as RecommendationStatus,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Fetches a recommendation by ID.
   */
  async getById(organizationId: string, id: string): Promise<RecommendationItem> {
    const r = await prisma.recommendation.findFirst({
      where: { id, organizationId },
    });

    if (!r) {
      throw new NotFoundError(`Recommendation '${id}' not found`);
    }

    return {
      id: r.id,
      organizationId: r.organizationId,
      userId: r.userId,
      type: r.type,
      modelVersion: r.modelVersion,
      inputRef: r.inputRef as Record<string, unknown>,
      decision: r.decision as unknown as OptimizationDecision,
      explanation: r.explanation as Record<string, unknown>,
      confidence: r.confidence,
      status: r.status as RecommendationStatus,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

export const optimizationService = new OptimizationService();
