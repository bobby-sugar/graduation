import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CommissionsService } from "./commissions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { GetUser, GetUserOptional } from "../auth/get-user.decorator";

@Controller("commissions")
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  findAll(
    @Query("artistId") artistId?: string,
    @Query("clientId") clientId?: string,
    @Query("direction") direction?: string,
  ) {
    const artist = artistId ? Number(artistId) : undefined;
    const client = clientId ? Number(clientId) : undefined;
    return this.commissionsService.findAll({ artistId: artist, clientId: client, direction });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @GetUser() user: { id: number },
    @Body()
    body: {
      title: string;
      description?: string | null;
      category: string;
      price: number;
      direction?: string;
      previewImageUrl?: string | null;
    },
  ) {
    return this.commissionsService.create(user.id, body);
  }

  @Get(":id/delivery-files")
  @UseGuards(JwtAuthGuard)
  getDeliveryFiles(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.commissionsService.listAggregatedDeliveryFiles(user.id, id);
  }

  @Get(":id/publisher-delivery-items")
  @UseGuards(JwtAuthGuard)
  getPublisherDeliveryItems(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.commissionsService.listPublisherDeliveryItems(user.id, id);
  }

  @Post(":id/publisher-delivery-file/remove")
  @UseGuards(JwtAuthGuard)
  removePublisherDeliveryFile(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { messageId?: number; url?: string },
  ) {
    const mid = Number(body?.messageId);
    if (!Number.isFinite(mid) || mid < 1) {
      throw new BadRequestException("无效的消息 id");
    }
    return this.commissionsService.removePublisherDeliveryFile(
      user.id,
      id,
      mid,
      String(body?.url ?? ""),
    );
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @GetUserOptional() user?: { id: number },
  ) {
    return this.commissionsService.findOne(id, user?.id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  updateByOwner(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      description?: string | null;
      category?: string;
      price?: number;
      status?: string;
      direction?: string;
      previewImageUrl?: string | null;
    },
  ) {
    return this.commissionsService.updateByOwner(user.id, id, body);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  removeByOwner(@GetUser() user: { id: number }, @Param("id", ParseIntPipe) id: number) {
    return this.commissionsService.removeByOwner(user.id, id);
  }

  @Post(":id/pay")
  @UseGuards(JwtAuthGuard)
  payByAssignee(@GetUser() user: { id: number }, @Param("id", ParseIntPipe) id: number) {
    return this.commissionsService.payByAssignee(user.id, id);
  }

  @Post(":id/cancel-payment")
  @UseGuards(JwtAuthGuard)
  cancelPaymentByPayer(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.commissionsService.cancelPaymentByPayer(user.id, id);
  }

  @Post(":id/deliver")
  @UseGuards(JwtAuthGuard)
  submitDeliveryByPublisher(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      files?: Array<{ name: string; url: string; relativePath?: string | null }>;
      /** 为 false 时仅推送交付消息，保持进行中/修改中，可多次提交 */
      finalize?: boolean;
    },
  ) {
    return this.commissionsService.submitDeliveryByPublisher(
      user.id,
      id,
      Array.isArray(body?.files) ? body.files : [],
      { finalize: body?.finalize },
    );
  }

  @Post(":id/accept")
  @UseGuards(JwtAuthGuard)
  acceptDeliveryByPayer(@GetUser() user: { id: number }, @Param("id", ParseIntPipe) id: number) {
    return this.commissionsService.acceptDeliveryByPayer(user.id, id);
  }

  @Post(":id/reject-review")
  @UseGuards(JwtAuthGuard)
  rejectReviewByPayer(@GetUser() user: { id: number }, @Param("id", ParseIntPipe) id: number) {
    return this.commissionsService.rejectReviewByPayer(user.id, id);
  }
}

