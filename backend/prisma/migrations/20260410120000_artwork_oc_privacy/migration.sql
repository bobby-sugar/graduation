-- OC 可被世界观等关联的隐私：public 可被他人关联，private 不可出现在关联候选中
ALTER TABLE `Artwork` ADD COLUMN `ocPrivacy` VARCHAR(16) NULL;

-- 已有稿件视为「公共」（可关联）
UPDATE `Artwork` SET `ocPrivacy` = 'public' WHERE `category` = 'oc' AND `ocPrivacy` IS NULL;
