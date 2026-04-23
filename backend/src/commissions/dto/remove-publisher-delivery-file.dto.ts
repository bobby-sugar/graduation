import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class RemovePublisherDeliveryFileDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  messageId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  url?: string;
}
