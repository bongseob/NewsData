export const QUEUE_NAMES = {
  fetch: "fetch",
  process: "process",
  publish: "publish",
  callback: "callback"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
