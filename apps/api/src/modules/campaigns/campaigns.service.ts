import { Prisma } from '@prisma/client';
import {
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignAllocationInput,
  CampaignFilterQuery,
  CampaignItem,
  CampaignPublisherItem,
  CampaignStatus,
  PaginationMeta,
  CampaignSpendInput,
  CampaignSimulateResponse,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../lib/errors/AppError';
import { createMulberry32, getPublisherProfile, simulateDay } from '../simulation';

type CampaignWithRelations = Prisma.CampaignGetPayload<{
  include: {
    job: {
      select: {
        id: true;
        title: true;
        location: true;
      };
    };
    publishers: {
      include: {
        publisher: true;
      };
    };
  };
}>;

function mapCampaignToItem(c: CampaignWithRelations): CampaignItem {
  return {
    id: c.id,
    organizationId: c.organizationId,
    jobId: c.jobId,
    name: c.name,
    budget: Number(c.budget),
    status: c.status as CampaignStatus,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate ? c.endDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    job: c.job
      ? {
          id: c.job.id,
          title: c.job.title,
          location: c.job.location,
        }
      : undefined,
    publishers: c.publishers?.map((cp) => ({
      id: cp.id,
      campaignId: cp.campaignId,
      publisherId: cp.publisherId,
      allocationPct: Number(cp.allocationPct),
      bidCpc: Number(cp.bidCpc),
      dailyBudget: Number(cp.dailyBudget),
      publisher: cp.publisher
        ? {
            id: cp.publisher.id,
            organizationId: cp.publisher.organizationId,
            name: cp.publisher.name,
            type: cp.publisher.type,
          }
        : undefined,
    })),
  };
}

export class CampaignsService {
  async listCampaigns(
    organizationId: string,
    query: CampaignFilterQuery,
  ): Promise<{ campaigns: CampaignItem[]; meta: PaginationMeta }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.CampaignWhereInput = {
      organizationId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.jobId) {
      where.jobId = query.jobId;
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { job: { title: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
            },
          },
          publishers: {
            include: {
              publisher: true,
            },
          },
        },
      }),
    ]);

    return {
      campaigns: records.map(mapCampaignToItem),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async getCampaign(organizationId: string, id: string): Promise<CampaignItem> {
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
          },
        },
        publishers: {
          include: {
            publisher: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    return mapCampaignToItem(campaign);
  }

  async createCampaign(
    organizationId: string,
    data: CreateCampaignRequest,
  ): Promise<CampaignItem> {
    // 1. Verify job belongs to org
    const job = await prisma.job.findFirst({
      where: { id: data.jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundError('Job not found');
    }

    // 2. Validate allocations if provided
    if (data.allocations && data.allocations.length > 0) {
      const sumPct = data.allocations.reduce((sum, a) => sum + a.allocationPct, 0);
      if (Math.abs(sumPct - 100) > 0.01) {
        throw new ValidationError('Campaign allocations must sum to exactly 100%');
      }

      // Check all publishers belong to org
      const pubIds = data.allocations.map((a) => a.publisherId);
      const pubCount = await prisma.publisher.count({
        where: { id: { in: pubIds }, organizationId },
      });
      if (pubCount !== pubIds.length) {
        throw new NotFoundError('One or more selected publishers do not belong to organization');
      }
    }

    // 3. Create Campaign and Allocations in transaction
    const created = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          organizationId,
          jobId: data.jobId,
          name: data.name.trim(),
          budget: new Prisma.Decimal(data.budget),
          status: data.status || 'DRAFT',
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
        },
      });

      if (data.allocations && data.allocations.length > 0) {
        await tx.campaignPublisher.createMany({
          data: data.allocations.map((a) => ({
            campaignId: campaign.id,
            publisherId: a.publisherId,
            allocationPct: new Prisma.Decimal(a.allocationPct),
            bidCpc: new Prisma.Decimal(a.bidCpc),
            dailyBudget: new Prisma.Decimal(a.dailyBudget),
          })),
        });
      }

      return tx.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
            },
          },
          publishers: {
            include: {
              publisher: true,
            },
          },
        },
      });
    });

    return mapCampaignToItem(created);
  }

  async updateCampaign(
    organizationId: string,
    id: string,
    data: UpdateCampaignRequest,
  ): Promise<CampaignItem> {
    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundError('Campaign not found');
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.budget !== undefined ? { budget: new Prisma.Decimal(data.budget) } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate !== undefined
          ? { endDate: data.endDate ? new Date(data.endDate) : null }
          : {}),
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
          },
        },
        publishers: {
          include: {
            publisher: true,
          },
        },
      },
    });

    return mapCampaignToItem(updated);
  }

  async getAllocations(
    organizationId: string,
    campaignId: string,
  ): Promise<CampaignPublisherItem[]> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    const allocations = await prisma.campaignPublisher.findMany({
      where: { campaignId },
      include: {
        publisher: true,
      },
    });

    return allocations.map((cp) => ({
      id: cp.id,
      campaignId: cp.campaignId,
      publisherId: cp.publisherId,
      allocationPct: Number(cp.allocationPct),
      bidCpc: Number(cp.bidCpc),
      dailyBudget: Number(cp.dailyBudget),
      publisher: cp.publisher
        ? {
            id: cp.publisher.id,
            organizationId: cp.publisher.organizationId,
            name: cp.publisher.name,
            type: cp.publisher.type,
          }
        : undefined,
    }));
  }

  async setAllocations(
    organizationId: string,
    campaignId: string,
    allocations: CampaignAllocationInput[],
  ): Promise<CampaignPublisherItem[]> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    const sumPct = allocations.reduce((sum, a) => sum + a.allocationPct, 0);
    if (Math.abs(sumPct - 100) > 0.01) {
      throw new ValidationError('Campaign allocations must sum to exactly 100%');
    }

    // Verify all publishers belong to org
    const pubIds = allocations.map((a) => a.publisherId);
    const pubCount = await prisma.publisher.count({
      where: { id: { in: pubIds }, organizationId },
    });
    if (pubCount !== pubIds.length) {
      throw new NotFoundError('One or more selected publishers do not belong to organization');
    }

    await prisma.$transaction(async (tx) => {
      await tx.campaignPublisher.deleteMany({
        where: { campaignId },
      });

      await tx.campaignPublisher.createMany({
        data: allocations.map((a) => ({
          campaignId,
          publisherId: a.publisherId,
          allocationPct: new Prisma.Decimal(a.allocationPct),
          bidCpc: new Prisma.Decimal(a.bidCpc),
          dailyBudget: new Prisma.Decimal(a.dailyBudget),
        })),
      });
    });

    return this.getAllocations(organizationId, campaignId);
  }

  async recordSpend(
    organizationId: string,
    campaignId: string,
    data: CampaignSpendInput,
  ): Promise<void> {
    const [campaign, publisher] = await Promise.all([
      prisma.campaign.findFirst({ where: { id: campaignId, organizationId } }),
      prisma.publisher.findFirst({ where: { id: data.publisherId, organizationId } }),
    ]);

    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }
    if (!publisher) {
      throw new NotFoundError('Publisher not found');
    }

    const spendDate = new Date(data.date);

    await prisma.campaignSpend.upsert({
      where: {
        campaignId_publisherId_date: {
          campaignId,
          publisherId: data.publisherId,
          date: spendDate,
        },
      },
      update: {
        amount: new Prisma.Decimal(data.amount),
      },
      create: {
        organizationId,
        campaignId,
        publisherId: data.publisherId,
        date: spendDate,
        amount: new Prisma.Decimal(data.amount),
      },
    });
  }

  async simulateCampaign(
    organizationId: string,
    campaignId: string,
    options: { days: number; seed?: number }
  ): Promise<CampaignSimulateResponse> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: {
        job: true,
        publishers: {
          include: {
            publisher: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    if (!campaign.publishers || campaign.publishers.length === 0) {
      throw new ValidationError('Campaign has no publisher allocations configured.');
    }

    const days = Math.max(1, Math.min(90, options.days));
    const rng = createMulberry32(options.seed ?? 42);

    let eventsCreated = 0;
    let spendsCreated = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalApplications = 0;
    let totalHires = 0;
    let totalSpend = 0;

    for (let d = 0; d < days; d++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (days - 1 - d));
      targetDate.setUTCHours(12, 0, 0, 0);
      const dateStr = targetDate.toISOString().slice(0, 10);
      const cleanDate = new Date(dateStr);

      for (const cp of campaign.publishers) {
        const profile = getPublisherProfile(cp.publisher.type || cp.publisher.name);
        const bid = Number(cp.bidCpc) > 0 ? Number(cp.bidCpc) : profile.baseCpc;
        const dailyBudget =
          Number(cp.dailyBudget) > 0
            ? Number(cp.dailyBudget)
            : (Number(campaign.budget) / 30) * (Number(cp.allocationPct) / 100);

        const result = simulateDay({
          publisher: profile,
          bid,
          budget: dailyBudget,
          jobContext: {
            category: campaign.job?.category,
            location: campaign.job?.location,
            experienceLevel: campaign.job?.minExperienceYears,
          },
          rng,
          dayIndex: d,
        });

        // Event creation / upsert
        const eventTypes: Array<{
          type: 'IMPRESSION' | 'CLICK' | 'APPLICATION_START' | 'APPLICATION' | 'INTERVIEW' | 'HIRE';
          qty: number;
          qualQty?: number;
        }> = [
          { type: 'IMPRESSION', qty: result.impressions },
          { type: 'CLICK', qty: result.clicks },
          { type: 'APPLICATION_START', qty: Math.round(result.clicks * 0.7) },
          { type: 'APPLICATION', qty: result.applications, qualQty: result.qualified },
          { type: 'INTERVIEW', qty: result.interviews },
          { type: 'HIRE', qty: result.hires },
        ];

        for (const ev of eventTypes) {
          const eventId = `sim-${campaignId}-${cp.publisherId}-${ev.type}-${dateStr}`;
          await prisma.campaignEvent.upsert({
            where: { eventId },
            create: {
              eventId,
              organizationId,
              campaignId,
              publisherId: cp.publisherId,
              eventType: ev.type,
              quantity: ev.qty,
              qualifiedQuantity: ev.qualQty ?? 0,
              timestamp: targetDate,
            },
            update: {
              quantity: ev.qty,
              qualifiedQuantity: ev.qualQty ?? 0,
              timestamp: targetDate,
            },
          });
          eventsCreated++;
        }

        // Spend record upsert
        await prisma.campaignSpend.upsert({
          where: {
            campaignId_publisherId_date: {
              campaignId,
              publisherId: cp.publisherId,
              date: cleanDate,
            },
          },
          create: {
            organizationId,
            campaignId,
            publisherId: cp.publisherId,
            date: cleanDate,
            amount: new Prisma.Decimal(result.spend),
          },
          update: {
            amount: new Prisma.Decimal(result.spend),
          },
        });
        spendsCreated++;

        totalImpressions += result.impressions;
        totalClicks += result.clicks;
        totalApplications += result.applications;
        totalHires += result.hires;
        totalSpend += result.spend;
      }
    }

    return {
      campaignId,
      days,
      eventsCreated,
      spendsCreated,
      totalImpressions,
      totalClicks,
      totalApplications,
      totalHires,
      totalSpend: Math.round(totalSpend * 100) / 100,
    };
  }
}

export const campaignsService = new CampaignsService();
