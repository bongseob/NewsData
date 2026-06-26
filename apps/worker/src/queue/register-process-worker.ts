import { Worker, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";

export function registerProcessWorker(connection: ConnectionOptions): Worker {
  return new Worker(
    QUEUE_NAMES.process,
    async (job) => {
      console.log(`process job accepted: ${job.id}`);
    },
    { connection }
  );
}
