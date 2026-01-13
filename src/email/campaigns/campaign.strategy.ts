import { User } from '@prisma/client';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface CampaignStrategy {
  readonly id: string;
  readonly description: string;

  /**
   * CRON expression for when this campaign runs.
   */
  getCronExpression(): string;

  /**
   * Checks if global or campaign-specific settings enable this campaign.
   */
  isEnabled(): Promise<boolean>;

  /**
   * Returns the query or list of users eligible for this campaign.
   * This encapsulates the "Business Logic" of who gets the email.
   */
  getEligibleUsers(): Promise<Partial<User>[]>;

  /**
   * Generates the email content for a specific user.
   */
  renderEmail(user: Partial<User>): Promise<EmailContent>;

  /**
   * Time-to-live for the "sent" cache key in days.
   * e.g., 30 means "don't send this campaign to this user again for 30 days"
   */
  getDeduplicationTtlDays(): number;

  /**
   * Optional batch size for processing. Defaults to 50 if not specified.
   */
  getBatchSize?(): number;
}
