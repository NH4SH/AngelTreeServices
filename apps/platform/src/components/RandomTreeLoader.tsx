"use client";

import { useEffect, useState } from "react";
import { ArtisticTreeLoader } from "@/components/TreeArtwork";
import {
  chooseLoadingTreeVariant,
  isArtisticTreeVariant,
  type ArtisticTreeVariant,
} from "@/lib/loading/tree-variants";

const previousVariantKey = "angel-tree-loading-variant";

export function RandomTreeLoader() {
  const [variant, setVariant] = useState<ArtisticTreeVariant | null>(null);

  useEffect(() => {
    const previous = readPreviousVariant();
    const nextVariant = chooseLoadingTreeVariant(previous, secureRandomValue());

    rememberVariant(nextVariant);
    setVariant(nextVariant);
  }, []);

  return (
    <div className="app-loading-tree" aria-hidden="true">
      {variant ? <ArtisticTreeLoader context variant={variant} /> : null}
    </div>
  );
}

function secureRandomValue() {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] / 2 ** 32;
}

function readPreviousVariant() {
  try {
    const value = window.sessionStorage.getItem(previousVariantKey);
    return isArtisticTreeVariant(value) ? value : null;
  } catch {
    return null;
  }
}

function rememberVariant(variant: ArtisticTreeVariant) {
  try {
    window.sessionStorage.setItem(previousVariantKey, variant);
  } catch {
    // A blocked storage API should not prevent the loading artwork from rendering.
  }
}
