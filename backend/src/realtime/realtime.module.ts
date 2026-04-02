import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ChatGateway } from "./chat.gateway";
import { ChatPushService } from "./chat-push.service";

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ChatGateway, ChatPushService],
  exports: [ChatGateway, ChatPushService],
})
export class RealtimeModule {}
