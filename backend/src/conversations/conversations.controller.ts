import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GetUser } from "../auth/get-user.decorator";

@Controller("conversations")
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@GetUser() user: { id: number }) {
    return this.conversationsService.findAll(user.id);
  }

  @Post()
  getOrCreate(
    @GetUser() user: { id: number },
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.getOrCreate(user.id, dto);
  }

  @Get("commission-applications")
  getCommissionApplications(@GetUser() user: { id: number }) {
    return this.conversationsService.getCommissionApplications(user.id);
  }

  @Post("commission-applications/:id/confirm")
  confirmCommissionApplication(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.conversationsService.confirmCommissionApplication(user.id, id);
  }

  @Post("commission-applications/:id/reject")
  rejectCommissionApplication(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.conversationsService.rejectCommissionApplication(user.id, id);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number, @GetUser() user: { id: number }) {
    return this.conversationsService.findOne(id, user.id);
  }

  @Get(":id/messages")
  getMessages(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.conversationsService.getMessages(id, user.id);
  }

  @Post(":id/read")
  markAsRead(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.conversationsService.markAsRead(id, user.id);
  }

  @Post(":id/messages")
  sendMessage(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, user.id, dto);
  }

  @Delete(":id")
  remove(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.conversationsService.delete(id, user.id);
  }
}
