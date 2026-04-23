/**
 * 调整所有 category=oc 的作品浏览数（Artwork.views）。
 * 在 backend 目录：node scripts/bump-oc-views.js
 * 或：npm run bump:oc-views
 *
 * 默认：把每条 OC 的 views「设为」随机值，落在约 4000（演示数据用，避免越加越高）。
 *   OC_VIEW_TARGET_MIN / OC_VIEW_TARGET_MAX — 默认 3600～4400
 *
 * 可选：仅「增加」浏览（累加）
 *   OC_VIEWS_MODE=increment
 *   OC_VIEW_MIN / OC_VIEW_MAX — 每次随机增加区间，默认 3800～4200
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function envInt(name, fallback) {
    const v = process.env[name];
    if (v == null || v === "") return fallback;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

async function main() {
    const mode = (process.env.OC_VIEWS_MODE || "set").toLowerCase();

    const ocs = await prisma.artwork.findMany({
        where: { category: "oc" },
        select: { id: true },
    });

    if (mode === "increment") {
        const vMin = envInt("OC_VIEW_MIN", 3800);
        const vMax = envInt("OC_VIEW_MAX", 4200);
        if (vMin > vMax) throw new Error("OC_VIEW_MIN 不能大于 OC_VIEW_MAX");
        let total = 0;
        for (const oc of ocs) {
            const delta = randInt(vMin, vMax);
            await prisma.artwork.update({
                where: { id: oc.id },
                data: { views: { increment: delta } },
            });
            total += delta;
        }
        // eslint-disable-next-line no-console
        console.log(
            JSON.stringify(
                {
                    mode: "increment",
                    ocWorks: ocs.length,
                    totalViewsAdded: total,
                    perOcIncrementRange: [vMin, vMax],
                },
                null,
                2,
            ),
        );
        return;
    }

    if (mode !== "set") {
        throw new Error(`未知的 OC_VIEWS_MODE=${mode}，请使用 set 或 increment`);
    }

    const tMin = envInt("OC_VIEW_TARGET_MIN", 3600);
    const tMax = envInt("OC_VIEW_TARGET_MAX", 4400);
    if (tMin > tMax) throw new Error("OC_VIEW_TARGET_MIN 不能大于 OC_VIEW_TARGET_MAX");

    let sum = 0;
    for (const oc of ocs) {
        const next = randInt(tMin, tMax);
        sum += next;
        await prisma.artwork.update({
            where: { id: oc.id },
            data: { views: next },
        });
    }

    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify(
            {
                mode: "set",
                ocWorks: ocs.length,
                perOcViewsRange: [tMin, tMax],
                sumOfAllViews: sum,
                avgViewsApprox: ocs.length ? Math.round(sum / ocs.length) : 0,
            },
            null,
            2,
        ),
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
