import "./config/load-env.js";
import { QUEUE_NAMES } from "@newsdata/shared";
import { createQueueConnection } from "./queue/connection.js";
import { registerCallbackWorker } from "./queue/register-callback-worker.js";
import { registerFetchWorker } from "./queue/register-fetch-worker.js";
import { registerProcessWorker } from "./queue/register-process-worker.js";
import { registerPublishWorker } from "./queue/register-publish-worker.js";

const connection = createQueueConnection();

registerFetchWorker(connection);
registerProcessWorker(connection);
registerPublishWorker(connection);
registerCallbackWorker(connection);

console.log(
  `Worker started for queues: ${Object.values(QUEUE_NAMES).join(", ")}`
);
