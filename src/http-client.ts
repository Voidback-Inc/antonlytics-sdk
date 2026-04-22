/**
 * HTTP client for making requests to Antonlytics API.
 */

import { APIError, AuthenticationError, AntonlyticsError } from './exceptions';

export class HTTPClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'antonlytics-js/2.0.0'
    };

    const options: RequestInit = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      // Handle different status codes
      if (response.status === 401) {
        throw new AuthenticationError('Invalid API key or unauthorized');
      } else if (response.status === 403) {
        throw new AuthenticationError('Access forbidden');
      } else if (response.status === 404) {
        throw new APIError(`Resource not found: ${path}`, 404);
      } else if (response.status === 429) {
        throw new APIError('Rate limit exceeded', 429);
      } else if (response.status >= 500) {
        throw new APIError(`Server error: ${response.status}`, response.status);
      } else if (!response.ok) {
        let message: string;
        try {
          const errorData = await response.json();
          message = errorData.error || errorData.detail || response.statusText;
        } catch {
          message = response.statusText;
        }
        throw new APIError(`API error (${response.status}): ${message}`, response.status);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof AntonlyticsError) {
        throw error;
      }
      throw new AntonlyticsError(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.makeRequest<T>('GET', path);
  }

  async post<T>(path: string, data: any): Promise<T> {
    return this.makeRequest<T>('POST', path, data);
  }

  async patch<T>(path: string, data: any): Promise<T> {
    return this.makeRequest<T>('PATCH', path, data);
  }

  async delete<T>(path: string): Promise<T> {
    return this.makeRequest<T>('DELETE', path);
  }
}
