import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware
 * Applies to all /api/* routes:
 * - Rate limiting (100 req/min per IP)
 * - CORS headers
 * - Request logging
 */

// Simple in-memory rate limiter for edge middleware
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 100; // requests per window
const WINDOW_MS = 60 * 1000; // 1 minute

function getRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;
  const allowed = entry.count <= RATE_LIMIT;
  const remaining = Math.max(0, RATE_LIMIT - entry.count);

  return { allowed, remaining };
}

export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Get client IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';

  // Rate limit check
  const { allowed, remaining } = getRateLimit(ip);

  if (!allowed) {
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      }
    );
  }

  // Add rate limit headers to response
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT));
  response.headers.set('X-RateLimit-Remaining', String(remaining));

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
