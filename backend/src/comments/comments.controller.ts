import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { GetUser, GetUserOptional } from "../auth/get-user.decorator";

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get("artworks/:id/comments")
  @UseGuards(OptionalJwtAuthGuard)
  findByArtwork(
    @Param("id", ParseIntPipe) id: number,
    @GetUserOptional() user?: { id: number },
  ) {
    return this.commentsService.findByArtwork(id, user?.id);
  }

  @Post("artworks/:id/comments")
  @UseGuards(JwtAuthGuard)
  create(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: Omit<CreateCommentDto, "artworkId" | "userId">,
    @GetUser() user: { id: number },
  ) {
    return this.commentsService.create({
      ...dto,
      artworkId: id,
      userId: user.id,
    });
  }

  @Post("comments/:id/like")
  @UseGuards(JwtAuthGuard)
  like(@Param("id", ParseIntPipe) id: number, @GetUser() user: { id: number }) {
    return this.commentsService.like(id, user.id);
  }
}

