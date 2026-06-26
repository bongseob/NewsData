import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";

export function registerPublishWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    QUEUE_NAMES.publish,
    async (job) => {
      console.log(`publish job accepted: ${job.id}`);
    },
    { connection }
  );
}
