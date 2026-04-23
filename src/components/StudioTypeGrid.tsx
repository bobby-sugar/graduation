const TYPE_COPY: Record<string, { blurb: string }> = {
    OC: { blurb: "角色档案、性格与世界观中的位置" },
    世界观: { blurb: "设定总览、势力与规则" },
    表情包: { blurb: "套图、画风与关联角色" },
};

interface StudioTypeGridProps {
    selectedCategory: string | null;
    onSelectType: (label: string) => void;
}

/** 未选定类型时主区展示的「模板选择」栅格（左侧仍有侧栏） */
export default function StudioTypeGrid({ selectedCategory, onSelectType }: StudioTypeGridProps) {
    return (
        <div className="studio-type-grid-wrap">
            <header className="studio-hero">
                <h1 className="studio-hero-title">工作站</h1>
                <p className="studio-hero-desc">
                    共三种卡片类型。创建流程为「填写档案」→「封面与发布」，便于分步完成；扩展字段会写入作品详情正文，便于后续阅读。
                </p>
            </header>
            <h2 className="studio-type-grid-heading">选择类型</h2>
            <div className="studio-type-grid">
                {Object.entries(TYPE_COPY).map(([label, { blurb }]) => (
                    <button
                        key={label}
                        type="button"
                        className={`studio-type-tile ${selectedCategory === label ? "selected" : ""}`}
                        onClick={() => onSelectType(label)}
                    >
                        <span className="studio-type-tile-label">{label}</span>
                        <span className="studio-type-tile-blurb">{blurb}</span>
                        <span className="studio-type-tile-cta">开始填写</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
