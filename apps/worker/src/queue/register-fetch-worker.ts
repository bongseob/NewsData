import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";

export function registerFetchWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    QUEUE_NAMES.fetch,
    async (job) => {
      console.log(`fetch job accepted: ${job.id}`);
    },
    { connection }
  );
}
