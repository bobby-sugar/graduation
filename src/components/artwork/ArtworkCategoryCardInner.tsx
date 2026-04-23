import { useMemo, useState } from "react";
import type { Artwork } from "../../types";
import type { ArtworkKind } from "../../artwork/apiCategory";
import { normalizeArtworkKind } from "../../artwork/apiCategory";
import type { ArtworkCardPayloadV1 } from "../../artwork/cardPayload";

type Resolve = (u: string) => string;

function ImageOnlyCardContent({ artwork, mainSrc }: { artwork: Artwork; mainSrc: string }) {
    const [loaded, setLoaded] = useState(false);

    return (
        <>
            <img
                src={mainSrc}
                alt={artwork.title}
                className="artwork-card-image"
                loading="lazy"
                onLoad={() => setLoaded(true)}
                style={{ opacity: loaded ? 1 : 0 }}
            />
            {!loaded ? <div className="artwork-card-image-placeholder" /> : null}
        </>
    );
}

function EmojiCardContent({
    payload,
    resolveUrl,
    mainSrc,
}: {
    payload: ArtworkCardPayloadV1 | null;
    resolveUrl: Resolve;
    mainSrc: string;
}) {
    const urls = useMemo(() => {
        const extra = (payload?.extraImageUrls ?? []).map(resolveUrl).filter(Boolean);
        const list = [mainSrc, ...extra].filter(Boolean);
        const out = [...list];
        while (out.length < 4 && out.length > 0) out.push(out[0]);
        return out.slice(0, 9);
    }, [mainSrc, payload?.extraImageUrls, resolveUrl]);

    const cols = urls.length >= 9 ? 3 : 2;

    if (urls.length === 0) {
        return <div className="artwork-card-image-placeholder" />;
    }

    return (
        <div className={`artwork-card-emoji-grid artwork-card-emoji-grid--${cols}`} aria-label="emoji pack preview">
            {urls.slice(0, cols === 3 ? 9 : 4).map((src, i) => (
                <div key={`${src}-${i}`} className="artwork-card-emoji-cell">
                    <img src={src} alt="" loading="lazy" />
                </div>
            ))}
            <div className="artwork-card-emoji-meta">
                {payload?.emoji?.countLabel ? <span>{payload.emoji.countLabel}</span> : null}
                {payload?.emoji?.theme ? <span className="artwork-card-emoji-theme">{payload.emoji.theme}</span> : null}
            </div>
        </div>
    );
}

export function ArtworkCategoryCardInner({
    kind,
    artwork,
    payload,
    resolveUrl,
    mainSrc,
}: {
    kind: ArtworkKind;
    artwork: Artwork;
    payload: ArtworkCardPayloadV1 | null;
    resolveUrl: Resolve;
    mainSrc: string;
}) {
    switch (kind) {
        case "emoji":
            return <EmojiCardContent payload={payload} resolveUrl={resolveUrl} mainSrc={mainSrc} />;
        case "oc":
        case "worldview":
        default:
            return <ImageOnlyCardContent artwork={artwork} mainSrc={mainSrc} />;
    }
}

export function resolveCardKind(artwork: Artwork, payload: ArtworkCardPayloadV1 | null): ArtworkKind {
    if (payload?.kind) return payload.kind;
    return normalizeArtworkKind(artwork.category);
}
