import { Type } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateCommissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsIn(["commission", "offer"])
  direction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  previewImageUrl?: string | null;
}
