import { SetMetadata } from '@nestjs/common';
import { QuotaFeature } from '../services/quota.service';

export const QUOTA_FEATURE_KEY = 'quotaFeature';
export const CheckQuota = (feature: QuotaFeature) =>
  SetMetadata(QUOTA_FEATURE_KEY, feature);
