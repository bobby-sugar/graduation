-- AlterTable: 稿件申请 __COMMISSION_CARD__ JSON 可能远超 VARCHAR(191)
ALTER TABLE `Message` MODIFY `content` TEXT NOT NULL;
