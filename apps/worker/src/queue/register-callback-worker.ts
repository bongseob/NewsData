import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";

export function registerCallbackWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    QUEUE_NAMES.callback,
    async (job) => {
      console.log(`callback job accepted: ${job.id}`);
    },
    { connection }
  );
}
