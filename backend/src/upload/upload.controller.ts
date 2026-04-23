import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import type { Request } from "express";
import { existsSync, mkdirSync } from "fs";
import { extname, join } from "path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

const uploadsDir = join(__dirname, "..", "..", "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const imageMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const uploadOptions = {
  storage: diskStorage({
    destination: uploadsDir,
    filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      const name = `${Date.now()}${extname(file.originalname) || ".jpg"}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const mime = (file.mimetype || "").toLowerCase();
    if (!imageMime.has(mime)) {
      cb(new BadRequestException("仅支持上传图片（JPEG、PNG、WebP、GIF）"), false);
      return;
    }
    cb(null, true);
  },
};

@Controller("upload")
@UseGuards(JwtAuthGuard)
export class UploadController {
  @Post()
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("请选择文件");
    return { url: `/uploads/${file.filename}` };
  }
}
