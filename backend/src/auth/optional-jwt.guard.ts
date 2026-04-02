import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RequestWithUser } from "./jwt-auth.guard";

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
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
      return true;
    }

    try {
      const secret =
        this.config.get<string>("JWT_SECRET") ?? "oc-web-dev-secret";
      const payload = this.jwtService.verify<{
        sub: number | string;
        type?: "access" | "refresh";
        sid?: string;
      }>(token, { secret });
      if (payload.type && payload.type !== "access") {
        return true;
      }
      const subNum = Number(payload.sub);
      if (!Number.isFinite(subNum)) {
        return true;
      }
      const user = await this.prisma.user.findUnique({
        where: { id: subNum },
        select: { id: true, username: true },
      });
      if (user) {
        request.user = { ...user, sessionId: payload.sid };
      }
    } catch {
      // ignore invalid token
    }
    return true;
  }
}
