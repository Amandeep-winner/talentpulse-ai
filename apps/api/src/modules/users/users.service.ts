import bcrypt from 'bcryptjs';
import { CreateUserRequest, Role, UserProfile } from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { ConflictError, NotFoundError, ForbiddenError } from '../../lib/errors/AppError';

const BCRYPT_SALT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;

export class UsersService {
  async listUsers(organizationId: string): Promise<UserProfile[]> {
    const users = await prisma.user.findMany({
      where: { organizationId },
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      organizationId: u.organizationId,
      organizationName: u.organization.name,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async createUser(organizationId: string, input: CreateUserRequest): Promise<UserProfile> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        organizationId,
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: input.role,
      },
      include: { organization: true },
    });

    return {
      id: user.id,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateUserRole(
    organizationId: string,
    targetUserId: string,
    newRole: Role,
    currentUserId: string,
  ): Promise<UserProfile> {
    const user = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundError('User not found in your organization');
    }

    if (targetUserId === currentUserId && newRole !== 'ADMIN') {
      throw new ForbiddenError('You cannot demote yourself from the ADMIN role');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      include: { organization: true },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      organizationName: updated.organization.name,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async deleteUser(
    organizationId: string,
    targetUserId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    if (targetUserId === currentUserId) {
      throw new ForbiddenError('You cannot delete your own account');
    }

    const user = await prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });

    if (!user) {
      throw new NotFoundError('User not found in your organization');
    }

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    return { message: 'User deleted successfully' };
  }
}

export const usersService = new UsersService();
