import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class CreateConversationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  otherUserId!: number;
}
