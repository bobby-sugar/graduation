import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { LogoutDto } from "./dto/logout.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { GetUser } from "./get-user.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getClientMeta(req: Request) {
    const userAgent = req.headers["user-agent"] ?? null;
    const ipAddress = req.ip || req.socket?.remoteAddress || null;
    return {
      userAgent: typeof userAgent === "string" ? userAgent : null,
      ipAddress,
    };
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.getClientMeta(req));
  }

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, this.getClientMeta(req));
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(
    @Body() dto: LogoutDto,
    @GetUser() user: { id: number; sessionId?: string },
  ) {
    return this.authService.logout(user.id, dto, user.sessionId);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  logoutAll(@GetUser() user: { id: number }) {
    return this.authService.logoutAll(user.id);
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  sessions(@GetUser() user: { id: number; sessionId?: string }) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete("sessions/:id")
  @UseGuards(JwtAuthGuard)
  revokeSession(@Param("id") sessionId: string, @GetUser() user: { id: number }) {
    return this.authService.revokeSession(user.id, sessionId);
  }
}
