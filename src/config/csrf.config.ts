import { doubleCsrf } from 'csrf-csrf';

export const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () =>
    process.env.CSRF_SECRET || 'complex-secret-key-should-be-in-env',
  cookieName: 'x-csrf-token',
  cookieOptions: {
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    httpOnly: false, // Must be false so frontend can read it
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => {
    // Support both header and body for better compatibility
    return req.headers['x-csrf-token'] || req.body?._csrf;
  },
  getSessionIdentifier: (_req) => 'api-session',
}) as any;

// Override the error to be generic
Object.defineProperty(invalidCsrfTokenError, 'message', {
  value: 'Authentication failed, please try again.',
});
