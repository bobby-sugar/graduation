import { Module } from "@nestjs/common";
import { CommissionsService } from "./commissions.service";
import { CommissionsController } from "./commissions.controller";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, RealtimeModule],
  providers: [CommissionsService],
  controllers: [CommissionsController],
  exports: [CommissionsService],
})
export class CommissionsModule {}

