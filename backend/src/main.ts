import "reflect-metadata";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  // 统一 API 前缀
  app.setGlobalPrefix("api");

  // 开启 CORS，方便前端本地开发调用
  app.enableCors();

  // 静态文件托管，将 backend/uploads 暴露为 /uploads 前缀
  app.useStaticAssets(join(__dirname, "..", "uploads"), {
    prefix: "/uploads",
  });

  await app.listen(3000);
  // eslint-disable-next-line no-console
  console.log("Backend listening on http://localhost:3000");
}

bootstrap();


