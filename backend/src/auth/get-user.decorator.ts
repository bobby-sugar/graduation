import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { RequestWithUser } from "./jwt-auth.guard";

export const GetUser = createParamDecorator(
  (
    data: unknown,
    ctx: ExecutionContext,
  ): { id: number; username: string; sessionId?: string } => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("请先登录");
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
