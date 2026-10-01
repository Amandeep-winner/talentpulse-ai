import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RegisterRequest, LoginRequest, AuthResponse, UserProfile } from '@talentpulse/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { ConflictError, UnauthenticatedError } from '../../lib/errors/AppError';
import { AuthUser } from '../../middleware/auth';

const BCRYPT_SALT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] },
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export class AuthService {
  async register(input: RegisterRequest): Promise<AuthResponse & { refreshToken: string }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const organization = await prisma.organization.create({
      data: {
        name: input.organizationName,
      },
    });

    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: 'ADMIN',
      },
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        expiresAt,
      },
    });

    const userProfile: UserProfile = {
      id: user.id,
      organizationId: organization.id,
      organizationName: organization.name,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    const accessToken = generateAccessToken(user);

    return {
      user: userProfile,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async login(input: LoginRequest): Promise<AuthResponse & { refreshToken: string }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthenticatedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthenticatedError('Invalid email or password');
    }

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        expiresAt,
      },
    });

    const userProfile: UserProfile = {
      id: user.id,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    const accessToken = generateAccessToken(user);

    return {
      user: userProfile,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async refresh(rawRefreshToken: string): Promise<AuthResponse & { refreshToken: string }> {
    if (!rawRefreshToken) {
      throw new UnauthenticatedError('Refresh token required');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { organization: true } } },
    });

    if (!tokenRecord) {
      throw new UnauthenticatedError('Invalid refresh token');
    }

    // Reuse detection: if the token is already revoked, revoke the entire family!
    if (tokenRecord.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthenticatedError('Invalid refresh token: token reuse detected, session terminated');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthenticatedError('Refresh token has expired');
    }

    // Revoke old token and rotate
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: tokenRecord.userId,
        familyId: tokenRecord.familyId,
        tokenHash: newTokenHash,
        expiresAt,
      },
    });

    const user = tokenRecord.user;
    const userProfile: UserProfile = {
      id: user.id,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };

    const accessToken = generateAccessToken(user);

    return {
      user: userProfile,
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (tokenRecord) {
      await prisma.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId },
        data: { revokedAt: new Date() },
      });
    }
  }

  async getMe(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthenticatedError('User not found');
    }

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
}

export const authService = new AuthService();
