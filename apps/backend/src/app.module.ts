import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { JobsController } from "./jobs/jobs.controller.js";

@Module({
  controllers: [HealthController, JobsController]
})
export class AppModule {}
