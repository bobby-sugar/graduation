import { IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsInt()
  userId!: number;

  @IsInt()
  artworkId!: number;

  @IsOptional()
  @IsInt()
  parentId?: number;
}
