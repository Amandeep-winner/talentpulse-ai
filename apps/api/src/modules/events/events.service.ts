import { Prisma } from '@prisma/client';
import {
  EventInput,
  EventType,
  EventsIngestionResponse,
  EventItem,
  PaginationMeta,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';

export class EventsService {
  async ingestEvents(
    organizationId: string,
    events: EventInput[],
  ): Promise<EventsIngestionResponse> {
    const rejected: Array<{ eventId: string; reason: string }> = [];
    let duplicates = 0;

    // 1. Funnel ordering sanity check
    const formatValidEvents: EventInput[] = [];
    for (const event of events) {
      const qty = event.quantity !== undefined ? event.quantity : 1;
      const qualQty = event.qualifiedQuantity !== undefined ? event.qualifiedQuantity : 0;

      if (event.eventType === 'APPLICATION' && qualQty > qty) {
        rejected.push({
          eventId: event.eventId,
          reason: 'qualifiedQuantity cannot exceed quantity for APPLICATION event',
        });
        continue;
      }

      formatValidEvents.push(event);
    }

    if (formatValidEvents.length === 0) {
      return { accepted: 0, duplicates: 0, rejected };
    }

    // 2. Verify all campaigns and publishers belong to organization
    const campaignIds = Array.from(new Set(formatValidEvents.map((e) => e.campaignId)));
    const publisherIds = Array.from(new Set(formatValidEvents.map((e) => e.publisherId)));

    const [validCampaigns, validPublishers] = await Promise.all([
      prisma.campaign.findMany({
        where: { id: { in: campaignIds }, organizationId },
        select: { id: true },
      }),
      prisma.publisher.findMany({
        where: { id: { in: publisherIds }, organizationId },
        select: { id: true },
      }),
    ]);

    const validCampaignSet = new Set(validCampaigns.map((c) => c.id));
    const validPublisherSet = new Set(validPublishers.map((p) => p.id));

    const orgValidEvents: EventInput[] = [];
    for (const event of formatValidEvents) {
      if (!validCampaignSet.has(event.campaignId)) {
        rejected.push({
          eventId: event.eventId,
          reason: `Campaign ${event.campaignId} does not exist or belong to organization`,
        });
        continue;
      }
      if (!validPublisherSet.has(event.publisherId)) {
        rejected.push({
          eventId: event.eventId,
          reason: `Publisher ${event.publisherId} does not exist or belong to organization`,
        });
        continue;
      }
      orgValidEvents.push(event);
    }

    if (orgValidEvents.length === 0) {
      return { accepted: 0, duplicates: 0, rejected };
    }

    // 3. Deduplication: Check against database for already ingested eventIds
    const allEventIds = orgValidEvents.map((e) => e.eventId);
    const existingEvents = await prisma.campaignEvent.findMany({
      where: { eventId: { in: allEventIds } },
      select: { eventId: true },
    });
    const existingDbSet = new Set(existingEvents.map((e) => e.eventId));

    // Deduplicate within the current batch and against existing DB records
    const seenInBatch = new Set<string>();
    const toInsertData: Prisma.CampaignEventCreateManyInput[] = [];

    for (const event of orgValidEvents) {
      if (existingDbSet.has(event.eventId) || seenInBatch.has(event.eventId)) {
        duplicates += 1;
        continue;
      }

      seenInBatch.add(event.eventId);
      toInsertData.push({
        eventId: event.eventId,
        organizationId,
        campaignId: event.campaignId,
        publisherId: event.publisherId,
        eventType: event.eventType,
        quantity: event.quantity !== undefined ? event.quantity : 1,
        qualifiedQuantity: event.qualifiedQuantity !== undefined ? event.qualifiedQuantity : 0,
        timestamp: new Date(event.timestamp),
        metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
      });
    }

    let accepted = 0;
    if (toInsertData.length > 0) {
      // createMany with skipDuplicates handles any concurrent race conditions
      const insertResult = await prisma.campaignEvent.createMany({
        data: toInsertData,
        skipDuplicates: true,
      });
      accepted = insertResult.count;
      // If concurrent insert created some in the split second, increment duplicates
      duplicates += toInsertData.length - accepted;
    }

    return {
      accepted,
      duplicates,
      rejected,
    };
  }

  async listEvents(
    organizationId: string,
    query: {
      campaignId?: string;
      publisherId?: string;
      eventType?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ events: EventItem[]; meta: PaginationMeta }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.CampaignEventWhereInput = {
      organizationId,
    };

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }
    if (query.publisherId) {
      where.publisherId = query.publisherId;
    }
    if (query.eventType) {
      where.eventType = query.eventType as EventType;
    }

    const [total, records] = await Promise.all([
      prisma.campaignEvent.count({ where }),
      prisma.campaignEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    return {
      events: records.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        organizationId: r.organizationId,
        campaignId: r.campaignId,
        publisherId: r.publisherId,
        eventType: r.eventType,
        quantity: r.quantity,
        qualifiedQuantity: r.qualifiedQuantity,
        timestamp: r.timestamp.toISOString(),
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }
}

export const eventsService = new EventsService();
