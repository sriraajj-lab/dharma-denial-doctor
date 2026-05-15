/**
 * Simple in-memory rate limiter for API routes
 * Limits: 100 requests per minute per IP (configurable)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;  // Max requests per window
  windowMs: number;     // Window size in milliseconds
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;

  let entry = store.get(key);

  // Create new entry if doesn't exist or window expired
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + config.windowMs };
    store.set(key, entry);
  }

  entry.count++;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

/**
 * Get client IP from request headers (works with Vercel, Cloudflare, etc.)
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  return '127.0.0.1';
}

/**
 * Rate limit response helper
 */
export function rateLimitResponse(resetAt: number) {
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    }
  );
}
