/**
 * Central error handling and sanitization for the LiteLLM backend.
 *
 * Ensures that:
 * - Upstream auth failures (401/403) don't log out Backstage sessions
 * - Upstream 5xx errors are generic and don't leak implementation details
 * - Upstream 4xx errors are sanitized and capped
 * - Non-JSON error bodies are not embedded in responses
 * - All error logging happens server-side only
 */

import { Response } from 'express';
import { LiteLLMUpstreamError } from './client';

/** Regex to find HTML-like tags and entities. */
const HTML_TAG_PATTERN = /<[^>]*>|&[a-z]+;/gi;

/**
 * Sanitizes a message by:
 * - Stripping HTML tags
 * - Collapsing consecutive whitespace
 * - Truncating to 500 characters
 *
 * @param msg The raw message (may contain HTML, newlines, etc.)
 * @returns A safe, printable message
 */
export function sanitizeUpstreamMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return '';

  return msg
    .replace(HTML_TAG_PATTERN, '') // Strip HTML tags and entities
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .slice(0, 500);
}

/**
 * Maps any error type to an HTTP response shape {status, body}.
 *
 * Behaviour:
 * - LiteLLMUpstreamError 401/403 → 502 generic (prevent session logout)
 * - LiteLLMUpstreamError 5xx or network → 502 generic
 * - LiteLLMUpstreamError 4xx (other) → 400 with sanitized message + param if present
 * - KeyServiceError / ProvisioningError / objects with status+body → pass through
 * - Backstage-style errors (name: InputError/NotAllowedError/NotFoundError/ConflictError) → map to 400/403/404/409
 * - Anything else → 500 (message logged server-side, not returned)
 *
 * @returns {status, body, logLevel} for HTTP response; undefined _logMessage is only present for 500s
 */
export function toHttpError(error: unknown): {
  status: number;
  body: Record<string, unknown>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  _logMessage?: string;
} {
  // KeyServiceError and ProvisioningError have status + body fields — pass through.
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'body' in error &&
    typeof (error as any).status === 'number'
  ) {
    return {
      status: (error as any).status,
      body: (error as any).body,
      logLevel: 'warn',
    };
  }

  // LiteLLMUpstreamError
  if (error instanceof LiteLLMUpstreamError) {
    // 401/403 from upstream → don't expose; map to 502 so Backstage session isn't logged out
    if (error.status === 401 || error.status === 403) {
      return {
        status: 502,
        body: { error: 'LiteLLM rejected the request' },
        logLevel: 'warn',
      };
    }

    // 5xx or other network errors → generic 502
    if (error.status >= 500 || error.status < 100) {
      return {
        status: 502,
        body: { error: 'LiteLLM is unavailable' },
        logLevel: 'error',
      };
    }

    // 4xx (other than 401/403) → sanitized message and param. Not-found and
    // conflict keep their meaning; everything else collapses to 400.
    return {
      status: error.status === 404 || error.status === 409 ? error.status : 400,
      body: {
        error: sanitizeUpstreamMessage(error.message),
        ...(error.param ? { param: error.param } : {}),
      },
      logLevel: 'warn',
    };
  }

  // Backstage-style errors (name field)
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    'message' in error
  ) {
    const name = (error as any).name;
    const message = String((error as any).message);

    if (name === 'InputError') {
      return {
        status: 400,
        body: { error: message },
        logLevel: 'warn',
      };
    }
    if (name === 'NotAllowedError') {
      return {
        status: 403,
        body: { error: message },
        logLevel: 'warn',
      };
    }
    if (name === 'NotFoundError') {
      return {
        status: 404,
        body: { error: message },
        logLevel: 'warn',
      };
    }
    if (name === 'ConflictError') {
      return {
        status: 409,
        body: { error: message },
        logLevel: 'warn',
      };
    }
  }

  // Fallback: 500 with no message in response
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    body: { error: 'Internal error' },
    logLevel: 'error',
    _logMessage: message,
  };
}

/**
 * Express error handler helper. Logs the real error server-side and responds
 * via toHttpError.
 *
 * @param res Express Response object
 * @param error The caught error (any type)
 * @param logger Logger instance with error/warn/info/debug methods
 * @param context Contextual label for the log entry (e.g. 'fetch user info')
 */
export function sendError(
  res: Response,
  error: unknown,
  logger: any,
  context: string,
): void {
  const { status, body, logLevel, _logMessage } = toHttpError(error);

  const realMessage = _logMessage || (error instanceof Error ? error.message : String(error));
  if (logLevel === 'error') {
    logger.error(`Failed to ${context}`, error instanceof Error ? error : new Error(String(error)));
  } else if (logLevel === 'warn') {
    logger.warn(`${context}: ${realMessage}`);
  } else {
    logger.info(`${context}: ${realMessage}`);
  }

  res.status(status).json(body);
}
