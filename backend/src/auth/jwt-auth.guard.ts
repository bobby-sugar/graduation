import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { Request } from "express";

export interface JwtPayload {
  sub: number;
  username: string;
  type?: "access" | "refresh";
  sid?: string;
}

export interface RequestWithUser extends Request {
  user?: { id: number; username: string; sessionId?: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      throw new UnauthorizedException("请先登录");
    }

    try {
      const secret =
        this.config.get<string>("JWT_SECRET") ?? "oc-web-dev-secret";
      const payload = this.jwtService.verify<JwtPayload & { sub?: number | string }>(
        token,
        { secret },
      );
      if (payload.type && payload.type !== "access") {
        throw new UnauthorizedException("无效的访问令牌");
      }
      const subNum = Number(payload.sub);
      if (!Number.isFinite(subNum)) {
        throw new UnauthorizedException("登录已过期或无效，请重新登录");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: subNum },
        select: { id: true, username: true },
      });
      if (!user) {
        throw new UnauthorizedException("用户不存在");
      }
      const sid = typeof payload.sid === "string" ? payload.sid.trim() : "";
      if (sid) {
        const session = await this.prisma.session.findFirst({
          where: { id: sid, userId: subNum, revokedAt: null },
        });
        if (!session || session.expiresAt.getTime() <= Date.now()) {
          throw new UnauthorizedException("登录已过期或无效，请重新登录");
        }
      }
      request.user = { ...user, sessionId: payload.sid };
      return true;
    } catch {
      throw new UnauthorizedException("登录已过期或无效，请重新登录");
    }
  }
}
