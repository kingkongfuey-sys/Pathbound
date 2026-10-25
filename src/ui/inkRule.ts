// Pathbound's signature divider: a hand-ruled line with a pooled drop of ink at its start.
// The wobble is deterministic (fixed seed) so the rule looks drawn but never shifts
// between renders or between devices. A binding whose rule is "laser" (the root's data-rule) gets the same
// two lines with the shake taken out and a square node where the drop was; colour and glow are CSS. One whose rule is
// "vine" gets a stem that sways, a leaf where the drop was, two shoots in place of the second line, and a curl at the end.

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 300;
const HEIGHT = 10;

function seededJitter(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647 - 0.5;
  };
}

function wobblyPath(y: number, from: number, to: number, amplitude: number, seed: number): string {
  const jitter = seededJitter(seed);
  const steps = 18;
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = from + ((to - from) * i) / steps;
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(y + jitter() * amplitude).toFixed(2)}`);
  }
  return points.join(' ');
}

/** A leaf as a closed path: its base at (x, y), pointing along `angle` degrees (0 is right, positive is down), `length` long. */
function leafPath(x: number, y: number, angle: number, length: number): string {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const at = (u: number, v: number): string => `${(x + u * cos - v * sin).toFixed(2)} ${(y + u * sin + v * cos).toFixed(2)}`;
  const half = length * 0.36;
  return `M${at(0, 0)} C${at(length * 0.22, -half)} ${at(length * 0.72, -half)} ${at(length, 0)} C${at(length * 0.72, half)} ${at(length * 0.22, half)} ${at(0, 0)}Z`;
}

/** The sway of a vine's stem: height at x, with a little seeded unevenness so no two bends are alike. */
function stemY(x: number, jitter: () => number): number {
  return 3.7 + 1.25 * Math.sin(x * 0.046 + 0.5) + jitter() * 0.3;
}

function vineRule(svg: SVGSVGElement): void {
  const jitter = seededJitter(23);
  const stem: string[] = [];
  let lastY = 3.7;
  for (let x = 5; x <= 262; x += 5.5) {
    lastY = stemY(x, jitter);
    stem.push(`${stem.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${lastY.toFixed(2)}`);
  }
  // The stem ends in a curl, a tendril that has found nothing to hold yet.
  const endX = 262;
  stem.push(`C${endX + 12} ${(lastY - 1.8).toFixed(2)} ${endX + 21} ${(lastY + 1.2).toFixed(2)} ${endX + 19} ${(lastY + 4.4).toFixed(2)} C${endX + 17.5} ${(lastY + 6.6).toFixed(2)} ${endX + 13} ${(lastY + 6).toFixed(2)} ${endX + 13.4} ${(lastY + 3.6).toFixed(2)}`);

  const main = document.createElementNS(NS, 'path');
  main.setAttribute('d', stem.join(' '));
  main.setAttribute('class', 'ink-rule-main');

  // Two shoots leave the stem and each ends in a leaf; fixed positions, so the rule is the same every time it is drawn.
  const shoots = [
    { x: 74, angle: 36 },
    { x: 178, angle: 28 },
  ];
  const shootPath: string[] = [];
  const leaves: string[] = [leafPath(0, 3.7, 8, 8.4)];
  for (const { x, angle } of shoots) {
    const y = stemY(x, () => 0);
    const tipX = x + 7.5;
    const tipY = y + 5.2;
    shootPath.push(`M${x} ${y.toFixed(2)} C${x + 2.4} ${(y + 3.6).toFixed(2)} ${x + 5} ${(y + 4.6).toFixed(2)} ${tipX} ${tipY.toFixed(2)}`);
    leaves.push(leafPath(tipX, tipY, angle, 6.4));
  }
  const second = document.createElementNS(NS, 'path');
  second.setAttribute('d', shootPath.join(' '));
  second.setAttribute('class', 'ink-rule-second');

  const pool = document.createElementNS(NS, 'path');
  pool.setAttribute('d', leaves.join(' '));
  pool.setAttribute('class', 'ink-rule-pool');

  svg.append(main, second, pool);
}

export function inkRule(): SVGSVGElement {
  const kind = document.documentElement.dataset.rule;
  const laser = kind === 'laser';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ink-rule');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (kind === 'vine') {
    vineRule(svg);
    return svg;
  }

  const main = document.createElementNS(NS, 'path');
  main.setAttribute('d', wobblyPath(3.6, 0, WIDTH, laser ? 0 : 1.5, 7));
  main.setAttribute('class', 'ink-rule-main');

  const second = document.createElementNS(NS, 'path');
  second.setAttribute('d', wobblyPath(7, 22, WIDTH * 0.86, laser ? 0 : 1.1, 41));
  second.setAttribute('class', 'ink-rule-second');

  const pool = document.createElementNS(NS, laser ? 'rect' : 'ellipse');
  if (laser) {
    pool.setAttribute('x', '0');
    pool.setAttribute('y', '1.2');
    pool.setAttribute('width', '4.8');
    pool.setAttribute('height', '4.8');
  } else {
    pool.setAttribute('cx', '2.4');
    pool.setAttribute('cy', '3.8');
    pool.setAttribute('rx', '2.9');
    pool.setAttribute('ry', '2.4');
  }
  pool.setAttribute('class', 'ink-rule-pool');

  svg.append(main, second, pool);
  return svg;
}
