import { IsOptional, IsString, MaxLength } from "class-validator";

export class PatchMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  autoReplyMessage?: string;
}
