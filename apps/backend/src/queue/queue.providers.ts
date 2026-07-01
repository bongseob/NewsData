import { Queue, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES } from "@newsdata/shared";
import { getNumberEnv } from "../config/env.js";
import {
  CALLBACK_QUEUE,
  CONTENT_QUEUE,
  FETCH_QUEUE,
  IMAGE_QUEUE,
  PROCESS_QUEUE,
  PUBLISH_QUEUE,
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
    provide: PROCESS_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.process, {
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
  },
  {
    provide: PUBLISH_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.publish, {
        connection: createRedisConnectionOptions()
      });
    }
  },
  {
    provide: CALLBACK_QUEUE,
    useFactory(): Queue {
      return new Queue(QUEUE_NAMES.callback, {
        connection: createRedisConnectionOptions()
      });
    }
  }
];
