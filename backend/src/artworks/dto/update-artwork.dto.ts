import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

const TITLE_MAX = 255;
const DESC_MAX = 500_000;
const URL_MAX = 2048;
const TAGS_MAX = 2000;
const GENDER_MAX = 64;

/**
 * 须带 class-validator 元数据：全局 ValidationPipe whitelist 会剥掉无装饰器字段，
 * 否则 PATCH 体为空，保存作品「无变化」。
 */
export class UpdateArtworkDto {
  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(DESC_MAX)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(URL_MAX)
  imageUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(TAGS_MAX)
  tags?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(GENDER_MAX)
  gender?: string | null;

  /** 作品为 oc / worldview / emoji 时有效：public | private */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsIn(["public", "private"])
  ocPrivacy?: string | null;
}
