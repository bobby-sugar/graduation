import { Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { NotificationsService, NotificationType } from "./notifications.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GetUser } from "../auth/get-user.decorator";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findLikesAndComments(
    @GetUser() user: { id: number },
    @Query("unreadOnly") unreadOnly?: string,
    @Query("type") type?: NotificationType,
  ) {
    return this.notificationsService.findLikesAndComments(user.id, {
      unreadOnly: unreadOnly === "true",
      onlyType: type,
    });
  }

  @Get("unread-count")
  unreadCount(@GetUser() user: { id: number }) {
    return this.notificationsService.unreadLikesCommentsCount(user.id);
  }

  @Patch(":id/read")
  markRead(@GetUser() user: { id: number }, @Param("id", ParseIntPipe) id: number) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Patch("read-all")
  markAllRead(@GetUser() user: { id: number }) {
    return this.notificationsService.markAllRead(user.id);
  }
}

