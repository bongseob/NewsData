export const ARTICLE_STATUSES = {
  draft: "DRAFT",
  readyToPublish: "READY_TO_PUBLISH",
  embargoed: "EMBARGOED",
  publishing: "PUBLISHING",
  published: "PUBLISHED",
  failed: "FAILED",
  deleted: "DELETED"
} as const;

export type ArticleStatus = (typeof ARTICLE_STATUSES)[keyof typeof ARTICLE_STATUSES];

export const ARTICLE_REVIEW_STATES = {
  pending: "PENDING",
  selected: "SELECTED",
  excluded: "EXCLUDED"
} as const;

export type ArticleReviewState =
  (typeof ARTICLE_REVIEW_STATES)[keyof typeof ARTICLE_REVIEW_STATES];

export const JOB_STATUSES = {
  prepared: "PREPARED",
  pending: "PENDING",
  running: "RUNNING",
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  retrying: "RETRYING",
  canceled: "CANCELED"
} as const;

export type JobStatus = (typeof JOB_STATUSES)[keyof typeof JOB_STATUSES];

export const PUBLISH_FAILED_STEPS = {
  login: "LOGIN",
  openForm: "OPEN_FORM",
  fillForm: "FILL_FORM",
  uploadImage: "UPLOAD_IMAGE",
  submit: "SUBMIT",
  verify: "VERIFY"
} as const;

export type PublishFailedStep =
  (typeof PUBLISH_FAILED_STEPS)[keyof typeof PUBLISH_FAILED_STEPS];
