// Three small hand-inked marks, one per stance, set beside the stance links so the duel can be read at a glance:
// strike is a slash with a pooled drop at its start (kin to the ink rule), guard is a shield outline, feint is a
// looping hook. Fixed paths, so they never change between renders.
import type { Stance3 } from '../engine/types.ts';

const NS = 'http://www.w3.org/2000/svg';

const PATHS: Record<Stance3, string> = {
  strike: 'M6 19 C10 14 14 9 19 4',
  guard: 'M5 5.5 L12 3.5 L19 5.5 L19 12 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 12 Z',
  feint: 'M4 18 C8 6 15 5 14 11 C13 16 19 15 20 6',
};

export function stanceMark(stance: Stance3): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'stance-mark');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[stance]);
  path.setAttribute('class', 'stance-stroke');
  svg.append(path);
  if (stance === 'strike') {
    const drop = document.createElementNS(NS, 'circle');
    drop.setAttribute('cx', '6');
    drop.setAttribute('cy', '19');
    drop.setAttribute('r', '2');
    drop.setAttribute('class', 'stance-drop');
    svg.append(drop);
  }
  return svg;
}
