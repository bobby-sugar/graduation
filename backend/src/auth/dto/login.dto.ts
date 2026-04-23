import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  /** 邮箱或用户名 */
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  login!: string;

  /** 密码 */
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
