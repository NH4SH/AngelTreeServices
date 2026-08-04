import { useId } from "react";

export type ArtisticTreeVariant = "sparse" | "balanced" | "golden";

type LeafShape = "arc" | "lance" | "fold" | "pair";
type LeafTone = "deep" | "light";

type LeafProps = {
  className: string;
  id: string;
  shape: LeafShape;
  tone?: LeafTone;
  transform: string;
};

export function ArtisticTreeLoader({ context = false, variant }: { context?: boolean; variant: ArtisticTreeVariant }) {
  return (
    <div aria-hidden={context || undefined} className={`motion-tree-loader motion-tree-${variant}${context ? " is-context" : ""}`}>
      {variant === "sparse" ? <SparseCalligraphyTree /> : null}
      {variant === "balanced" ? <BalancedBotanicalTree /> : null}
      {variant === "golden" ? <GoldenFlowTree /> : null}
      {context ? null : <span className="sr-only">Loading</span>}
    </div>
  );
}

function GrowthPath({ className, d }: { className: string; d: string }) {
  return <path className={`calligraphy-growth-path ${className}`} d={d} pathLength={1} />;
}

function LeafDefinitions({ id }: { id: string }) {
  return (
    <>
      <path id={`${id}-arc`} d="M0 0 C3 -5 9 -8 15 -5 C14 1 8 6 0 0Z" />
      <path id={`${id}-lance`} d="M0 0 C4 -3 11 -4 17 -1 C12 4 6 5 0 0Z" />
      <path id={`${id}-fold`} d="M0 0 C2 -6 8 -10 13 -7 C15 -2 9 4 0 0Z" />
      <path id={`${id}-pair`} d="M0 0 C2 -5 7 -7 11 -5 C10 -1 6 2 1 1 C4 2 8 5 8 10 C3 10 0 6 0 0Z" />
    </>
  );
}

function BotanicalLeaf({ className, id, shape, tone = "deep", transform }: LeafProps) {
  return (
    <g transform={transform}>
      <g className={`calligraphy-leaf ${className} is-${tone}`}>
        <use href={`#${id}-${shape}`} />
      </g>
    </g>
  );
}

function safeSvgId(prefix: string, reactId: string) {
  return `${prefix}-${reactId.replaceAll(":", "")}`;
}

function SparseCalligraphyTree() {
  const id = safeSvgId("sparse-tree", useId());

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 240 210">
      <defs>
        <LeafDefinitions id={id} />
        <mask id={`${id}-trunk-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="210">
          <rect width="240" height="210" fill="black" />
          <path className="calligraphy-trunk-reveal" d="M112 196 C110 171 111 151 115 132 C120 110 113 96 120 77 C126 60 134 43 129 17" pathLength={1} />
        </mask>
      </defs>
      <g className="calligraphy-artwork sparse-artwork">
        <GrowthPath className="calligraphy-root" d="M112 195 C99 190 83 193 68 202 C83 197 98 198 111 203 C124 197 139 197 153 202" />
        <path className="calligraphy-trunk" d="M106 198 C107 179 106 162 110 143 C114 126 117 114 113 101 C109 87 115 72 121 60 C128 45 132 31 124 8 C137 23 140 42 134 58 C129 73 120 87 120 102 C120 118 126 130 121 146 C116 164 117 182 120 197 C116 202 110 202 106 198Z" mask={`url(#${id}-trunk-mask)`} />
        <GrowthPath className="calligraphy-branch branch-1" d="M113 145 C94 138 80 124 63 111 C48 100 32 97 18 101" />
        <GrowthPath className="calligraphy-branch branch-2" d="M116 120 C136 109 151 93 170 79 C186 68 203 64 221 66" />
        <GrowthPath className="calligraphy-branch branch-3" d="M119 91 C105 79 94 62 82 48 C71 35 59 30 47 33" />
        <GrowthPath className="calligraphy-twig twig-1" d="M63 111 C52 116 42 116 32 112" />
        <GrowthPath className="calligraphy-twig twig-2" d="M170 79 C181 83 193 81 203 74" />
        <GrowthPath className="calligraphy-twig twig-3" d="M151 94 C156 82 165 73 177 68" />
        <GrowthPath className="calligraphy-twig twig-4" d="M82 48 C73 49 64 45 57 39" />
        <GrowthPath className="calligraphy-twig twig-5" d="M126 58 C114 52 106 43 103 32" />
        <g className="calligraphy-foliage">
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="lance" transform="translate(17 101) rotate(191) scale(.78)" />
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="arc" tone="light" transform="translate(34 112) rotate(167) scale(.68)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="fold" transform="translate(221 66) rotate(-7) scale(.82)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="lance" transform="translate(203 74) rotate(-31) scale(.68)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="arc" tone="light" transform="translate(177 68) rotate(-42) scale(.72)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="fold" transform="translate(47 33) rotate(189) scale(.76)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="lance" tone="light" transform="translate(57 39) rotate(214) scale(.65)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="pair" transform="translate(125 10) rotate(-76) scale(.68)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="arc" transform="translate(103 32) rotate(214) scale(.62)" />
        </g>
      </g>
    </svg>
  );
}

function BalancedBotanicalTree() {
  const id = safeSvgId("balanced-tree", useId());

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 240 210">
      <defs>
        <LeafDefinitions id={id} />
        <mask id={`${id}-trunk-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="210">
          <rect width="240" height="210" fill="black" />
          <path className="calligraphy-trunk-reveal" d="M107 197 C104 176 108 154 113 136 C119 115 111 100 118 82 C125 62 139 45 136 15" pathLength={1} />
        </mask>
      </defs>
      <g className="calligraphy-artwork balanced-artwork">
        <GrowthPath className="calligraphy-root" d="M108 195 C93 190 76 194 58 203 C77 197 94 198 108 203 C125 197 143 198 161 204" />
        <path className="calligraphy-trunk" d="M101 198 C102 178 103 161 108 142 C113 125 117 113 112 99 C108 86 115 70 123 57 C132 42 139 29 131 7 C144 21 147 39 141 56 C135 72 124 86 122 101 C121 116 128 129 122 146 C116 164 117 183 121 198 C116 203 106 204 101 198Z" mask={`url(#${id}-trunk-mask)`} />
        <GrowthPath className="calligraphy-branch branch-1" d="M109 150 C91 144 76 133 61 120 C46 107 31 103 15 106" />
        <GrowthPath className="calligraphy-branch branch-2" d="M114 132 C132 123 147 111 163 98 C179 86 198 81 222 84" />
        <GrowthPath className="calligraphy-branch branch-3" d="M115 108 C98 97 86 83 75 68 C65 55 53 48 40 50" />
        <GrowthPath className="calligraphy-branch branch-4" d="M120 87 C137 77 151 63 160 48 C168 36 180 29 194 30" />
        <GrowthPath className="calligraphy-branch branch-5" d="M127 60 C114 52 105 40 101 26 C98 17 92 11 84 8" />
        <GrowthPath className="calligraphy-twig twig-1" d="M61 120 C49 126 38 126 27 121 M73 130 C67 118 59 110 49 105" />
        <GrowthPath className="calligraphy-twig twig-2" d="M163 98 C177 104 191 101 203 94 M147 111 C153 99 163 90 175 86" />
        <GrowthPath className="calligraphy-twig twig-3" d="M75 68 C62 72 50 70 41 64 M88 84 C80 71 71 61 60 57" />
        <GrowthPath className="calligraphy-twig twig-4" d="M160 48 C173 53 186 49 196 41 M148 63 C155 52 165 44 177 41" />
        <GrowthPath className="calligraphy-twig twig-5" d="M101 26 C91 27 82 23 75 16 M136 37 C126 31 120 22 119 12" />
        <g className="calligraphy-foliage">
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="lance" transform="translate(15 106) rotate(188) scale(.8)" />
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="arc" tone="light" transform="translate(28 121) rotate(165) scale(.7)" />
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="fold" transform="translate(49 105) rotate(205) scale(.62)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="fold" transform="translate(222 84) rotate(4) scale(.82)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="lance" tone="light" transform="translate(203 94) rotate(-25) scale(.7)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="arc" transform="translate(175 86) rotate(-38) scale(.68)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="arc" transform="translate(40 50) rotate(183) scale(.78)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="lance" tone="light" transform="translate(41 64) rotate(166) scale(.65)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="pair" transform="translate(60 57) rotate(204) scale(.58)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="fold" transform="translate(194 30) rotate(-4) scale(.78)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="lance" tone="light" transform="translate(196 41) rotate(-31) scale(.66)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="arc" transform="translate(177 41) rotate(-44) scale(.62)" />
          <BotanicalLeaf className="leaf-stage-5" id={id} shape="pair" transform="translate(84 8) rotate(201) scale(.66)" />
          <BotanicalLeaf className="leaf-stage-5" id={id} shape="fold" tone="light" transform="translate(119 12) rotate(-74) scale(.62)" />
        </g>
      </g>
    </svg>
  );
}

function GoldenFlowTree() {
  const id = safeSvgId("golden-tree", useId());

  return (
    <svg aria-hidden="true" className="motion-tree-svg" viewBox="0 0 240 210">
      <defs>
        <LeafDefinitions id={id} />
        <mask id={`${id}-trunk-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="210">
          <rect width="240" height="210" fill="black" />
          <path className="calligraphy-trunk-reveal" d="M101 198 C97 176 104 155 113 138 C123 118 112 101 120 83 C128 63 145 48 143 16" pathLength={1} />
        </mask>
      </defs>
      <g className="calligraphy-artwork golden-artwork">
        <GrowthPath className="calligraphy-root golden-root" d="M102 196 C85 189 66 194 47 205 C67 198 86 199 102 205 C121 198 141 199 161 206" />
        <path className="calligraphy-trunk" d="M94 199 C96 180 97 164 104 145 C111 128 119 117 113 101 C108 87 115 72 124 59 C136 43 145 31 137 7 C151 22 153 40 146 57 C139 74 126 87 124 102 C123 118 132 130 124 148 C116 166 116 184 121 199 C114 205 101 206 94 199Z" mask={`url(#${id}-trunk-mask)`} />
        <GrowthPath className="calligraphy-branch branch-1" d="M105 153 C87 149 69 139 55 125 C41 112 25 108 8 113" />
        <GrowthPath className="calligraphy-branch branch-2" d="M112 137 C131 132 149 120 164 105 C180 90 201 85 229 91" />
        <GrowthPath className="calligraphy-branch branch-3" d="M115 113 C98 105 83 92 72 76 C62 62 48 55 32 59" />
        <GrowthPath className="calligraphy-branch branch-4" d="M120 93 C138 86 154 74 166 58 C176 45 190 39 207 43" />
        <GrowthPath className="calligraphy-branch branch-5" d="M128 66 C114 59 103 48 97 35 C92 23 84 17 73 17" />
        <GrowthPath className="calligraphy-branch branch-6" d="M141 40 C132 32 128 22 129 11" />
        <GrowthPath className="calligraphy-twig twig-1" d="M55 125 C42 132 29 132 18 127 M70 139 C63 126 53 116 41 111" />
        <GrowthPath className="calligraphy-twig twig-2" d="M164 105 C180 112 196 108 209 99 M148 120 C156 106 167 96 181 91" />
        <GrowthPath className="calligraphy-twig twig-3" d="M72 76 C58 82 44 80 34 72 M87 94 C78 80 67 70 54 66" />
        <GrowthPath className="calligraphy-twig twig-4" d="M166 58 C181 64 196 59 207 49 M151 76 C159 62 170 52 184 49" />
        <GrowthPath className="calligraphy-twig twig-5" d="M97 35 C85 38 74 34 66 26 M114 51 C104 39 95 31 84 27" />
        <GrowthPath className="calligraphy-twig twig-6" d="M141 40 C151 31 156 20 155 9 M129 17 C119 14 111 8 107 1" />
        <g className="calligraphy-foliage">
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="lance" transform="translate(8 113) rotate(188) scale(.82)" />
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="arc" tone="light" transform="translate(18 127) rotate(166) scale(.7)" />
          <BotanicalLeaf className="leaf-stage-1" id={id} shape="fold" transform="translate(41 111) rotate(203) scale(.64)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="fold" transform="translate(229 91) rotate(7) scale(.84)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="lance" tone="light" transform="translate(209 99) rotate(-24) scale(.72)" />
          <BotanicalLeaf className="leaf-stage-2" id={id} shape="pair" transform="translate(181 91) rotate(-37) scale(.6)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="arc" transform="translate(32 59) rotate(183) scale(.78)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="lance" tone="light" transform="translate(34 72) rotate(166) scale(.66)" />
          <BotanicalLeaf className="leaf-stage-3" id={id} shape="fold" transform="translate(54 66) rotate(204) scale(.64)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="fold" transform="translate(207 43) rotate(3) scale(.8)" />
          <BotanicalLeaf className="leaf-stage-4" id={id} shape="arc" transform="translate(184 49) rotate(-43) scale(.64)" />
          <BotanicalLeaf className="leaf-stage-5" id={id} shape="pair" transform="translate(73 17) rotate(199) scale(.68)" />
          <BotanicalLeaf className="leaf-stage-5" id={id} shape="fold" tone="light" transform="translate(107 2) rotate(212) scale(.58)" />
          <BotanicalLeaf className="leaf-stage-5" id={id} shape="lance" transform="translate(155 9) rotate(-67) scale(.66)" />
        </g>
      </g>
    </svg>
  );
}
