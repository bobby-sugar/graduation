export type WorldviewTimelineRow = { id: string; label: string; value: string };

function newRowId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_ROWS = 32;

type WorldviewTimelineEditorProps = {
    rows: WorldviewTimelineRow[];
    onChange: (next: WorldviewTimelineRow[]) => void;
    /** 空列表时的说明文案；不传则不展示空状态提示 */
    emptyHint?: string;
    labelFieldCaption?: string;
    valueFieldCaption?: string;
    labelPlaceholder?: string;
    valuePlaceholder?: string;
    addButtonLabel?: string;
    removeButtonLabel?: string;
    removeAriaLabel?: string;
};

export function WorldviewTimelineEditor({
    rows,
    onChange,
    emptyHint,
    labelFieldCaption = "节点标题",
    valueFieldCaption = "节点内容",
    labelPlaceholder = "例：第一纪 / 灾变前夜",
    valuePlaceholder = "该阶段发生了什么、关键事件等",
    addButtonLabel = "添加节点",
    removeButtonLabel = "删除",
    removeAriaLabel = "删除此节点",
}: WorldviewTimelineEditorProps) {
    const update = (id: string, patch: Partial<Pick<WorldviewTimelineRow, "label" | "value">>) => {
        onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    const add = () => {
        if (rows.length >= MAX_ROWS) return;
        onChange([...rows, { id: newRowId(), label: "", value: "" }]);
    };

    const remove = (id: string) => {
        onChange(rows.filter((r) => r.id !== id));
    };

    return (
        <div className="studio-ws-wv-timeline">
            {rows.length === 0 && emptyHint ? <p className="studio-ws-wv-timeline-empty">{emptyHint}</p> : null}
            {rows.map((r) => (
                <div key={r.id} className="studio-ws-wv-timeline-row">
                    <div className="studio-ws-wv-timeline-fields">
                        <div className="studio-ws-field studio-ws-field--compact">
                            <label className="studio-ws-label">{labelFieldCaption}</label>
                            <input
                                className="studio-ws-input"
                                type="text"
                                value={r.label}
                                onChange={(e) => update(r.id, { label: e.target.value })}
                                placeholder={labelPlaceholder}
                            />
                        </div>
                        <div className="studio-ws-field">
                            <label className="studio-ws-label">{valueFieldCaption}</label>
                            <textarea
                                className="studio-ws-input studio-ws-textarea"
                                value={r.value}
                                onChange={(e) => update(r.id, { value: e.target.value })}
                                rows={3}
                                placeholder={valuePlaceholder}
                            />
                        </div>
                    </div>
                    <button type="button" className="studio-ws-wv-timeline-remove" onClick={() => remove(r.id)} aria-label={removeAriaLabel}>
                        {removeButtonLabel}
                    </button>
                </div>
            ))}
            <div className="studio-ws-wv-timeline-actions">
                <button type="button" className="studio-ws-btn studio-ws-btn--ghost" onClick={add} disabled={rows.length >= MAX_ROWS}>
                    {rows.length >= MAX_ROWS ? `已达 ${MAX_ROWS} 条上限` : addButtonLabel}
                </button>
            </div>
        </div>
    );
}
