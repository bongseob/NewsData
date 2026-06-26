import type { ConnectionOptions } from "bullmq";

export function createQueueConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    maxRetriesPerRequest: null
  };
}
