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
import { UsersService } from "./users.service";
import { FollowsService } from "./follows.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { PatchMeDto } from "./dto/patch-me.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GetUser } from "../auth/get-user.decorator";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly followsService: FollowsService,
  ) {}

  @Get("search")
  search(@Query("q") q: string) {
    return this.usersService.search(q ?? "");
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMe(@GetUser() user: { id: number }) {
    return this.usersService.findMe(user.id);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  patchMe(@GetUser() user: { id: number }, @Body() dto: PatchMeDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Get("me/following")
  @UseGuards(JwtAuthGuard)
  getMyFollowing(@GetUser() user: { id: number }) {
    return this.followsService.getFollowingList(user.id);
  }

  @Get("me/followers")
  @UseGuards(JwtAuthGuard)
  getMyFollowers(@GetUser() user: { id: number }) {
    return this.followsService.getFollowersList(user.id);
  }

  @Post(":id/follow")
  @UseGuards(JwtAuthGuard)
  follow(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) targetUserId: number,
  ) {
    return this.followsService.follow(user.id, targetUserId);
  }

  @Delete(":id/follow")
  @UseGuards(JwtAuthGuard)
  unfollow(
    @GetUser() user: { id: number },
    @Param("id", ParseIntPipe) targetUserId: number,
  ) {
    return this.followsService.unfollow(user.id, targetUserId);
  }

  @Get(":id/likes-artworks")
  findLikedArtworks(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findLikedArtworksPublic(id);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOnePublic(id);
  }

  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}

