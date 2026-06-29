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
  controllers: [HealthController, JobsController, ArticlesController, SourceConfigsController],
  providers: [
    ...databaseProviders,
    ...queueProviders,
    ArticlesService,
    JobsService,
    SourceConfigsService
  ]
})
export class AppModule {}
