export interface SessionData {
  userId: string;
  email: string;
  token: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export interface CreateSessionDto {
  userId: string;
  email: string;
  token: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}
