/**
 * Custom exceptions for Antonlytics SDK.
 */

/**
 * Base exception for all Antonlytics SDK errors.
 */
export class AntonlyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AntonlyticsError';
    Object.setPrototypeOf(this, AntonlyticsError.prototype);
  }
}

/**
 * Exception raised for API errors.
 */
export class APIError extends AntonlyticsError {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

/**
 * Exception raised for authentication errors.
 */
export class AuthenticationError extends AntonlyticsError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}
