export const JOB_TRIGGER_TYPES = {
  manual: "MANUAL",
  schedule: "SCHEDULE"
} as const;

export type JobTriggerType =
  (typeof JOB_TRIGGER_TYPES)[keyof typeof JOB_TRIGGER_TYPES];
