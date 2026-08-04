import { useId } from "react";

export type ArtisticTreeVariant = "a" | "b" | "c" | "d";

export function ArtisticTreeLoader({ context = false, variant }: { context?: boolean; variant: ArtisticTreeVariant }) {
  return (
    <div aria-hidden={context || undefined} className={`motion-tree-loader motion-tree-${variant}${context ? " is-context" : ""}`}>
      {variant === "a" ? <LivingInkTree /> : null}
      {variant === "b" ? <CanopyUnfoldTree /> : null}
      {variant === "c" ? <AngelTreeSignature /> : null}
      {variant === "d" ? <GoldenRatioTree /> : null}
      {context ? null : <span className="sr-only">Loading</span>}
    </div>
  );
}

function DrawPath({ className, d }: { className: string; d: string }) {
  return <path className={`motion-tree-stroke ${className}`} d={d} pathLength={1} />;
}

function svgId(prefix: string, reactId: string) {
  return `${prefix}-${reactId.replaceAll(":", "")}`;
}

function LivingInkTree() {
  const gradientId = svgId("living-ink", useId());

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 200 190">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0.84" y1="1" y2="0">
          <stop offset="0" stopColor="var(--tree-deep)" />
          <stop offset="1" stopColor="var(--tree-forest)" />
        </linearGradient>
      </defs>
      <g className="living-ink-tree">
        <DrawPath className="living-root root-one" d="M99 171 C86 168 73 171 60 177 C73 174 84 175 96 178" />
        <DrawPath className="living-root root-two" d="M101 171 C115 169 129 172 142 179 C128 175 116 176 104 179" />
        <path className="living-trunk" fill={`url(#${gradientId})`} d="M96 173 C91 153 94 137 89 120 C85 105 88 91 94 78 C100 64 98 48 104 29 C107 20 112 12 118 7 C111 27 111 45 108 62 C106 77 101 91 103 107 C106 129 103 151 105 172 C102 176 99 176 96 173Z" />
        <DrawPath className="living-highlight" d="M100 164 C98 143 101 125 97 108 C95 96 99 83 103 71" />

        <DrawPath className="living-branch branch-one" d="M94 137 C78 125 65 113 49 104 C37 97 25 94 13 95" />
        <DrawPath className="living-branch branch-two" d="M97 124 C113 113 127 101 143 94 C157 88 173 88 187 84" />
        <DrawPath className="living-branch branch-three" d="M96 108 C82 98 72 85 62 71 C54 61 45 55 35 51" />
        <DrawPath className="living-branch branch-four" d="M100 96 C114 84 123 70 131 54 C137 42 146 34 158 29" />
        <DrawPath className="living-branch branch-five" d="M103 76 C91 64 85 51 83 37 C81 27 76 20 68 15" />
        <DrawPath className="living-branch branch-six" d="M106 59 C114 48 117 35 116 22 C115 14 118 8 124 3" />

        <DrawPath className="living-twig twig-one" d="M49 104 C38 108 28 108 19 104" />
        <DrawPath className="living-twig twig-two" d="M64 115 C58 104 51 96 42 91" />
        <DrawPath className="living-twig twig-three" d="M143 94 C156 98 168 96 179 91" />
        <DrawPath className="living-twig twig-four" d="M130 102 C137 91 147 83 159 78" />
        <DrawPath className="living-twig twig-five" d="M62 71 C50 74 39 72 29 66" />
        <DrawPath className="living-twig twig-six" d="M131 54 C143 57 154 53 163 45" />
        <DrawPath className="living-twig twig-seven" d="M83 38 C73 36 64 31 57 24" />
        <DrawPath className="living-twig twig-eight" d="M116 24 C107 20 101 14 98 7" />

        <g className="living-foliage">
          <path className="living-wash wash-one" d="M8 101 C9 88 22 80 35 84 C38 72 52 67 62 75 C69 86 64 101 53 110 C38 119 18 115 8 101Z" />
          <path className="living-wash wash-two" d="M28 62 C30 47 44 39 57 45 C63 32 79 29 88 40 C91 55 81 68 68 75 C52 80 37 74 28 62Z" />
          <path className="living-wash wash-three" d="M124 58 C130 42 147 37 159 47 C173 45 184 58 178 72 C166 84 146 84 133 75 C126 70 122 64 124 58Z" />
          <path className="living-leaf leaf-one" d="M12 91 C4 85 7 77 17 78 C24 82 22 90 15 93Z" />
          <path className="living-leaf leaf-two" d="M23 106 C16 100 20 92 29 94 C35 99 32 106 26 109Z" />
          <path className="living-leaf leaf-three" d="M28 63 C19 58 22 50 32 51 C39 55 37 63 30 66Z" />
          <path className="living-leaf leaf-four" d="M48 45 C42 37 48 31 57 35 C62 41 57 48 50 49Z" />
          <path className="living-leaf leaf-five" d="M64 20 C58 13 63 7 72 10 C78 16 73 23 67 24Z" />
          <path className="living-leaf leaf-six" d="M95 7 C98 -1 107 -1 111 6 C110 14 102 16 96 12Z" />
          <path className="living-leaf leaf-seven" d="M120 4 C124 -4 133 -2 135 6 C132 13 124 14 120 9Z" />
          <path className="living-leaf leaf-eight" d="M156 27 C161 19 170 22 171 30 C167 37 159 36 156 31Z" />
          <path className="living-leaf leaf-nine" d="M176 80 C182 73 190 77 190 85 C185 91 178 89 175 84Z" />
          <path className="living-leaf leaf-ten" d="M156 76 C161 68 170 71 171 79 C167 86 159 85 156 80Z" />
        </g>
      </g>
    </svg>
  );
}

function CanopyUnfoldTree() {
  const reactId = useId();
  const maskId = svgId("canopy-mask", reactId);
  const gradientId = svgId("canopy-fill", reactId);

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 200 190">
      <defs>
        <linearGradient id={gradientId} x1="0.16" x2="0.9" y1="0.9" y2="0.1">
          <stop offset="0" stopColor="var(--tree-forest)" />
          <stop offset="0.58" stopColor="var(--tree-mid)" />
          <stop offset="1" stopColor="var(--tree-light)" />
        </linearGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="190">
          <rect width="200" height="190" fill="black" />
          <path className="canopy-mask-stroke mask-one" d="M96 105 C78 91 64 80 43 72 C28 66 16 69 8 78 M98 103 C116 88 132 78 154 73 C171 68 184 73 193 82" pathLength="1" />
          <path className="canopy-mask-stroke mask-two" d="M98 86 C79 71 70 54 72 35 C73 20 83 10 96 5 M101 86 C119 70 127 53 126 35 C125 20 137 10 150 8" pathLength="1" />
          <path className="canopy-mask-stroke mask-three" d="M55 92 C45 109 28 117 12 111 M145 91 C157 106 175 113 191 105 M83 62 C65 50 47 42 30 44 M117 61 C136 48 155 43 174 48" pathLength="1" />
        </mask>
      </defs>
      <g className="canopy-unfold-tree">
        <DrawPath className="canopy-ground" d="M62 174 C84 169 116 170 139 176" />
        <path className="canopy-trunk-shape" d="M94 173 C89 151 92 132 89 116 C85 99 91 88 97 75 C105 58 103 42 106 25 C111 43 111 61 105 78 C101 91 99 104 102 119 C107 139 105 158 107 173 C103 177 98 177 94 173Z" />
        <DrawPath className="canopy-limb limb-one" d="M94 135 C77 120 63 105 45 95 C33 88 21 84 9 84" />
        <DrawPath className="canopy-limb limb-two" d="M98 122 C115 109 130 96 148 88 C162 82 177 81 190 76" />
        <DrawPath className="canopy-limb limb-three" d="M98 104 C82 91 72 77 65 60 C61 50 54 42 44 36" />
        <DrawPath className="canopy-limb limb-four" d="M101 94 C116 80 125 65 132 48 C137 36 146 27 157 22" />
        <DrawPath className="canopy-limb limb-five" d="M103 72 C94 59 90 44 90 28 C90 18 86 11 80 5" />
        <DrawPath className="canopy-detail detail-one" d="M47 96 C34 100 22 98 13 91" />
        <DrawPath className="canopy-detail detail-two" d="M61 106 C56 94 48 84 38 78" />
        <DrawPath className="canopy-detail detail-three" d="M147 88 C161 92 176 89 187 82" />
        <DrawPath className="canopy-detail detail-four" d="M132 98 C139 85 149 76 162 71" />
        <DrawPath className="canopy-detail detail-five" d="M65 60 C52 62 40 58 31 50" />
        <DrawPath className="canopy-detail detail-six" d="M132 48 C145 51 158 46 168 37" />

        <g className="canopy-layers" mask={`url(#${maskId})`}>
          <path className="canopy-shape layer-deep" d="M3 101 C-1 87 9 76 23 75 C19 59 34 49 48 56 C56 44 73 45 80 58 C86 73 77 92 62 103 C43 116 18 116 3 101Z" />
          <path className="canopy-shape layer-mid" d="M24 66 C20 50 33 38 48 42 C51 26 68 19 81 28 C91 17 109 21 113 37 C113 55 99 70 83 77 C60 86 36 80 24 66Z" />
          <path className="canopy-shape layer-light" d="M68 39 C71 20 89 10 105 19 C116 5 136 12 138 30 C150 40 143 57 129 64 C107 72 82 62 70 47Z" />
          <path className="canopy-shape layer-mid" d="M119 50 C127 34 146 30 158 42 C174 39 186 53 181 69 C169 84 147 88 131 77 C121 70 117 60 119 50Z" />
          <path className="canopy-shape layer-deep" d="M143 78 C157 67 177 73 182 89 C196 95 194 112 181 119 C161 122 143 111 138 96 C137 89 139 83 143 78Z" />
          <path className="canopy-shape layer-light" d="M76 78 C87 62 109 61 120 76 C136 79 140 98 127 108 C108 118 85 110 77 94 C74 89 74 83 76 78Z" />
          <path className="canopy-shape layer-mid" d="M37 105 C45 91 63 89 74 101 C89 103 94 120 83 131 C65 142 42 134 35 118 C33 113 34 108 37 105Z" />
          <path className="canopy-shape layer-deep" d="M107 112 C113 96 132 92 144 104 C159 105 166 122 155 134 C138 147 113 139 106 124 C104 120 104 116 107 112Z" />
          <path className="canopy-light-shift" fill={`url(#${gradientId})`} d="M50 57 C73 30 108 24 139 40 C123 42 106 50 94 63 C77 80 60 77 50 57Z" />
        </g>
        <g className="canopy-visible-structure">
          <DrawPath className="canopy-overlay-branch overlay-one" d="M98 121 C114 109 130 96 149 88" />
          <DrawPath className="canopy-overlay-branch overlay-two" d="M98 104 C82 91 72 77 65 60" />
          <DrawPath className="canopy-overlay-branch overlay-three" d="M101 94 C116 80 125 65 132 48" />
          <DrawPath className="canopy-overlay-branch overlay-four" d="M103 72 C94 59 90 44 90 28" />
        </g>
        <g className="canopy-edge-details">
          <path className="canopy-edge edge-one" d="M8 72 C1 66 4 58 13 59 C21 63 19 71 12 74Z" />
          <path className="canopy-edge edge-two" d="M35 40 C29 33 34 26 43 30 C49 36 44 43 37 44Z" />
          <path className="canopy-edge edge-three" d="M78 9 C81 1 90 1 94 8 C93 16 85 18 79 14Z" />
          <path className="canopy-edge edge-four" d="M157 18 C163 11 171 15 171 23 C166 29 159 27 156 22Z" />
          <path className="canopy-edge edge-five" d="M186 75 C193 70 200 75 198 83 C193 88 186 84 184 79Z" />
        </g>
      </g>
    </svg>
  );
}

function AngelTreeSignature() {
  const gradientId = svgId("signature-trunk", useId());

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 200 190">
      <defs>
        <linearGradient id={gradientId} x1="0.12" x2="0.82" y1="1" y2="0">
          <stop offset="0" stopColor="var(--tree-deep)" />
          <stop offset="0.72" stopColor="var(--tree-forest)" />
          <stop offset="1" stopColor="var(--tree-mid)" />
        </linearGradient>
      </defs>
      <g className="signature-tree">
        <g className="signature-roots">
          <DrawPath className="signature-root root-one" d="M99 169 C84 166 68 170 52 179 C68 174 82 175 96 180" />
          <DrawPath className="signature-root root-two" d="M102 169 C117 166 133 171 150 180 C134 175 119 176 105 180" />
          <DrawPath className="signature-root root-three" d="M97 173 C86 179 75 182 63 183" />
        </g>
        <path className="signature-trunk-shape" fill={`url(#${gradientId})`} d="M94 172 C90 152 93 134 88 118 C83 102 87 88 94 75 C102 60 102 45 108 26 C111 17 117 9 125 4 C118 25 117 43 113 62 C109 78 103 91 106 108 C110 132 107 153 109 172 C105 177 98 178 94 172Z" />
        <DrawPath className="signature-highlight" d="M101 164 C99 144 103 124 98 107 C95 94 100 82 106 70" />

        <DrawPath className="signature-limb limb-one" d="M94 139 C75 124 61 111 42 102 C30 96 18 94 6 95" />
        <DrawPath className="signature-limb limb-two" d="M98 127 C116 114 131 101 150 94 C164 88 179 88 194 83" />
        <DrawPath className="signature-limb limb-three" d="M97 111 C81 99 70 86 61 70 C54 59 45 52 34 48" />
        <DrawPath className="signature-limb limb-four" d="M102 100 C117 87 128 72 136 55 C143 42 152 33 165 28" />
        <DrawPath className="signature-limb limb-five" d="M105 81 C94 68 88 54 87 39 C86 27 81 19 72 13" />
        <DrawPath className="signature-limb limb-six" d="M110 62 C119 50 122 36 121 22 C121 13 125 6 132 2" />

        <DrawPath className="signature-branch branch-one" d="M42 102 C30 107 18 106 9 101" />
        <DrawPath className="signature-branch branch-two" d="M59 112 C53 100 44 91 33 86" />
        <DrawPath className="signature-branch branch-three" d="M150 94 C164 99 179 97 191 90" />
        <DrawPath className="signature-branch branch-four" d="M134 103 C141 90 152 80 166 74" />
        <DrawPath className="signature-branch branch-five" d="M61 70 C48 73 36 70 26 63" />
        <DrawPath className="signature-branch branch-six" d="M136 55 C150 58 164 53 174 44" />
        <DrawPath className="signature-branch branch-seven" d="M87 39 C76 38 66 33 59 25" />
        <DrawPath className="signature-branch branch-eight" d="M121 23 C111 19 104 12 100 5" />

        <g className="signature-crown">
          <path className="signature-cluster cluster-one layer-deep" d="M1 103 C-2 88 9 77 23 78 C20 62 36 52 50 59 C60 72 56 90 44 102 C31 114 13 115 1 103Z" />
          <path className="signature-cluster cluster-two layer-mid" d="M25 72 C23 56 37 44 52 49 C56 33 74 27 86 38 C92 54 83 69 69 78 C52 87 35 82 25 72Z" />
          <path className="signature-cluster cluster-three layer-light" d="M64 45 C67 26 84 17 100 26 C111 12 132 18 134 36 C127 54 109 64 91 61 C78 59 69 53 64 45Z" />
          <path className="signature-cluster cluster-four layer-deep" d="M118 50 C126 33 146 29 159 42 C175 40 187 55 181 71 C169 86 146 89 130 78 C120 71 116 61 118 50Z" />
          <path className="signature-cluster cluster-five layer-mid" d="M146 81 C159 69 180 75 185 92 C198 99 194 117 180 122 C160 123 142 112 139 96 C138 90 141 85 146 81Z" />
          <path className="signature-cluster cluster-six layer-light" d="M77 80 C88 63 110 62 121 77 C137 79 142 98 129 109 C110 120 86 112 77 96 C74 90 74 85 77 80Z" />
          <path className="signature-cluster cluster-seven layer-mid" d="M30 111 C39 96 58 94 69 107 C84 109 89 127 77 137 C59 147 37 138 29 123 C27 118 27 114 30 111Z" />
          <path className="signature-cluster cluster-eight layer-deep" d="M108 116 C114 99 134 95 146 108 C161 109 168 127 157 139 C139 152 114 143 107 128 C105 123 105 119 108 116Z" />
          <path className="signature-cluster cluster-nine layer-light" d="M50 39 C52 25 66 18 78 25 C83 36 77 49 66 55 C57 56 51 50 50 39Z" />
          <path className="signature-cluster cluster-ten layer-mid" d="M139 35 C145 23 160 20 170 29 C176 42 167 55 154 58 C144 54 138 46 139 35Z" />
          <path className="signature-accent accent-one" d="M17 75 C11 68 16 61 25 64 C31 70 26 77 19 78Z" />
          <path className="signature-accent accent-two" d="M174 74 C180 67 189 71 189 79 C184 85 177 83 174 78Z" />
          <path className="signature-accent accent-three" d="M128 8 C133 1 142 4 142 12 C137 18 130 16 127 11Z" />
        </g>
      </g>
    </svg>
  );
}

function GoldenRatioTree() {
  const gradientId = svgId("ratio-trunk", useId());

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 200 190">
      <defs>
        <linearGradient id={gradientId} x1="0.15" x2="0.88" y1="1" y2="0">
          <stop offset="0" stopColor="var(--tree-deep)" />
          <stop offset="0.62" stopColor="var(--tree-forest)" />
          <stop offset="1" stopColor="var(--tree-mid)" />
        </linearGradient>
      </defs>
      <g className="ratio-tree">
        <g className="ratio-seed-roots">
          <path className="ratio-seed" d="M98 174 C91 169 93 162 101 161 C109 164 108 172 102 176Z" />
          <DrawPath className="ratio-root root-one" d="M99 172 C85 169 71 173 58 181 C71 176 84 176 97 181" />
          <DrawPath className="ratio-root root-two" d="M102 172 C116 168 131 173 145 181 C131 176 117 176 104 181" />
        </g>
        <path className="ratio-trunk-shape" fill={`url(#${gradientId})`} d="M96 173 C91 153 94 134 90 118 C86 101 90 88 97 75 C105 60 103 45 108 29 C111 19 116 11 123 5 C117 24 117 42 113 59 C109 76 103 89 106 106 C110 128 108 151 110 172 C106 177 100 178 96 173Z" />
        <DrawPath className="ratio-trunk-light" d="M102 164 C100 144 104 125 100 108 C97 95 101 82 107 69" />

        <DrawPath className="ratio-primary ratio-one" d="M95 140 C80 128 66 118 49 110 C36 104 24 102 13 105" />
        <DrawPath className="ratio-primary ratio-two" d="M99 127 C115 117 129 106 146 101 C159 97 173 99 185 94" />
        <DrawPath className="ratio-primary ratio-three" d="M97 112 C83 102 72 90 64 76 C57 65 48 58 38 55" />
        <DrawPath className="ratio-primary ratio-four" d="M102 101 C116 90 126 77 133 62 C139 50 148 42 159 37" />
        <DrawPath className="ratio-primary ratio-five" d="M105 83 C95 72 90 59 89 45 C88 34 84 27 77 21" />
        <DrawPath className="ratio-primary ratio-six" d="M109 65 C117 55 120 43 119 31 C118 22 122 15 128 11" />

        <DrawPath className="ratio-secondary ratio-one" d="M49 110 C38 117 26 118 16 114" />
        <DrawPath className="ratio-secondary ratio-two" d="M63 120 C58 108 50 99 40 94" />
        <DrawPath className="ratio-secondary ratio-two" d="M146 101 C159 108 173 106 184 100" />
        <DrawPath className="ratio-secondary ratio-three" d="M131 109 C138 97 148 89 160 85" />
        <DrawPath className="ratio-secondary ratio-three" d="M64 76 C52 81 40 79 31 73" />
        <DrawPath className="ratio-secondary ratio-four" d="M133 62 C146 67 159 63 169 55" />
        <DrawPath className="ratio-secondary ratio-four" d="M89 45 C79 45 70 41 63 34" />
        <DrawPath className="ratio-secondary ratio-five" d="M119 32 C110 29 103 23 99 16" />
        <DrawPath className="ratio-secondary ratio-five" d="M78 22 C70 21 63 17 58 11" />
        <DrawPath className="ratio-secondary ratio-five" d="M40 94 C30 91 23 84 19 76" />
        <DrawPath className="ratio-secondary ratio-five" d="M160 85 C170 83 178 78 184 71" />

        <g className="ratio-foliage">
          <path className="ratio-cluster cluster-one layer-deep" d="M7 109 C5 99 13 91 23 93 C25 84 35 79 43 85 C49 94 44 106 35 112 C24 118 13 116 7 109Z" />
          <path className="ratio-cluster cluster-two layer-mid" d="M28 80 C29 69 39 62 49 66 C54 57 66 56 72 65 C74 76 66 85 57 89 C45 93 34 88 28 80Z" />
          <path className="ratio-cluster cluster-three layer-light" d="M58 53 C62 42 73 37 82 42 C89 34 101 38 103 48 C99 59 88 65 78 63 C68 62 62 58 58 53Z" />
          <path className="ratio-cluster cluster-four layer-deep" d="M113 56 C119 46 131 44 139 51 C149 50 156 59 153 68 C146 78 133 81 123 75 C116 71 112 64 113 56Z" />
          <path className="ratio-cluster cluster-five layer-mid" d="M143 85 C151 77 163 80 167 90 C176 94 174 105 166 110 C154 112 143 105 140 96 C139 92 140 88 143 85Z" />
          <path className="ratio-cluster cluster-six layer-light" d="M82 84 C89 74 103 73 111 82 C122 83 126 95 118 103 C107 111 92 107 84 98 C80 94 79 89 82 84Z" />
          <path className="ratio-cluster cluster-seven layer-mid" d="M44 116 C49 106 61 104 69 112 C78 114 81 125 74 132 C63 139 50 135 44 126 C41 123 41 119 44 116Z" />
          <path className="ratio-cluster cluster-eight layer-deep" d="M116 119 C121 109 133 106 141 114 C151 115 155 126 148 134 C137 142 123 137 117 129 C114 126 114 122 116 119Z" />
          <path className="ratio-cluster cluster-nine layer-light" d="M94 27 C97 17 108 13 116 20 C120 29 113 38 104 41 C97 39 93 34 94 27Z" />
          <path className="ratio-cluster cluster-ten layer-mid" d="M65 31 C66 22 75 17 83 21 C88 29 83 38 75 42 C68 40 64 36 65 31Z" />
          <path className="ratio-cluster cluster-eleven layer-light" d="M135 39 C140 31 150 30 156 37 C158 46 150 53 142 53 C136 49 133 45 135 39Z" />
          <path className="ratio-cluster cluster-twelve layer-mid" d="M159 67 C165 60 175 62 179 70 C179 79 170 84 163 81 C158 77 157 72 159 67Z" />
          <path className="ratio-leaf leaf-one" d="M13 102 C6 96 10 89 19 91 C25 96 22 103 16 106Z" />
          <path className="ratio-leaf leaf-two" d="M35 57 C29 50 34 43 43 47 C49 53 44 60 37 61Z" />
          <path className="ratio-leaf leaf-three" d="M61 31 C56 24 61 18 69 21 C75 27 71 34 64 35Z" />
          <path className="ratio-leaf leaf-four" d="M126 11 C130 4 139 6 141 14 C137 21 130 20 126 16Z" />
          <path className="ratio-leaf leaf-five" d="M158 35 C164 29 172 33 171 41 C166 47 159 44 157 39Z" />
          <path className="ratio-leaf leaf-six" d="M181 91 C187 85 195 89 194 97 C189 103 182 100 180 95Z" />
          <path className="ratio-leaf leaf-seven" d="M159 81 C164 74 173 77 173 85 C169 92 161 89 159 85Z" />
        </g>
      </g>
    </svg>
  );
}
