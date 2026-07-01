import { Queue, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";
import { getNumberEnv } from "../config/env.js";
import {
  CONTENT_QUEUE,
  FETCH_QUEUE,
  IMAGE_QUEUE,
  TRANSLATE_QUEUE
} from "./queue.tokens.js";

function createRedisConnectionOptions(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: getNumberEnv("REDIS_PORT", 6379),
    maxRetriesPerRequest: null
  };
}

export const queueProviders = [
  {
    provide: FETCH_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.fetch, {
        connection: createRedisConnectionOptions()
      });
    }
  },
  {
    provide: TRANSLATE_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.translate, {
        connection: createRedisConnectionOptions()
      });
    }
  },
  {
    provide: IMAGE_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.image, {
        connection: createRedisConnectionOptions()
      });
    }
  },
  {
    provide: CONTENT_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.content, {
        connection: createRedisConnectionOptions()
      });
    }
  }
];
