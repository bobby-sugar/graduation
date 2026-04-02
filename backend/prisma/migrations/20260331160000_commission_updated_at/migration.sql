-- AlterTable: 用于区分「本轮征集」内的申请，避免改回新建后仍显示旧申请人
ALTER TABLE `Commission` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `Commission` SET `updatedAt` = `createdAt`;
