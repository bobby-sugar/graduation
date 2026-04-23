import { useMemo, useState } from "react";
import type { Artwork } from "../../types";
import { splitDescriptionAndCardPayload } from "../../artwork/cardPayload";
import { resolveArtworkUrl } from "./resolveArtworkUrl";
import { ArtworkCategoryCardInner, resolveCardKind } from "./ArtworkCategoryCardInner";
import { ArtworkCardShell } from "./ArtworkCardShell";
import { API_BASE_URL } from "../../config/api";

interface ArtworkCardProps {
    artwork: Artwork;
    onClick?: () => void;
    apiBaseUrl?: string;
}

export default function ArtworkCard({
    artwork,
    onClick,
    apiBaseUrl = API_BASE_URL,
}: ArtworkCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    const { payload } = useMemo(
        () => splitDescriptionAndCardPayload(artwork.description ?? null),
        [artwork.description],
    );

    const kind = resolveCardKind(artwork, payload);

    const resolveUrl = (u: string) => resolveArtworkUrl(u, apiBaseUrl);
    const mainSrc = resolveUrl(artwork.imageUrl);
    const seedImg = !mainSrc && artwork.id ? resolveUrl(`/uploads/oc_${artwork.id}.jpg`) : "";
    const displayMain = mainSrc || seedImg;

    return (
        <ArtworkCardShell
            artwork={artwork}
            kind={kind}
            apiBaseUrl={apiBaseUrl}
            isHovered={isHovered}
            onHoverChange={setIsHovered}
            onClick={onClick}
        >
            <ArtworkCategoryCardInner
                kind={kind}
                artwork={artwork}
                payload={payload}
                resolveUrl={resolveUrl}
                mainSrc={displayMain}
            />
        </ArtworkCardShell>
    );
}
