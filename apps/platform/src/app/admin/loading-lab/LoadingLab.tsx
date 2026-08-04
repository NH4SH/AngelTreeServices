"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { ArtisticTreeLoader, type ArtisticTreeVariant } from "./TreeArtwork";

const variants = [
  { id: "a", name: "Botanical Line Tree", description: "Fine, hand-drawn, and graceful", detail: "A tapered sketch with curved limbs, delicate twigs, and sparse leaves." },
  { id: "b", name: "Graceful Canopy Tree", description: "Mature, layered, and recognizable", detail: "An open deciduous crown built from irregular overlapping foliage." },
  { id: "c", name: "Ink / Brush Tree", description: "Expressive, restrained, and artistic", detail: "Brush-weight structure and loose foliage washes form through negative space." },
  { id: "d", name: "Angel Tree Signature", description: "Grounded, crafted, and distinctive", detail: "Root gestures, strong branching, and a broad crown grow from the center outward." },
] as const satisfies ReadonlyArray<{ id: ArtisticTreeVariant; name: string; description: string; detail: string }>;

type VariantId = (typeof variants)[number]["id"];
type ReplayState = Record<VariantId, number>;

const initialReplayState: ReplayState = { a: 0, b: 0, c: 0, d: 0 };

export function LoadingLab() {
  const [background, setBackground] = useState<"white" | "green">("white");
  const [replays, setReplays] = useState<ReplayState>(initialReplayState);

  function replay(variant: VariantId) {
    setReplays((current) => ({ ...current, [variant]: current[variant] + 1 }));
  }

  function replayAll() {
    setReplays((current) => ({
      a: current.a + 1,
      b: current.b + 1,
      c: current.c + 1,
      d: current.d + 1,
    }));
  }

  return (
    <div className={`loading-lab ${background === "green" ? "is-soft-green" : "is-white"}`}>
      <section className="loading-lab-toolbar" aria-label="Prototype controls">
        <div>
          <strong>Preview background</strong>
          <span>Compare each tree against the platform surfaces.</span>
        </div>
        <div className="loading-lab-toolbar-actions">
          <div className="loading-lab-background-control" aria-label="Preview background" role="group">
            <button aria-pressed={background === "white"} onClick={() => setBackground("white")} type="button">
              <span className="loading-lab-swatch is-white" aria-hidden="true" />White
            </button>
            <button aria-pressed={background === "green"} onClick={() => setBackground("green")} type="button">
              <span className="loading-lab-swatch is-green" aria-hidden="true" />Soft green
            </button>
          </div>
          <button className="secondary-action button-reset loading-lab-replay-all" onClick={replayAll} type="button">
            <RotateCcw aria-hidden="true" size={16} />Replay all
          </button>
        </div>
      </section>

      <section aria-labelledby="standalone-loaders-heading">
        <div className="loading-lab-section-heading">
          <div>
            <p className="surface-label">Standalone study</p>
            <h2 id="standalone-loaders-heading">Tree growth directions</h2>
          </div>
          <p>Each cycle pauses at full growth, then fades before restarting.</p>
        </div>
        <div className="loading-variant-grid">
          {variants.map((variant) => (
            <article className="loading-variant-card" key={variant.id}>
              <header>
                <span aria-hidden="true">{variant.id.toUpperCase()}</span>
                <div><h3>{variant.name}</h3><p>{variant.description}</p></div>
              </header>
              <div className="loading-variant-stage">
                <ArtisticTreeLoader key={`${variant.id}-${replays[variant.id]}`} variant={variant.id} />
              </div>
              <footer>
                <p>{variant.detail}</p>
                <button className="secondary-action button-reset" onClick={() => replay(variant.id)} type="button">
                  <RotateCcw aria-hidden="true" size={15} />Replay
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="loading-context-heading">
        <div className="loading-lab-section-heading">
          <div>
            <p className="surface-label">In context</p>
            <h2 id="loading-context-heading">Operations workspace</h2>
          </div>
          <p>A compact approximation of a page transition, without changing real loading behavior.</p>
        </div>
        <div className="loading-context-grid">
          {variants.map((variant) => (
            <article className="loading-context-preview" key={variant.id}>
              <aside aria-hidden="true">
                <span className="loading-context-brand" />
                <i /><i /><i /><i />
              </aside>
              <div>
                <ArtisticTreeLoader context key={`${variant.id}-context-${replays[variant.id]}`} variant={variant.id} />
                <strong>Loading operations...</strong>
                <span>{variant.name}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
