import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageFlip from "../components/PageFlip";
import FilterSidebar from "../components/FilterSidebar";
import type { CommissionFilters } from "../components/FilterSidebar";
import CommissionCard from "../components/CommissionCard";
import { useAuth } from "../contexts/AuthContext";
import { resolveApiUrl } from "../config/api";

type CommissionStatus = 'new' | 'pending' | 'payment-pending' | 'wip' | 'review-pending' | 'revising' | 'done';
type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'hold';

interface CommissionForUI {
    id: string;
    title: string;
    client: string;
    clientAvatar?: string;
    price: number;
    status: CommissionStatus;
    paymentStatus: PaymentStatus;
    paymentAmount?: number;
    submittedDate: string;
    category?: string;
    previewImage?: string;
    isMine?: boolean;
    direction?: "commission" | "offer";
    deliveryTime?: string;
    copyrightType?: string;
    responseSpeed?: string;
    description?: string;
}

// 接稿页面内容（我作为画师收到的约稿）
function AcceptingPage({
    items,
    onClick,
    onSwitch,
}: {
    items: CommissionForUI[];
    onClick: (id: string) => void;
    onSwitch: () => void;
}) {
    return (
        <div className="commission-page-content">
            <div className="commission-page-header">
                <div className="commission-page-header-left">
                    <h2>查看接稿</h2>
                    <button
                        className="commission-page-switch-button"
                        onClick={onSwitch}
                    >
                        查看约稿
                    </button>
                </div>
            </div>
            <div className="commission-cards-grid">
                {items.length > 0 ? (
                    items.map((commission) => (
                        <CommissionCard
                            key={commission.id}
                            {...commission}
                            onClick={() => onClick(commission.id)}
                        />
                    ))
                ) : (
                    <div className="commission-empty-state">当前筛选下暂无接稿帖子</div>
                )}
            </div>
        </div>
    );
}

// 约稿页面内容（我作为客户发出去的约稿）
function CommissioningPage({
    items,
    onClick,
    onSwitch,
}: {
    items: CommissionForUI[];
    onClick: (id: string) => void;
    onSwitch: () => void;
}) {
    return (
        <div className="commission-page-content">
            <div className="commission-page-header">
                <div className="commission-page-header-left">
                    <h2>查看约稿</h2>
                    <button
                        className="commission-page-switch-button"
                        onClick={onSwitch}
                    >
                        查看接稿
                    </button>
                </div>
            </div>
            <div className="commission-cards-grid">
                {items.length > 0 ? (
                    items.map((commission) => (
                        <CommissionCard
                            key={commission.id}
                            {...commission}
                            onClick={() => onClick(commission.id)}
                        />
                    ))
                ) : (
                    <div className="commission-empty-state">当前筛选下暂无约稿帖子</div>
                )}
            </div>
        </div>
    );
}

const VIEW_STATE_STORAGE_KEY = "oc_commissions_view_state_v1";
const DEFAULT_FILTERS: CommissionFilters = {
    commissionType: "全部",
    amountOrder: "全部",
    deliveryTime: "全部",
    copyrightType: "全部",
    responseSpeed: "全部",
};

function normalizeCommissionFilters(saved?: CommissionFilters): CommissionFilters {
    if (!saved) return DEFAULT_FILTERS;
    const merged = { ...DEFAULT_FILTERS, ...saved };
    if (merged.amountOrder === "") merged.amountOrder = "全部";
    return merged;
}

function readSavedViewState() {
    const raw = sessionStorage.getItem(VIEW_STATE_STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as {
            filters?: CommissionFilters;
            isFlipped?: boolean;
            scrollY?: number;
            expandedFilterItems?: string[];
        };
        return parsed;
    } catch {
        return null;
    }
}

function parseMetaFromDescription(desc?: string): Partial<CommissionForUI> {
    if (!desc) return {};
    const get = (label: string) => {
        const m = desc.match(new RegExp(`${label}：([^\\n\\r]+)`));
        return m?.[1]?.trim();
    };
    return {
        deliveryTime: get("交付时间"),
        copyrightType: get("版权"),
        responseSpeed: get("响应速度"),
    };
}

function applyFilters(items: CommissionForUI[], filters: CommissionFilters) {
    const filtered = items.filter((item) => {
        if (filters.commissionType !== "全部" && item.category !== filters.commissionType) return false;
        if (filters.deliveryTime !== "全部" && item.deliveryTime !== filters.deliveryTime) return false;
        if (filters.copyrightType !== "全部" && item.copyrightType !== filters.copyrightType) return false;
        if (filters.responseSpeed !== "全部" && item.responseSpeed !== filters.responseSpeed) return false;
        return true;
    });

    return filtered.sort((a, b) => {
        if (filters.amountOrder === "由高到低") return (b.price ?? 0) - (a.price ?? 0);
        if (filters.amountOrder === "由低到高") return (a.price ?? 0) - (b.price ?? 0);
        // 「全部」或历史空值：按发布时间倒序
        return new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime();
    });
}

export default function CommissionsPage() {
    const savedViewState = readSavedViewState();
    const { user } = useAuth();
    const [allCommissions, setAllCommissions] = useState<CommissionForUI[]>([]);
    const [filters, setFilters] = useState<CommissionFilters>(() => normalizeCommissionFilters(savedViewState?.filters));
    const [isFlipped, setIsFlipped] = useState(savedViewState?.isFlipped ?? false);
    const [expandedFilterItems, setExpandedFilterItems] = useState<string[]>(savedViewState?.expandedFilterItems ?? []);
    const restoreScrollYRef = useRef<number | null>(typeof savedViewState?.scrollY === "number" ? savedViewState.scrollY : null);
    const restoredScrollRef = useRef(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 直接读取数据库中的真实稿件数据
                const allRes = await fetch("/api/commissions");
                if (!allRes.ok) return;
                const allData = await allRes.json();

                const mapToUI = (data: any[]): CommissionForUI[] =>
                    (data || []).map((c: any) => ({
                    direction: c.direction ?? "commission",
                    // 发起人展示：约稿帖优先展示 client；接稿帖优先展示 artist
                    // 兜底时取另一个角色，避免出现“未知客户”
                    client:
                        c.direction === "offer"
                            ? (c.artist?.username ?? c.client?.username ?? "未知用户")
                            : (c.client?.username ?? c.artist?.username ?? "未知用户"),
                    clientAvatar:
                        c.direction === "offer"
                            ? (c.artist?.avatarUrl ?? c.client?.avatarUrl ?? undefined)
                            : (c.client?.avatarUrl ?? c.artist?.avatarUrl ?? undefined),
                    id: String(c.id),
                    title: c.title,
                    price: c.price ?? 0,
                    status: c.status as CommissionStatus,
                    paymentStatus: c.paymentStatus as PaymentStatus,
                    paymentAmount: c.paymentPercent ?? undefined,
                    submittedDate: c.submittedAt,
                    category: c.category ?? undefined,
                    previewImage: c.previewImageUrl
                        ? resolveApiUrl(c.previewImageUrl)
                        : undefined,
                    isMine:
                        !!user?.id &&
                        (
                            (c.direction === "offer" ? c.artistId : c.clientId) === user.id
                        ),
                    ...parseMetaFromDescription(c.description),
                }));

                const realData = mapToUI(allData);
                setAllCommissions(realData);
                sessionStorage.removeItem("oc_commission_mock_cache");
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(e);
            }
        };

        fetchData();
    }, [user?.id]);

    useEffect(() => {
        const saved = {
            filters,
            isFlipped,
            expandedFilterItems,
            scrollY: window.scrollY,
        };
        sessionStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(saved));
    }, [expandedFilterItems, filters, isFlipped]);

    useEffect(() => {
        if (restoredScrollRef.current) return;
        if (restoreScrollYRef.current == null) return;
        if (allCommissions.length === 0) return;

        const targetScrollY = restoreScrollYRef.current;
        let attempts = 0;
        const maxAttempts = 12;

        const tryRestore = () => {
            attempts += 1;
            window.scrollTo(0, targetScrollY);
            const reached =
                Math.abs(window.scrollY - targetScrollY) <= 2 ||
                window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
            if (reached || attempts >= maxAttempts) {
                restoredScrollRef.current = true;
                restoreScrollYRef.current = null;
                return;
            }
            requestAnimationFrame(tryRestore);
        };

        requestAnimationFrame(tryRestore);
    }, [allCommissions.length]);

    const filtered = useMemo(() => {
        const result = applyFilters(allCommissions, filters);
        // 保留“不重复图片 + 控制数量”
        const seenImages = new Set<string | undefined>();
        const uniqueByImage: CommissionForUI[] = [];
        for (const item of result) {
            const key = item.previewImage ?? undefined;
            if (seenImages.has(key)) continue;
            seenImages.add(key);
            uniqueByImage.push(item);
        }
        return uniqueByImage.slice(0, 40);
    }, [allCommissions, filters]);

    const acceptingItems = useMemo(
        () => filtered.filter((item) => item.direction === "offer"),
        [filtered],
    );
    const commissioningItems = useMemo(
        () => filtered.filter((item) => item.direction !== "offer"),
        [filtered],
    );

    const openDetail = (id: string) => {
        const saved = {
            filters,
            isFlipped,
            expandedFilterItems,
            scrollY: window.scrollY,
        };
        sessionStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(saved));
        navigate(`/commissions/${id}`);
    };

    return (
        <div className="commissions-page">
            <div className="commissions-page-layout">
                {/* 左侧筛选栏 */}
                <FilterSidebar
                    values={filters}
                    onChange={setFilters}
                    expandedKeys={expandedFilterItems}
                    onExpandedKeysChange={setExpandedFilterItems}
                />
                
                {/* 右侧翻页内容 */}
                <div className="commissions-page-main">
                    <div className="commission-main-float-actions">
                        <button
                            className="commission-page-my-button"
                            onClick={() => navigate("/my-commissions")}
                        >
                            我的稿件
                        </button>
                    </div>
                    <PageFlip
                        isFlipped={isFlipped}
                        onToggle={() => setIsFlipped((prev) => !prev)}
                        showButton={false}
                        page1={
                            <AcceptingPage
                                items={acceptingItems}
                                onClick={openDetail}
                                onSwitch={() => setIsFlipped(true)}
                            />
                        }
                        page2={
                            <CommissioningPage
                                items={commissioningItems}
                                onClick={openDetail}
                                onSwitch={() => setIsFlipped(false)}
                            />
                        }
                        label1="查看接稿"
                        label2="查看约稿"
                    />
                </div>
            </div>
        </div>
    );
}
