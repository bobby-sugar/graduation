import { useEffect, useState } from "react";

interface FilterItem {
    label: string;
    type?: 'select' | 'checkbox' | 'range';
    key: keyof CommissionFilters | "priceRange";
    icon: React.ReactNode;
}

export interface CommissionFilters {
    commissionType: string;
    amountOrder: string;
    deliveryTime: string;
    copyrightType: string;
    responseSpeed: string;
}

interface FilterSidebarProps {
    values: CommissionFilters;
    onChange: (next: CommissionFilters) => void;
    expandedKeys?: string[];
    onExpandedKeysChange?: (next: string[]) => void;
}

const selectOptions = {
    commissionType: ["全部", "头像", "半身", "全身", "立绘", "场景", "Live2D", "UI设计"],
    amountOrder: ["全部", "由低到高", "由高到低"],
    deliveryTime: ["全部", "3天内", "1周内", "2周内", "1个月内", "可协商"],
    copyrightType: ["全部", "个人使用", "商用可用", "买断版权"],
    responseSpeed: ["全部", "24小时内", "12小时内", "6小时内"],
};

// 图标组件
const FilterIcons = {
    type: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
        </svg>
    ),
    price: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
    ),
    time: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
        </svg>
    ),
    copyright: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M14.5 9.3a4 4 0 1 0 0 5.4"/>
        </svg>
    ),
    speed: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
    ),
};

const filterItems: FilterItem[] = [
    { label: '稿件类型', type: 'select', key: 'commissionType', icon: FilterIcons.type },
    { label: '金额', type: 'select', key: 'amountOrder', icon: FilterIcons.price },
    { label: '交付时间', type: 'select', key: 'deliveryTime', icon: FilterIcons.time },
    { label: '版权', type: 'select', key: 'copyrightType', icon: FilterIcons.copyright },
    { label: '响应速度', type: 'select', key: 'responseSpeed', icon: FilterIcons.speed },
];

export default function FilterSidebar({
    values,
    onChange,
    expandedKeys,
    onExpandedKeysChange,
}: FilterSidebarProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(expandedKeys ?? []));

    useEffect(() => {
        if (!expandedKeys) return;
        setExpandedItems(new Set(expandedKeys));
    }, [expandedKeys]);

    const updateExpandedItems = (nextSet: Set<string>) => {
        setExpandedItems(nextSet);
        onExpandedKeysChange?.(Array.from(nextSet));
    };

    const toggleExpand = (label: string) => {
        const current = new Set(expandedItems);
        if (current.has(label)) {
            current.delete(label);
        } else {
            current.add(label);
        }
        updateExpandedItems(current);
    };

    const isExpanded = (label: string) => expandedItems.has(label);

    const resetFilters = () => {
        onChange({
            commissionType: "全部",
            amountOrder: "全部",
            deliveryTime: "全部",
            copyrightType: "全部",
            responseSpeed: "全部",
        });
    };

    const resetExpanded = () => {
        updateExpandedItems(new Set());
    };

    const resetAll = () => {
        resetFilters();
        resetExpanded();
    };

    return (
        <div className="filter-sidebar">
            <div className="filter-sidebar-header">
                <div className="filter-sidebar-header-row">
                    <h3 className="filter-sidebar-title">筛选</h3>
                    <button className="filter-reset-btn" onClick={resetAll}>重置</button>
                </div>
            </div>
            <div className="filter-sidebar-content">
                {filterItems.map((item) => (
                    <div key={item.label} className="filter-item">
                        <button
                            className="filter-item-header"
                            onClick={() => toggleExpand(item.label)}
                        >
                            <div className="filter-item-label-wrapper">
                                <span className="filter-item-icon">{item.icon}</span>
                                <span className="filter-item-label">{item.label}</span>
                            </div>
                            <svg
                                className={`filter-item-arrow ${isExpanded(item.label) ? 'expanded' : ''}`}
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M3 4.5L6 7.5L9 4.5" />
                            </svg>
                        </button>
                        {isExpanded(item.label) && (
                            <div className="filter-item-content">
                                {item.type === 'select' && (
                                    <select
                                        className="filter-select"
                                        value={values[item.key as keyof CommissionFilters] as string}
                                        onChange={(e) =>
                                            onChange({
                                                ...values,
                                                [item.key]: e.target.value,
                                            })
                                        }
                                    >
                                        {(selectOptions[item.key as keyof typeof selectOptions] || ["全部"]).map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {item.type === 'checkbox' && (
                                    <label className="filter-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(values[item.key as keyof CommissionFilters])}
                                            onChange={(e) =>
                                                onChange({
                                                    ...values,
                                                    [item.key]: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>是</span>
                                    </label>
                                )}
                                {item.type === 'range' && null}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
