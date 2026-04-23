import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

function isDuplicateColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Duplicate column|already exists|1060|ER_DUP_FIELDNAME/i.test(msg);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.ensureArtworkOcPrivacyColumn();
  }

  /**
   * 与 prisma 迁移 `20260410120000_artwork_oc_privacy` 对齐：若库表尚未加列则自动补列，
   * 避免 Prisma 6 在任意 findMany 上因缺列报 P2022。
   */
  private async ensureArtworkOcPrivacyColumn(): Promise<void> {
    const tryAlter = async (table: string) => {
      await this.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` ADD COLUMN \`ocPrivacy\` VARCHAR(16) NULL`,
      );
    };
    try {
      await tryAlter("Artwork");
    } catch (e) {
      if (isDuplicateColumnError(e)) return;
      try {
        await tryAlter("artwork");
      } catch (e2) {
        if (isDuplicateColumnError(e2)) return;
        // eslint-disable-next-line no-console
        console.warn(
          "[prisma] 未能自动添加 Artwork.ocPrivacy，请执行: cd backend && npx prisma migrate deploy",
        );
      }
    }
    try {
      await this.$executeRawUnsafe(
        `UPDATE \`Artwork\` SET \`ocPrivacy\` = 'public' WHERE \`category\` = 'oc' AND \`ocPrivacy\` IS NULL`,
      );
    } catch {
      try {
        await this.$executeRawUnsafe(
          `UPDATE \`artwork\` SET \`ocPrivacy\` = 'public' WHERE \`category\` = 'oc' AND \`ocPrivacy\` IS NULL`,
        );
      } catch {
        /* ignore */
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

