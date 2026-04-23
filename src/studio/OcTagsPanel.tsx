import { useState } from "react";
import {
    canRemoveEmojiTag,
    canRemoveOcTag,
    canRemoveWorldviewTag,
    ensurePrimaryEmoji,
    ensurePrimaryOc,
    ensurePrimaryWorldview,
    parseOcTagList,
    serializeOcTagList,
} from "./ocStudioTags";

type OcTagsPanelProps = {
    value: string;
    onChange: (commaSeparated: string) => void;
    /** OC：`oc`；世界观：`worldview`；表情包：`emoji` 为固定首标签 */
    variant?: "oc" | "worldview" | "emoji";
};

function ensurePrimaryForVariant(variant: "oc" | "worldview" | "emoji", list: string[]) {
    if (variant === "worldview") return ensurePrimaryWorldview(list);
    if (variant === "emoji") return ensurePrimaryEmoji(list);
    return ensurePrimaryOc(list);
}

export function OcTagsPanel({ value, onChange, variant = "oc" }: OcTagsPanelProps) {
    const tags = ensurePrimaryForVariant(variant, parseOcTagList(value));
    const [draft, setDraft] = useState("");

    const commit = (next: string[]) => {
        onChange(serializeOcTagList(ensurePrimaryForVariant(variant, next)));
    };

    const canRemove =
        variant === "worldview" ? canRemoveWorldviewTag : variant === "emoji" ? canRemoveEmojiTag : canRemoveOcTag;

    const add = () => {
        const t = draft.trim();
        if (!t) return;
        if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
            setDraft("");
            return;
        }
        commit([...tags, t]);
        setDraft("");
    };

    const remove = (tag: string) => {
        if (!canRemove(tag)) return;
        commit(tags.filter((x) => x.toLowerCase() !== tag.toLowerCase()));
    };

    return (
        <div className="studio-ws-oc-tags-panel">
            <div className="studio-ws-chips-row studio-ws-oc-tags-chips">
                {tags.map((t) => (
                    <span
                        key={t}
                        className="studio-ws-chip studio-ws-chip--solid"
                        title={canRemove(t) ? undefined : "默认标签，不可删除"}
                    >
                        {t}
                        {canRemove(t) ? (
                            <button type="button" className="studio-ws-chip-x" onClick={() => remove(t)} aria-label={`移除标签 ${t}`}>
                                ×
                            </button>
                        ) : null}
                    </span>
                ))}
            </div>
            <div className="studio-ws-inline2 studio-ws-oc-add-row studio-ws-oc-tags-add">
                <input
                    className="studio-ws-input"
                    placeholder="新标签名称"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add();
                        }
                    }}
                    aria-label="添加标签"
                />
                <button type="button" className="studio-ws-btn studio-ws-btn--ghost studio-ws-oc-add-btn" onClick={add}>
                    添加
                </button>
            </div>
        </div>
    );
}
