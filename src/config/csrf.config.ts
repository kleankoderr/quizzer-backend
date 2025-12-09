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
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  getSessionIdentifier: (_req) => 'api-session',
}) as any;

// Override the error to be generic
Object.defineProperty(invalidCsrfTokenError, 'message', {
  value: 'Authentication failed, please try again.',
});
