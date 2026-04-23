import { IsString, MaxLength, MinLength } from "class-validator";

/** 服务端另按消息类型限制长度；此处上限覆盖稿件卡片等较长结构化消息 */
export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  content!: string;
}
