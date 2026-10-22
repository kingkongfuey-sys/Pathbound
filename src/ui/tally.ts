// The chapter indicator, drawn as tally marks: one stroke per chapter, every fifth stroke slanting across the
// four before it, the way a prisoner or a ledger-clerk counts. Strokes up to the current chapter are inked;
// the rest are drawn faintly, so the reader sees how far the story runs. The layout is plain arithmetic with a
// fixed wobble per stroke (deterministic, like the ink rule), kept apart from the DOM so it can be tested.

export interface TallyStroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** True for the slanting fifth stroke. */
  gate: boolean;
  /** True once the story has reached this chapter. */
  reached: boolean;
}

export interface TallyLayout {
  width: number;
  height: number;
  strokes: TallyStroke[];
}

const HEIGHT = 20;
const PITCH = 7;
const PAD = 4;
const GROUP_GAP = 13;
/** How far the fifth stroke overshoots the four it crosses, each side. */
const OVERSHOOT = 3;

function wobble(index: number, spread: number): number {
  return (((index * 37 + 11) % 7) - 3) * 0.15 * spread;
}

/** `reached` is how many strokes are inked (the current chapter's 1-based number). */
export function tallyLayout(count: number, reached: number): TallyLayout {
  const strokes: TallyStroke[] = [];
  for (let i = 0; i < count; i += 1) {
    const group = Math.floor(i / 5);
    const place = i % 5;
    const origin = PAD + OVERSHOOT + group * (3 * PITCH + OVERSHOOT * 2 + GROUP_GAP);
    const isReached = i < reached;
    if (place < 4) {
      const x = origin + place * PITCH + wobble(i, 1);
      strokes.push({ x1: x, y1: 2 + wobble(i + 3, 1.6), x2: x + wobble(i + 5, 0.8), y2: HEIGHT - 2 + wobble(i + 1, 1.6), gate: false, reached: isReached });
    } else {
      strokes.push({
        x1: origin - OVERSHOOT,
        y1: HEIGHT - 4 + wobble(i, 1.2),
        x2: origin + 3 * PITCH + OVERSHOOT,
        y2: 4 + wobble(i + 2, 1.2),
        gate: true,
        reached: isReached,
      });
    }
  }
  const right = strokes.reduce((far, s) => Math.max(far, s.x1, s.x2), 0);
  return { width: Math.ceil(right + PAD), height: HEIGHT, strokes };
}

const NS = 'http://www.w3.org/2000/svg';

export function tallyMarks(count: number, reached: number, label: string): SVGSVGElement {
  const layout = tallyLayout(count, reached);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tally');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  for (const stroke of layout.strokes) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', stroke.x1.toFixed(2));
    line.setAttribute('y1', stroke.y1.toFixed(2));
    line.setAttribute('x2', stroke.x2.toFixed(2));
    line.setAttribute('y2', stroke.y2.toFixed(2));
    line.setAttribute('class', stroke.reached ? 'tally-stroke' : 'tally-stroke tally-ahead');
    svg.append(line);
  }
  return svg;
}
