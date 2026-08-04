export type ArtisticTreeVariant = "a" | "b" | "c" | "d";

export function ArtisticTreeLoader({ context = false, variant }: { context?: boolean; variant: ArtisticTreeVariant }) {
  return (
    <div aria-hidden={context || undefined} className={`art-tree-loader art-tree-${variant}${context ? " is-context" : ""}`}>
      {variant === "a" ? <BotanicalLineTree /> : null}
      {variant === "b" ? <GracefulCanopyTree /> : null}
      {variant === "c" ? <InkBrushTree /> : null}
      {variant === "d" ? <SignatureTree /> : null}
      {context ? null : <span className="sr-only">Loading</span>}
    </div>
  );
}

function DrawPath({ className, d }: { className: string; d: string }) {
  return <path className={`art-tree-stroke ${className}`} d={d} pathLength={1} />;
}

function BotanicalLineTree() {
  return (
    <svg aria-hidden="true" className="art-tree-svg" viewBox="0 0 180 170">
      <g className="art-tree-botanical">
        <DrawPath className="art-tree-ground" d="M67 155 C79 153 103 153 115 156" />
        <DrawPath className="art-tree-trunk" d="M90 154 C87 139 91 126 87 111 C83 97 87 85 91 73 C95 59 92 43 98 22" />
        <DrawPath className="art-tree-primary phase-one" d="M88 116 C75 108 67 97 57 84 C50 76 44 69 35 64" />
        <DrawPath className="art-tree-primary phase-one" d="M88 103 C102 94 113 84 124 72 C131 64 135 56 140 48" />
        <DrawPath className="art-tree-primary phase-two" d="M90 87 C79 77 74 66 70 52 C68 43 65 36 61 31" />
        <DrawPath className="art-tree-primary phase-two" d="M92 74 C104 65 112 55 117 42 C121 34 126 27 132 21" />
        <DrawPath className="art-tree-primary phase-three" d="M95 55 C86 47 82 38 81 27" />

        <DrawPath className="art-tree-secondary phase-one" d="M61 89 C53 84 46 80 38 78" />
        <DrawPath className="art-tree-secondary phase-two" d="M68 98 C63 91 60 84 59 77" />
        <DrawPath className="art-tree-secondary phase-one" d="M117 79 C127 78 135 74 143 67" />
        <DrawPath className="art-tree-secondary phase-two" d="M111 86 C118 79 121 71 121 63" />
        <DrawPath className="art-tree-secondary phase-two" d="M72 58 C63 56 55 52 48 47" />
        <DrawPath className="art-tree-secondary phase-three" d="M69 50 C73 43 74 36 73 29" />
        <DrawPath className="art-tree-secondary phase-two" d="M116 44 C108 39 103 33 101 26" />
        <DrawPath className="art-tree-secondary phase-three" d="M122 34 C132 35 140 32 147 27" />
        <DrawPath className="art-tree-twig phase-one" d="M44 71 C38 68 33 64 29 59" />
        <DrawPath className="art-tree-twig phase-two" d="M136 58 C143 57 149 53 154 48" />
        <DrawPath className="art-tree-twig phase-three" d="M83 35 C89 30 91 24 92 17" />

        <g className="art-tree-leaves">
          <path className="art-tree-leaf foliage-one" d="M25 57 C20 51 22 45 30 47 C35 49 35 54 31 58 C29 60 27 60 25 57Z" />
          <path className="art-tree-leaf foliage-one" d="M35 75 C29 70 31 64 39 65 C45 66 46 71 41 75 C39 77 37 77 35 75Z" />
          <path className="art-tree-leaf foliage-two" d="M45 45 C41 39 44 34 51 36 C57 38 57 43 52 47 C49 49 47 48 45 45Z" />
          <path className="art-tree-leaf foliage-two" d="M57 28 C52 23 55 18 62 20 C68 22 68 27 64 31 C61 33 59 32 57 28Z" />
          <path className="art-tree-leaf foliage-three" d="M69 25 C66 19 70 15 76 18 C81 21 80 26 75 29 C72 30 70 29 69 25Z" />
          <path className="art-tree-leaf foliage-three" d="M78 16 C75 10 80 7 86 11 C90 14 88 19 83 21 C81 21 79 20 78 16Z" />
          <path className="art-tree-leaf foliage-one" d="M143 64 C146 57 152 57 155 63 C158 69 153 72 147 70 C144 69 142 67 143 64Z" />
          <path className="art-tree-leaf foliage-two" d="M151 45 C154 38 160 39 163 45 C165 51 160 54 154 52 C151 51 150 48 151 45Z" />
          <path className="art-tree-leaf foliage-two" d="M142 24 C146 18 152 19 154 25 C156 31 151 34 146 31 C143 30 141 27 142 24Z" />
          <path className="art-tree-leaf foliage-three" d="M130 17 C133 11 139 11 142 17 C144 22 140 26 135 24 C131 23 129 20 130 17Z" />
          <path className="art-tree-leaf foliage-three" d="M97 17 C100 11 106 12 108 18 C110 23 105 26 101 23 C98 22 96 20 97 17Z" />
          <path className="art-tree-leaf foliage-two" d="M101 28 C105 23 111 25 112 31 C113 36 108 39 104 36 C101 34 99 31 101 28Z" />
        </g>
      </g>
    </svg>
  );
}

function GracefulCanopyTree() {
  return (
    <svg aria-hidden="true" className="art-tree-svg" viewBox="0 0 180 170">
      <g className="art-tree-canopy-structure">
        <DrawPath className="art-tree-ground" d="M57 156 C79 152 106 153 126 157" />
        <DrawPath className="art-tree-trunk canopy-trunk" d="M90 154 C88 133 84 116 91 97 C95 84 97 67 95 50" />
        <DrawPath className="art-tree-primary phase-one" d="M89 122 C73 109 62 99 48 86 C40 79 32 73 24 68" />
        <DrawPath className="art-tree-primary phase-one" d="M90 111 C105 100 115 88 130 78 C139 72 149 67 158 64" />
        <DrawPath className="art-tree-primary phase-two" d="M92 94 C77 84 70 72 62 57 C57 49 52 43 46 39" />
        <DrawPath className="art-tree-primary phase-two" d="M94 87 C109 77 119 64 128 50 C133 42 140 36 148 31" />
        <DrawPath className="art-tree-primary phase-three" d="M95 70 C85 58 81 46 80 32 C80 24 77 18 74 13" />
        <DrawPath className="art-tree-primary phase-three" d="M96 60 C104 49 108 37 108 23 C108 17 111 11 116 8" />
        <DrawPath className="art-tree-secondary phase-one" d="M55 92 C43 91 33 87 25 81" />
        <DrawPath className="art-tree-secondary phase-two" d="M67 103 C63 92 56 83 47 77" />
        <DrawPath className="art-tree-secondary phase-one" d="M123 84 C136 84 147 80 158 73" />
        <DrawPath className="art-tree-secondary phase-two" d="M116 90 C120 78 127 68 137 60" />
        <DrawPath className="art-tree-secondary phase-three" d="M61 57 C49 58 39 55 30 49" />
        <DrawPath className="art-tree-secondary phase-three" d="M128 50 C139 51 150 47 159 41" />
      </g>

      <g className="art-tree-canopy-crown">
        <path className="art-tree-cluster foliage-one tone-deep" d="M14 90 C7 80 13 68 25 65 C21 53 31 44 43 47 C47 37 59 35 68 42 C73 53 69 69 58 79 C45 89 28 95 14 90Z" />
        <path className="art-tree-cluster foliage-one tone-mid" d="M39 58 C32 46 40 33 53 31 C54 20 67 14 77 20 C85 11 100 13 105 24 C107 37 98 51 85 58 C69 66 51 66 39 58Z" />
        <path className="art-tree-cluster foliage-two tone-light" d="M69 39 C67 25 79 16 92 19 C98 7 114 7 120 18 C133 14 144 24 140 37 C132 50 117 57 101 55 C86 54 74 48 69 39Z" />
        <path className="art-tree-cluster foliage-one tone-deep" d="M111 52 C112 40 124 33 135 37 C143 28 157 33 157 45 C168 49 169 63 160 69 C146 74 128 71 117 64 C112 61 110 57 111 52Z" />
        <path className="art-tree-cluster foliage-two tone-mid" d="M128 77 C132 65 145 60 155 67 C166 63 174 73 170 84 C177 92 169 104 158 103 C144 101 132 93 128 83 C127 81 127 79 128 77Z" />
        <path className="art-tree-cluster foliage-two tone-light" d="M79 74 C76 60 88 51 100 55 C109 45 124 51 125 63 C135 69 131 83 120 87 C105 92 87 87 79 78Z" />
        <path className="art-tree-cluster foliage-three tone-mid" d="M27 102 C22 91 33 82 44 84 C50 74 64 76 68 87 C79 90 82 103 73 110 C60 119 39 116 29 107Z" />
        <path className="art-tree-cluster foliage-three tone-deep" d="M102 105 C98 94 108 85 119 88 C128 79 142 84 143 96 C154 101 153 114 143 120 C127 126 109 119 103 109Z" />
      </g>
    </svg>
  );
}

function InkBrushTree() {
  return (
    <svg aria-hidden="true" className="art-tree-svg" viewBox="0 0 180 170">
      <g className="art-tree-ink">
        <path className="art-tree-ink-ground" d="M47 157 C69 151 97 153 135 159 C108 160 75 161 47 157Z" />
        <path className="art-tree-ink-trunk" d="M87 155 C84 133 87 115 82 98 C78 85 83 76 87 65 C92 52 88 38 95 18 C96 43 101 57 96 72 C92 84 95 97 94 109 C93 128 98 144 101 156 C96 153 91 153 87 155Z" />
        <DrawPath className="art-tree-ink-branch phase-one" d="M88 118 C71 105 57 92 38 82 C29 77 21 72 15 65" />
        <DrawPath className="art-tree-ink-branch phase-one wide" d="M91 108 C108 97 120 83 135 74 C146 67 157 62 169 60" />
        <DrawPath className="art-tree-ink-branch phase-two" d="M91 91 C77 79 68 66 59 51 C54 43 47 38 39 34" />
        <DrawPath className="art-tree-ink-branch phase-two wide" d="M94 83 C106 72 112 59 117 45 C121 34 128 25 138 19" />
        <DrawPath className="art-tree-ink-branch phase-three" d="M94 58 C85 49 81 39 79 28 C77 21 74 16 69 12" />
        <DrawPath className="art-tree-ink-detail phase-one" d="M55 94 C45 95 36 92 29 87" />
        <DrawPath className="art-tree-ink-detail phase-two" d="M126 80 C139 81 150 77 160 70" />
        <DrawPath className="art-tree-ink-detail phase-two" d="M59 51 C48 53 37 50 28 44" />
        <DrawPath className="art-tree-ink-detail phase-three" d="M117 45 C129 47 141 43 150 35" />

        <g className="art-tree-ink-washes">
          <path className="art-tree-wash foliage-one tone-deep" d="M8 83 C14 61 32 46 55 43 C65 55 58 74 44 85 C31 95 17 96 8 83Z" />
          <path className="art-tree-wash foliage-two tone-mid" d="M31 48 C42 25 65 16 86 25 C91 42 81 58 65 66 C50 72 37 64 31 48Z" />
          <path className="art-tree-wash foliage-two tone-light" d="M74 30 C91 9 119 9 133 27 C132 45 116 59 98 59 C84 56 76 47 74 30Z" />
          <path className="art-tree-wash foliage-one tone-deep" d="M117 44 C135 28 160 35 169 54 C164 72 147 84 129 78 C118 69 115 58 117 44Z" />
          <path className="art-tree-wash foliage-three tone-mid" d="M119 79 C138 68 160 77 166 96 C157 112 137 117 120 107 C113 98 113 88 119 79Z" />
          <path className="art-tree-wash foliage-three tone-light" d="M40 91 C55 74 79 77 88 96 C83 113 63 122 47 112 C39 106 36 99 40 91Z" />
        </g>
        <g className="art-tree-ink-marks">
          <path className="art-tree-brush-mark foliage-two" d="M20 54 C26 48 33 47 38 51 C32 56 26 58 20 54Z" />
          <path className="art-tree-brush-mark foliage-three" d="M146 44 C153 41 160 44 162 49 C155 51 149 49 146 44Z" />
          <path className="art-tree-brush-mark foliage-three" d="M92 17 C98 12 106 13 110 18 C103 22 97 21 92 17Z" />
        </g>
      </g>
    </svg>
  );
}

function SignatureTree() {
  return (
    <svg aria-hidden="true" className="art-tree-svg" viewBox="0 0 180 170">
      <g className="art-tree-signature">
        <g className="art-tree-signature-roots">
          <DrawPath className="art-tree-root-path phase-one" d="M91 154 C78 151 66 153 54 158" />
          <DrawPath className="art-tree-root-path phase-one" d="M93 154 C106 151 119 154 132 159" />
          <DrawPath className="art-tree-root-path phase-two" d="M89 156 C82 159 74 161 66 162" />
        </g>
        <g className="art-tree-signature-growth">
          <DrawPath className="art-tree-trunk signature-trunk" d="M92 155 C88 136 90 119 86 105 C82 91 88 81 92 68 C97 52 93 37 99 17" />
          <DrawPath className="art-tree-trunk-highlight" d="M94 148 C92 128 95 112 92 97 C90 86 94 73 97 62" />
          <DrawPath className="art-tree-primary phase-one" d="M88 120 C72 108 59 96 44 86 C33 79 23 74 13 71" />
          <DrawPath className="art-tree-primary phase-one" d="M89 109 C106 99 120 87 136 78 C148 71 159 68 169 65" />
          <DrawPath className="art-tree-primary phase-two" d="M91 94 C77 83 68 70 59 55 C52 45 44 39 35 35" />
          <DrawPath className="art-tree-primary phase-two" d="M94 86 C108 74 117 62 124 48 C131 36 140 28 151 23" />
          <DrawPath className="art-tree-primary phase-three" d="M95 68 C85 56 80 44 79 31 C78 22 74 15 68 10" />
          <DrawPath className="art-tree-primary phase-three" d="M97 57 C107 46 110 34 110 21 C111 13 115 7 121 4" />
          <DrawPath className="art-tree-secondary phase-one" d="M55 94 C43 95 33 92 24 86" />
          <DrawPath className="art-tree-secondary phase-one" d="M69 105 C64 94 56 86 47 81" />
          <DrawPath className="art-tree-secondary phase-one" d="M126 84 C140 84 152 80 162 73" />
          <DrawPath className="art-tree-secondary phase-two" d="M118 91 C123 78 131 68 141 61" />
          <DrawPath className="art-tree-secondary phase-two" d="M60 56 C48 58 37 55 28 49" />
          <DrawPath className="art-tree-secondary phase-two" d="M124 48 C138 50 150 46 160 38" />
          <DrawPath className="art-tree-secondary phase-three" d="M79 31 C69 29 61 25 54 19" />
          <DrawPath className="art-tree-secondary phase-three" d="M110 23 C101 19 95 13 91 7" />

          <g className="art-tree-signature-crown">
            <path className="art-tree-signature-cluster foliage-one tone-deep" d="M8 86 C4 73 14 62 27 62 C25 49 39 42 50 48 C60 57 58 73 49 84 C37 95 20 98 8 86Z" />
            <path className="art-tree-signature-cluster foliage-one tone-mid" d="M32 54 C31 40 44 32 56 36 C62 23 78 22 85 33 C89 47 79 60 66 67 C52 72 39 66 32 54Z" />
            <path className="art-tree-signature-cluster foliage-two tone-light" d="M65 34 C70 18 87 13 99 23 C108 10 126 15 128 30 C125 45 109 55 94 53 C80 52 69 45 65 34Z" />
            <path className="art-tree-signature-cluster foliage-one tone-deep" d="M111 42 C120 28 139 27 148 40 C162 38 172 51 166 64 C154 77 134 79 120 68 C112 61 109 52 111 42Z" />
            <path className="art-tree-signature-cluster foliage-two tone-mid" d="M129 75 C141 63 160 67 166 82 C178 88 174 105 161 109 C145 111 130 102 126 89 C125 84 126 79 129 75Z" />
            <path className="art-tree-signature-cluster foliage-two tone-light" d="M73 67 C80 53 98 50 108 62 C121 61 129 74 123 86 C110 97 90 97 77 86 C72 81 70 74 73 67Z" />
            <path className="art-tree-signature-cluster foliage-three tone-mid" d="M21 105 C19 93 31 85 42 89 C50 79 65 83 68 95 C77 103 71 116 59 119 C43 122 28 116 21 105Z" />
            <path className="art-tree-signature-cluster foliage-three tone-deep" d="M100 106 C99 94 111 86 122 91 C132 81 147 87 147 100 C156 108 149 121 137 123 C121 125 106 118 100 106Z" />
            <path className="art-tree-signature-leaf foliage-three" d="M15 64 C18 57 25 57 29 63 C27 70 21 73 15 69Z" />
            <path className="art-tree-signature-leaf foliage-three" d="M157 55 C162 49 169 52 171 58 C167 64 161 65 157 61Z" />
          </g>
        </g>
      </g>
    </svg>
  );
}
