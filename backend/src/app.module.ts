import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { ArtworksModule } from "./artworks/artworks.module";
import { CommentsModule } from "./comments/comments.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { UploadModule } from "./upload/upload.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 400 },
    ]),
    PrismaModule,
    ArtworksModule,
    CommentsModule,
    AuthModule,
    UsersModule,
    CommissionsModule,
    ConversationsModule,
    UploadModule,
    NotificationsModule,
  ],
})
export class AppModule {}

