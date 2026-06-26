import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3000);
}

void bootstrap();
