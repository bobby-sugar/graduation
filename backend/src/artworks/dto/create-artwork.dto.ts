import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

const TITLE_MAX = 255;
const DESC_MAX = 500_000;
const CATEGORY_MAX = 64;
const URL_MAX = 2048;
const TAGS_MAX = 2000;
const GENDER_MAX = 64;

/** 须带 class-validator 元数据，否则全局 whitelist 会剥掉请求体字段。 */
export class CreateArtworkDto {
  @IsString()
  @MaxLength(TITLE_MAX)
  title!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(DESC_MAX)
  description?: string;

  @IsString()
  @MaxLength(CATEGORY_MAX)
  category!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(URL_MAX)
  imageUrl?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(TAGS_MAX)
  tags?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(GENDER_MAX)
  gender?: string;

  /** category 为 oc / worldview / emoji 时有效：public | private */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsIn(["public", "private"])
  ocPrivacy?: string;
}
