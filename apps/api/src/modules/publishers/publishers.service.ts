import { Publisher } from '@prisma/client';
import {
  CreatePublisherRequest,
  UpdatePublisherRequest,
  PublisherItem,
  PublisherType,
} from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ConflictError } from '../../lib/errors/AppError';

function mapPublisherToItem(p: Publisher): PublisherItem {
  return {
    id: p.id,
    organizationId: p.organizationId,
    name: p.name,
    type: p.type as PublisherType,
  };
}

export class PublishersService {
  async listPublishers(organizationId: string): Promise<PublisherItem[]> {
    const publishers = await prisma.publisher.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return publishers.map(mapPublisherToItem);
  }

  async getPublisher(organizationId: string, id: string): Promise<PublisherItem> {
    const publisher = await prisma.publisher.findFirst({
      where: { id, organizationId },
    });
    if (!publisher) {
      throw new NotFoundError('Publisher not found');
    }
    return mapPublisherToItem(publisher);
  }

  async createPublisher(
    organizationId: string,
    data: CreatePublisherRequest,
  ): Promise<PublisherItem> {
    const existing = await prisma.publisher.findFirst({
      where: {
        organizationId,
        name: { equals: data.name.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictError('Publisher with this name already exists');
    }

    const publisher = await prisma.publisher.create({
      data: {
        organizationId,
        name: data.name.trim(),
        type: data.type,
      },
    });

    return mapPublisherToItem(publisher);
  }

  async updatePublisher(
    organizationId: string,
    id: string,
    data: UpdatePublisherRequest,
  ): Promise<PublisherItem> {
    const publisher = await prisma.publisher.findFirst({
      where: { id, organizationId },
    });
    if (!publisher) {
      throw new NotFoundError('Publisher not found');
    }

    if (data.name && data.name.trim().toLowerCase() !== publisher.name.toLowerCase()) {
      const existing = await prisma.publisher.findFirst({
        where: {
          organizationId,
          name: { equals: data.name.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictError('Publisher with this name already exists');
      }
    }

    const updated = await prisma.publisher.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.type ? { type: data.type } : {}),
      },
    });

    return mapPublisherToItem(updated);
  }
}

export const publishersService = new PublishersService();
