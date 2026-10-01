export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: ErrorDetail[];

  constructor(message: string, statusCode: number, code: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: ErrorDetail[]) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHENTICATED');
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitedError';
  }
}

export class AiOutputError extends AppError {
  constructor(message: string = 'Failed to generate valid output from AI model', details?: ErrorDetail[]) {
    super(message, 502, 'AI_INVALID_OUTPUT', details);
    this.name = 'AiOutputError';
  }
}

export class UpstreamUnavailableError extends AppError {
  constructor(message: string = 'Upstream service unavailable') {
    super(message, 503, 'UPSTREAM_UNAVAILABLE');
    this.name = 'UpstreamUnavailableError';
  }
}

export class SqlRejectedError extends AppError {
  constructor(message: string = 'SQL query rejected by safety guardrails', details?: ErrorDetail[]) {
    super(message, 422, 'SQL_REJECTED', details);
    this.name = 'SqlRejectedError';
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'An internal server error occurred') {
    super(message, 500, 'INTERNAL');
    this.name = 'InternalError';
  }
}
