import "reflect-metadata";
import { join } from "path";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  // 统一 API 前缀
  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const corsOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors(
    corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : { origin: true },
  );

  // 静态文件托管，将 backend/uploads 暴露为 /uploads 前缀
  app.useStaticAssets(join(__dirname, "..", "uploads"), {
    prefix: "/uploads",
  });

  await app.listen(3000);
  // eslint-disable-next-line no-console
  console.log("Backend listening on http://localhost:3000");
}

bootstrap();


