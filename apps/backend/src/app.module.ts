import { join } from "path";
import "./config/load-env.js";
import { Module } from "@nestjs/common";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ArticlesController } from "./articles/articles.controller.js";
import { ArticlesService } from "./articles/articles.service.js";
import { databaseProviders } from "./database/database.providers.js";
import { HealthController } from "./health.controller.js";
import { JobsController } from "./jobs/jobs.controller.js";
import { JobsService } from "./jobs/jobs.service.js";
import { NewsDataController } from "./newsdata/newsdata.controller.js";
import { NewsDataService } from "./newsdata/newsdata.service.js";
import { FailureLogsController } from "./operations/failure-logs.controller.js";
import { FailureLogsService } from "./operations/failure-logs.service.js";
import { QueueStatusController } from "./operations/queue-status.controller.js";
import { QueueStatusService } from "./operations/queue-status.service.js";
import { PublishController } from "./publish/publish.controller.js";
import { PublishService } from "./publish/publish.service.js";
import { queueProviders } from "./queue/queue.providers.js";
import { SourceConfigsController } from "./source-configs/source-configs.controller.js";
import { SourceConfigsService } from "./source-configs/source-configs.service.js";

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), "uploads"),
      serveRoot: "/uploads",
      serveStaticOptions: {
        index: false,
        fallthrough: false,
      },
    }),
  ],
  controllers: [
    HealthController,
    JobsController,
    NewsDataController,
    ArticlesController,
    SourceConfigsController,
    PublishController,
    QueueStatusController,
    FailureLogsController
  ],
  providers: [
    ...databaseProviders,
    ...queueProviders,
    ArticlesService,
    JobsService,
    NewsDataService,
    SourceConfigsService,
    PublishService,
    QueueStatusService,
    FailureLogsService
  ]
})
export class AppModule {}
