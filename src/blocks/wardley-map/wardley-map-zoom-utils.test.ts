/**
 * wardley-map-zoom-utils.test.ts — Unit tests for zoom-stable text utilities.
 *
 * Run with: npx tsx src/blocks/wardley-map/wardley-map-zoom-utils.test.ts
 */

import {
  clampZoom,
  zoomStableFontSize,
  zoomStableStrokeWidth,
} from './wardley-map-zoom-utils.js';
import {
  ZOOM_LABEL_SCALE_MIN,
  ZOOM_LABEL_SCALE_MAX,
} from './wardley-map-consts.js';

// ── Simple assertion helpers ──────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertApprox(actual: number, expected: number, message: string, epsilon = 0.001): void {
  assert(Math.abs(actual - expected) < epsilon, `${message} (got ${actual}, expected ${expected})`);
}

// ── Tests ─────────────────────────────────────────────────────────

console.log('\n=== clampZoom ===');

assert(clampZoom(1.0) === 1.0, 'zoom=1.0 is unchanged');
assert(clampZoom(ZOOM_LABEL_SCALE_MIN) === ZOOM_LABEL_SCALE_MIN, 'zoom at MIN is unchanged');
assert(clampZoom(ZOOM_LABEL_SCALE_MAX) === ZOOM_LABEL_SCALE_MAX, 'zoom at MAX is unchanged');
assert(clampZoom(0.1) === ZOOM_LABEL_SCALE_MIN, 'zoom below MIN is clamped');
assert(clampZoom(10.0) === ZOOM_LABEL_SCALE_MAX, 'zoom above MAX is clamped');
assert(clampZoom(2.0) === 2.0, 'zoom=2.0 within range is unchanged');
assert(clampZoom(0.0) === ZOOM_LABEL_SCALE_MIN, 'zoom=0 is clamped to MIN');
assert(clampZoom(-1.0) === ZOOM_LABEL_SCALE_MIN, 'negative zoom is clamped to MIN');

console.log('\n=== zoomStableFontSize ===');

assertApprox(zoomStableFontSize(12, 1.0), 12, 'base=12 at zoom=1.0 returns 12');
assertApprox(zoomStableFontSize(12, 2.0), 6, 'base=12 at zoom=2.0 returns 6');
assertApprox(zoomStableFontSize(12, 0.5), 24, 'base=12 at zoom=0.5 returns 24');
assertApprox(zoomStableFontSize(13, 1.0), 13, 'base=13 at zoom=1.0 returns 13');
assertApprox(zoomStableFontSize(10, 3.0), 10 / 3, 'base=10 at zoom=3.0 returns 3.33');

// Edge: zoom below MIN should clamp
assertApprox(
  zoomStableFontSize(12, 0.1),
  12 / ZOOM_LABEL_SCALE_MIN,
  `base=12 at zoom=0.1 clamps to 12/${ZOOM_LABEL_SCALE_MIN}`,
);

// Edge: zoom above MAX should clamp
assertApprox(
  zoomStableFontSize(12, 10.0),
  12 / ZOOM_LABEL_SCALE_MAX,
  `base=12 at zoom=10.0 clamps to 12/${ZOOM_LABEL_SCALE_MAX}`,
);

console.log('\n=== zoomStableStrokeWidth ===');

assertApprox(zoomStableStrokeWidth(1.5, 1.0), 1.5, 'base=1.5 at zoom=1.0 returns 1.5');
assertApprox(zoomStableStrokeWidth(1.5, 2.0), 0.75, 'base=1.5 at zoom=2.0 returns 0.75');
assertApprox(zoomStableStrokeWidth(1.0, 0.5), 2.0, 'base=1.0 at zoom=0.5 returns 2.0');

console.log('\n=== Zoom-stable visual size invariant ===');

// The key property: baseFontSize / clampedZoom * clampedZoom = baseFontSize
// i.e. visual size = SVG font size * zoom = constant
const baseFontSize = 12;
for (const zoom of [0.5, 0.75, 1.0, 1.5, 2.0, 3.0]) {
  const svgFontSize = zoomStableFontSize(baseFontSize, zoom);
  const visualSize = svgFontSize * zoom;
  assertApprox(visualSize, baseFontSize, `zoom=${zoom}: visual size ${visualSize.toFixed(2)} ≈ ${baseFontSize}`);
}

// ── Summary ───────────────────────────────────────────────────────

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed! ✓');
}
