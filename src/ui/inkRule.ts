// Pathbound's signature divider: a hand-ruled line with a pooled drop of ink at its start.
// The wobble is deterministic (fixed seed) so the rule looks drawn but never shifts
// between renders or between devices.

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

export function inkRule(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ink-rule');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const main = document.createElementNS(NS, 'path');
  main.setAttribute('d', wobblyPath(3.6, 0, WIDTH, 1.5, 7));
  main.setAttribute('class', 'ink-rule-main');

  const second = document.createElementNS(NS, 'path');
  second.setAttribute('d', wobblyPath(7, 22, WIDTH * 0.86, 1.1, 41));
  second.setAttribute('class', 'ink-rule-second');

  const pool = document.createElementNS(NS, 'ellipse');
  pool.setAttribute('cx', '2.4');
  pool.setAttribute('cy', '3.8');
  pool.setAttribute('rx', '2.9');
  pool.setAttribute('ry', '2.4');
  pool.setAttribute('class', 'ink-rule-pool');

  svg.append(main, second, pool);
  return svg;
}
