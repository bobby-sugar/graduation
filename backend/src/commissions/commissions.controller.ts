import {
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
import { CreateCommissionDto } from "./dto/create-commission.dto";
import { UpdateCommissionDto } from "./dto/update-commission.dto";
import { RemovePublisherDeliveryFileDto } from "./dto/remove-publisher-delivery-file.dto";
import { SubmitCommissionDeliveryDto } from "./dto/submit-commission-delivery.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { GetUser, GetUserOptional } from "../auth/get-user.decorator";

@Controller("commissions")
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query("artistId") artistId?: string,
    @Query("clientId") clientId?: string,
    @Query("direction") direction?: string,
    @GetUserOptional() user?: { id: number },
  ) {
    const artist = artistId ? Number(artistId) : undefined;
    const client = clientId ? Number(clientId) : undefined;
    return this.commissionsService.findAll({
      artistId: artist,
      clientId: client,
      direction,
      viewerId: user?.id,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@GetUser() user: { id: number }, @Body() body: CreateCommissionDto) {
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
    @Body() body: RemovePublisherDeliveryFileDto,
  ) {
    return this.commissionsService.removePublisherDeliveryFile(
      user.id,
      id,
      body.messageId,
      String(body.url ?? ""),
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
    @Body() body: UpdateCommissionDto,
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
    @Body() body: SubmitCommissionDeliveryDto,
  ) {
    return this.commissionsService.submitDeliveryByPublisher(
      user.id,
      id,
      Array.isArray(body.files) ? body.files : [],
      { finalize: body.finalize },
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

