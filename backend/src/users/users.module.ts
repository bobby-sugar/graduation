import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ArtworksModule } from "../artworks/artworks.module";
import { UsersService } from "./users.service";
import { FollowsService } from "./follows.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [PrismaModule, AuthModule, RealtimeModule, ArtworksModule],
  providers: [UsersService, FollowsService],
  controllers: [UsersController],
})
export class UsersModule {}

