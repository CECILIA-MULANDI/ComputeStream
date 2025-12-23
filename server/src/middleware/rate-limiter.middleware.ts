/**
 * Rate Limiting Middleware
 * 
 * Protects API endpoints from abuse by limiting request rates per IP address.
 */

import rateLimit from "express-rate-limit";

/**
 * General API rate limiter
 * Allows 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for sensitive operations
 * Allows 10 requests per 15 minutes per IP
 * Use for: registration, job creation, payments
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict rate limiter for critical operations
 * Allows 20 requests per hour per IP (relaxed for development)
 * Use for: provider registration, large payments
 */
export const veryStrictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 requests per hour (increased for development)
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Discovery/browsing rate limiter
 * Allows 200 requests per 15 minutes per IP
 * Use for: listing providers, browsing jobs
 */
export const discoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

