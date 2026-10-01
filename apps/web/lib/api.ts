import { ApiErrorResponse } from '@talentpulse/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  public readonly code: string;
  public readonly details?: Array<{ path: string; message: string }>;
  public readonly requestId?: string;
  public readonly status: number;

  constructor(status: number, errorData: ApiErrorResponse['error']) {
    super(errorData.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = errorData.code;
    this.details = errorData.details;
    this.requestId = errorData.requestId;
  }
}

let isRefreshing = false;
let refreshSubscribers: Array<(tokenRefreshed: boolean) => void> = [];

function subscribeTokenRefresh(cb: (tokenRefreshed: boolean) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

async function refreshAuth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface RequestOptions extends RequestInit {
  retryOn401?: boolean;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { retryOn401 = true, headers, ...restOptions } = options;
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Content-Type') && !(restOptions.body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...restOptions,
    credentials: 'include',
    headers: requestHeaders,
  });

  if (response.status === 401 && retryOn401 && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
    if (!isRefreshing) {
      isRefreshing = true;
      const refreshed = await refreshAuth();
      isRefreshing = false;
      onRefreshed(refreshed);

      if (refreshed) {
        return apiClient<T>(endpoint, { ...options, retryOn401: false });
      }
    } else {
      const refreshed = await new Promise<boolean>((resolve) => {
        subscribeTokenRefresh(resolve);
      });
      if (refreshed) {
        return apiClient<T>(endpoint, { ...options, retryOn401: false });
      }
    }
  }

  if (!response.ok) {
    let errorData: ApiErrorResponse['error'];
    try {
      const json = await response.json();
      errorData = json.error || {
        code: 'HTTP_ERROR',
        message: response.statusText || 'An unexpected error occurred',
      };
    } catch {
      errorData = {
        code: 'HTTP_ERROR',
        message: response.statusText || 'An unexpected error occurred',
      };
    }
    throw new ApiError(response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  get: <T>(url: string, options?: RequestOptions) =>
    apiClient<T>(url, { method: 'GET', ...options }),
  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(url, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(url, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    apiClient<T>(url, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
      ...options,
    }),
  delete: <T>(url: string, options?: RequestOptions) =>
    apiClient<T>(url, { method: 'DELETE', ...options }),
};
