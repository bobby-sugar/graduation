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
import { ArtworksService } from "./artworks.service";
import { CreateArtworkDto } from "./dto/create-artwork.dto";
import { UpdateArtworkDto } from "./dto/update-artwork.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
import { GetUser, GetUserOptional } from "../auth/get-user.decorator";

@Controller("artworks")
export class ArtworksController {
  constructor(private readonly artworksService: ArtworksService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query("authorId") authorId?: string,
    @GetUserOptional() user?: { id: number },
  ) {
    const id = authorId ? Number(authorId) : undefined;
    return this.artworksService.findAll(id, user?.id);
  }

  @Get("recommended")
  @UseGuards(OptionalJwtAuthGuard)
  getRecommended(@GetUserOptional() user?: { id: number }) {
    return this.artworksService.findRecommended(user?.id);
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  getMine(@GetUser() user: { id: number }) {
    return this.artworksService.findMine(user.id);
  }

  @Get("following")
  @UseGuards(JwtAuthGuard)
  getFollowing(@GetUser() user: { id: number }) {
    return this.artworksService.findFromFollowing(user.id);
  }

  @Get("favorites")
  @UseGuards(JwtAuthGuard)
  getFavorites(@GetUser() user: { id: number }) {
    return this.artworksService.findFavorites(user.id);
  }

  @Get("search")
  @UseGuards(OptionalJwtAuthGuard)
  search(@Query("q") q: string, @GetUserOptional() user?: { id: number }) {
    return this.artworksService.search(q ?? "", user?.id);
  }

  /** 世界观等关联 OC 时的候选：仅 category=oc 且 ocPrivacy 为 public 或 null（历史数据） */
  @Get("linkable-ocs")
  @UseGuards(OptionalJwtAuthGuard)
  linkableOcs(@Query("q") q?: string) {
    return this.artworksService.findLinkableOcs(q ?? "");
  }

  /** 指定世界观下，反查所有已关联该世界观的 OC（用于世界观详情「相关 OC」双向展示） */
  @Get("linked-worldview/:id/ocs")
  @UseGuards(OptionalJwtAuthGuard)
  linkedOcsByWorldview(
    @Param("id", ParseIntPipe) id: number,
    @GetUserOptional() user?: { id: number },
  ) {
    return this.artworksService.findOcsLinkedToWorldview(id, user?.id);
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @GetUserOptional() user?: { id: number },
  ) {
    return this.artworksService.findOne(id, user?.id);
  }

  @Post(":id/like")
  @UseGuards(JwtAuthGuard)
  toggleLike(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.artworksService.toggleLike(user.id, id);
  }

  @Delete(":id/like")
  @UseGuards(JwtAuthGuard)
  removeLike(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.artworksService.removeLike(user.id, id);
  }

  @Post(":id/view")
  @UseGuards(JwtAuthGuard)
  recordView(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.artworksService.recordView(user.id, id);
  }

  @Post(":id/favorite")
  @UseGuards(JwtAuthGuard)
  addFavorite(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.artworksService.toggleFavorite(user.id, id);
  }

  @Delete(":id/favorite")
  @UseGuards(JwtAuthGuard)
  removeFavorite(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.artworksService.removeFavorite(user.id, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @GetUser() user: { id: number },
    @Body() dto: CreateArtworkDto,
  ) {
    return this.artworksService.create(user.id, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
      imageUrl: dto.imageUrl,
      tags: dto.tags,
      gender: dto.gender,
      ocPrivacy: dto.ocPrivacy,
    });
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  update(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
    @Body() dto: UpdateArtworkDto,
  ) {
    return this.artworksService.updateByAuthor(user.id, id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  remove(
    @Param("id", ParseIntPipe) id: number,
    @GetUser() user: { id: number },
  ) {
    return this.artworksService.removeByAuthor(user.id, id);
  }
}

