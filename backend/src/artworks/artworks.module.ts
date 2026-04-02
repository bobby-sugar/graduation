import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ArtworksService } from "./artworks.service";
import { ArtworksController } from "./artworks.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ArtworksController],
  providers: [ArtworksService],
})
export class ArtworksModule {}

