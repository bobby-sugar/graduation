import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { LogoutDto } from "./dto/logout.dto";

const ACCESS_TOKEN_EXPIRES_IN = "2h";
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private jwtSecret() {
    return this.config.get<string>("JWT_SECRET") ?? "oc-web-dev-secret";
  }

  private signAccessToken(user: { id: number; username: string }, sessionId: string) {
    const payload = { sub: user.id, username: user.username, type: "access" as const, sid: sessionId };
    return this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
  }

  private signRefreshToken(user: { id: number; username: string }, sessionId: string) {
    const payload = { sub: user.id, username: user.username, type: "refresh" as const, sid: sessionId };
    return this.jwtService.sign(payload, { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` });
  }

  private getRefreshExpiresAt() {
    return new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  }

  private async buildAuthResponse(
    user: {
      id: number;
      username: string;
      email: string;
      avatarUrl: string | null;
      avatarPositionX: number;
      avatarPositionY: number;
      profileBackgroundUrl: string | null;
      backgroundPositionX: number;
      backgroundPositionY: number;
      bio: string | null;
      location: string | null;
    },
    meta?: { userAgent?: string | null; ipAddress?: string | null },
  ) {
    const refreshTokenPlain = "__seed__";
    const refreshHash = await bcrypt.hash(refreshTokenPlain, 10);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        userAgent: meta?.userAgent ?? null,
        ipAddress: meta?.ipAddress ?? null,
        expiresAt: this.getRefreshExpiresAt(),
      },
      select: { id: true },
    });

    const accessToken = this.signAccessToken({ id: user.id, username: user.username }, session.id);
    const refreshToken = this.signRefreshToken({ id: user.id, username: user.username }, session.id);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        lastActiveAt: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        avatarPositionX: user.avatarPositionX,
        avatarPositionY: user.avatarPositionY,
        profileBackgroundUrl: user.profileBackgroundUrl,
        backgroundPositionX: user.backgroundPositionX,
        backgroundPositionY: user.backgroundPositionY,
        bio: user.bio,
        location: user.location,
      },
    };
  }

  async login(dto: LoginDto, meta?: { userAgent?: string | null; ipAddress?: string | null }) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.login }, { username: dto.login }],
      },
    });

    if (!user) {
      throw new UnauthorizedException("邮箱/用户名或密码错误");
    }

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException("邮箱/用户名或密码错误");
    }

    return this.buildAuthResponse(user, meta);
  }

  async register(dto: RegisterDto, meta?: { userAgent?: string | null; ipAddress?: string | null }) {
    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });
    if (exists) {
      throw new BadRequestException("用户名或邮箱已被使用");
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: hashed,
        avatarUrl:
          dto.avatarUrl ??
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(dto.username)}`,
        bio: dto.bio ?? null,
        location: dto.location ?? null,
      },
    });

    return this.buildAuthResponse(user, meta);
  }

  async refreshToken(dto: RefreshTokenDto) {
    const token = dto.refreshToken?.trim();
    if (!token) {
      throw new UnauthorizedException("refreshToken 不能为空");
    }

    let payload: { sub: number | string; username: string; type?: string; sid?: string };
    try {
      payload = this.jwtService.verify<{
        sub: number | string;
        username: string;
        type?: string;
        sid?: string;
      }>(token, { secret: this.jwtSecret() });
    } catch {
      throw new UnauthorizedException("refresh token 已过期或无效");
    }
    if (payload.type !== "refresh" || !payload.sid) {
      throw new UnauthorizedException("无效的 refresh token");
    }
    const subNum = Number(payload.sub);
    if (!Number.isFinite(subNum)) {
      throw new UnauthorizedException("无效的 refresh token");
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: subNum,
        revokedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
            avatarPositionX: true,
            avatarPositionY: true,
            profileBackgroundUrl: true,
            backgroundPositionX: true,
            backgroundPositionY: true,
            bio: true,
            location: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException("会话不存在或已失效");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("会话已过期，请重新登录");
    }

    const matched = await bcrypt.compare(token, session.refreshTokenHash);
    if (!matched) {
      throw new UnauthorizedException("refresh token 校验失败");
    }

    const accessToken = this.signAccessToken(session.user, session.id);
    const refreshToken = this.signRefreshToken(session.user, session.id);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        lastActiveAt: new Date(),
        expiresAt: this.getRefreshExpiresAt(),
      },
    });

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: session.user,
    };
  }

  async logout(userId: number, dto: LogoutDto = {}, currentSessionId?: string) {
    const byBodySessionId = dto.sessionId?.trim();
    const byRefreshSessionId = (() => {
      const refreshToken = dto.refreshToken?.trim();
      if (!refreshToken) return null;
      try {
        const payload = this.jwtService.verify<{
          sub: number | string;
          sid?: string;
          type?: string;
        }>(refreshToken, { secret: this.jwtSecret() });
        if (
          payload.type === "refresh" &&
          payload.sid &&
          Number(payload.sub) === userId
        ) {
          return payload.sid;
        }
      } catch {
        // ignore invalid refresh token on logout
      }
      return null;
    })();
    const targetSessionId = byBodySessionId || currentSessionId || byRefreshSessionId || null;
    if (targetSessionId) {
      await this.prisma.session.updateMany({
        where: {
          id: targetSessionId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: "logout",
        },
      });
      return { ok: true };
    }
    // fallback: access token 未携带 sid 时，至少吊销该用户全部存活会话，避免“登出成功但会话仍有效”。
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: "logout_fallback",
      },
    });
    return { ok: true };
  }

  async logoutAll(userId: number) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: "logout_all",
      },
    });
    return { ok: true };
  }

  async listSessions(userId: number, currentSessionId?: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((s) => ({
      ...s,
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
    }));
  }

  async revokeSession(userId: number, sessionId: string) {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: "revoked_by_user",
      },
    });
    return { ok: true };
  }
}
