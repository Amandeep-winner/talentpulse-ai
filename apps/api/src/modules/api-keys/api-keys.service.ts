import crypto from 'crypto';
import { CreateApiKeyRequest, CreateApiKeyResponse, ApiKeyItem } from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors/AppError';

export class ApiKeysService {
  async createKey(organizationId: string, input: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const randomHex = crypto.randomBytes(24).toString('hex');
    const plaintextKey = `tp_live_${randomHex}`;
    const keyPrefix = plaintextKey.slice(0, 12); // e.g. 'tp_live_abcd'
    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

    const record = await prisma.apiKey.create({
      data: {
        organizationId,
        name: input.name,
        keyPrefix,
        keyHash,
      },
    });

    const apiKey: ApiKeyItem = {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    };

    return {
      apiKey,
      plaintextKey,
    };
  }

  async listKeys(organizationId: string): Promise<ApiKeyItem[]> {
    const keys = await prisma.apiKey.findMany({
      where: {
        organizationId,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  async revokeKey(organizationId: string, keyId: string): Promise<{ message: string }> {
    const key = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organizationId,
      },
    });

    if (!key) {
      throw new NotFoundError('API key not found in your organization');
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    return { message: 'API key revoked successfully' };
  }
}

export const apiKeysService = new ApiKeysService();
