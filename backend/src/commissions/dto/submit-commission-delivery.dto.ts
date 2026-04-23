import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CommissionDeliveryFileItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  relativePath?: string | null;
}

export class SubmitCommissionDeliveryDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionDeliveryFileItemDto)
  files?: CommissionDeliveryFileItemDto[];

  @IsOptional()
  @IsBoolean()
  finalize?: boolean;
}
