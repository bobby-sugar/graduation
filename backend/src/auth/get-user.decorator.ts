import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RequestWithUser } from "./jwt-auth.guard";

export const GetUser = createParamDecorator(
  (
    data: unknown,
    ctx: ExecutionContext,
  ): { id: number; username: string; sessionId?: string } => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new Error("JwtAuthGuard must be used to get user");
    }
    return user;
  },
);

export const GetUserOptional = createParamDecorator(
  (
    data: unknown,
    ctx: ExecutionContext,
  ): { id: number; username: string; sessionId?: string } | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
