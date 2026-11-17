/**
 * Platform settings with typed defaults. Values live in the `settings` table
 * and are editable from /admin/settings without a deploy. Kept here (rather
 * than in the service) so the seed script and tests can import them without
 * pulling in server-only modules.
 */
export const SETTING_DEFAULTS = {
  "institute.name": "Globify Tech",
  "institute.currency": "PKR",
  "institute.timezone": "Asia/Karachi",
  "institute.supportEmail": "info@globifytech.com",
  "institute.whatsapp": "+92 339 1110172",
  "attendance.warningPercent": 75,
  "attendance.criticalPercent": 60,
  "completion.defaultMinQuizPercent": 60,
  "completion.autoIssueCertificate": true,
  "certificates.signatoryName": "Director, Globify Tech",
  "certificates.prefix": "GT",
  "finance.invoiceDueDays": 7,
  "finance.reminderDaysBefore": 3,
  "risk.inactiveDaysHigh": 10,
  "risk.inactiveDaysMedium": 5,
  "gamification.enabled": true,
  "community.requireApproval": false,
  "seo.defaultOgImage": "",
  "ai.tutorEnabled": true,
  "ai.courseBuilderEnabled": true,
  "ai.adminAssistantEnabled": true,
  "features.applyOnline": true,
  "features.jobsBoard": true,
  "features.portfolio": true,
  "referrals.enabled": true,
  "referrals.friendDiscountPercent": 10,
  "referrals.referrerDiscountPercent": 10,
  "referrals.couponValidDays": 90,
  "referrals.paidCoursesOnly": true,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K];
