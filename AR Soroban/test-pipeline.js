// Test avanzado: simula el pipeline completo de clasificación de gestos
// Ejecutar con: node test-pipeline.js

const COLS = 10;
const canvas = {width: 1280, height: 720};
const sorobanTop = 200, sorobanBottom = 650, beamScreenY = 350;
const sorobanLeft = 128, sorobanRight = 1152;

let state = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
let landmarkHistory = [];

function makeLandmarks(overrides = {}) {
  const base = [
    {x:0.50,y:0.80,z:0},{x:0.42,y:0.65,z:0},{x:0.38,y:0.55,z:0},{x:0.34,y:0.45,z:0},{x:0.30,y:0.35,z:0},
    {x:0.44,y:0.60,z:0},{x:0.44,y:0.45,z:0},{x:0.44,y:0.35,z:0},{x:0.44,y:0.25,z:0},
    {x:0.50,y:0.58,z:0},{x:0.50,y:0.42,z:0},{x:0.50,y:0.32,z:0},{x:0.50,y:0.22,z:0},
    {x:0.56,y:0.60,z:0},{x:0.56,y:0.45,z:0},{x:0.56,y:0.35,z:0},{x:0.56,y:0.25,z:0},
    {x:0.62,y:0.62,z:0},{x:0.62,y:0.50,z:0},{x:0.62,y:0.42,z:0},{x:0.62,y:0.34,z:0},
  ];
  for (const [idx, vals] of Object.entries(overrides)) {
    if (vals.x !== undefined) base[parseInt(idx)].x = vals.x;
    if (vals.y !== undefined) base[parseInt(idx)].y = vals.y;
  }
  return base;
}

function getSmoothed(idx) {
  if (landmarkHistory.length === 0) return null;
  const n = landmarkHistory.length;
  const frames = landmarkHistory.slice(Math.max(0, n - 5));
  let sx = 0, sy = 0;
  for (const f of frames) { sx += f[idx].x; sy += f[idx].y; }
  return {x: sx/frames.length, y: sy/frames.length};
}

function isIndexExt(lm) { return lm[8].y < lm[6].y - 0.02; }
function isMiddleExt(lm) { return lm[12].y < lm[10].y - 0.02; }
function isRingExt(lm) { return lm[16].y < lm[14].y - 0.02; }
function isPinkyExt(lm) { return lm[20].y < lm[18].y - 0.02; }

function isThumbExt(lm) {
  const tip = getSmoothed(4), mcp = getSmoothed(2);
  if (!tip || !mcp) return false;
  return Math.hypot(tip.x - mcp.x, tip.y - mcp.y) > 0.06;
}

function pinchDistFn(lm) {
  const t = getSmoothed(4), i = getSmoothed(8);
  if (!t || !i) return 1;
  return Math.hypot(t.x - i.x, t.y - i.y);
}

function getColFromX(normX) {
  const screenX = (1 - normX) * canvas.width;
  if (screenX < sorobanLeft || screenX > sorobanRight) return -1;
  const rel = (screenX - sorobanLeft) / (sorobanRight - sorobanLeft);
  return Math.max(0, Math.min(COLS - 1, Math.floor(rel * COLS)));
}

function getVelocityX(idx) {
  if (landmarkHistory.length < 3) return 0;
  const n = landmarkHistory.length;
  return (landmarkHistory[n-1][idx].x - landmarkHistory[Math.max(0,n-4)][idx].x) / (n-1);
}

function classifyGesture(lm) {
  const thumbExt = isThumbExt(lm);
  const indexExt = isIndexExt(lm);
  const middleExt = isMiddleExt(lm);
  const ringExt = isRingExt(lm);
  const pinkyExt = isPinkyExt(lm);
  const pinch = pinchDistFn(lm);
  const numExt = [thumbExt, indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

  const handCenter = getSmoothed(9);
  if (!handCenter) return 'no_hand';

  const col = getColFromX(handCenter.x);
  const handY = handCenter.y * canvas.height;
  const inHeaven = handY < beamScreenY - 15;
  const inEarth = handY > beamScreenY + 15;
  const onBeam = Math.abs(handY - beamScreenY) <= 15;

  const thumbTip = getSmoothed(4);
  const indexTip = getSmoothed(8);

  if (col < 0) return 'outside';

  if (numExt >= 3 && onBeam && Math.abs(getVelocityX(9)) > 0.003) return 'clear';
  if (thumbExt && indexExt && !middleExt && !ringExt && !pinkyExt) {
    const thumbInEarth = thumbTip && thumbTip.y * canvas.height > beamScreenY + 10;
    const indexInHeaven = indexTip && indexTip.y * canvas.height < beamScreenY - 10;
    if (indexInHeaven && thumbInEarth) return 'smallFriend';
    if (pinch < 0.07) {
      const pinchY = (thumbTip.y + indexTip.y) / 2 * canvas.height;
      if (Math.abs(pinchY - beamScreenY) < 80) return 'pinch';
    }
  }
  if (pinch < 0.06 && !middleExt && !ringExt && !pinkyExt) return 'pinch';
  if (indexExt && !thumbExt && !middleExt && !ringExt && !pinkyExt) {
    if (inHeaven) return 'heavenControl';
    if (inEarth) return 'earthIndexControl';
  }
  if (thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt) {
    if (inEarth) return 'earthThumbControl';
  }
  if (numExt >= 3 && onBeam) return 'clearReady';

  return 'idle';
}

// ============ Tests del pipeline completo ============
let passed = 0, failed = 0;

function assert(cond, msg) {
  if (!cond) { console.log(`  ❌ FAIL: ${msg}`); return false; }
  console.log(`  ✓ ${msg}`);
  return true;
}

function test(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (e) {
    console.log(`  ❌ EXCEPTION: ${e.message}`);
    failed++;
  }
}

function expectGesture(label, lm, expected, frames = 1) {
  landmarkHistory = [];
  for (let i = 0; i < frames; i++) landmarkHistory.push(lm);
  const result = classifyGesture(lm);
  const ok = result === expected;
  if (ok) { console.log(`  ✓ ${label}: ${result}`); passed++; }
  else { console.log(`  ❌ ${label}: esperba '${expected}', obtuvo '${result}'`); failed++; }
}

console.log('╔══════════════════════════════════════════════╗');
console.log('║  PIPELINE TEST - Clasificación de gestos     ║');
console.log('╚══════════════════════════════════════════════╝');

// Escenario: mano en el centro del soroban (col ~5)
// beamScreenY = 350, canvas.height = 720
// Zona cielo: y < 335/720 = 0.465
// Zona tierra: y > 365/720 = 0.507

test('PIPELINE 1: Solo pulgar en zona tierra → earthThumbControl', () => {
  const lm = makeLandmarks({
    4: {x: 0.30, y: 0.65},  // thumb in earth zone
    8: {y: 0.60},   // index curled
    12: {y: 0.58},  // middle curled
    16: {y: 0.60},  // ring curled
    20: {y: 0.62},  // pinky curled
    9: {y: 0.60},   // hand center in earth
  });
  expectGesture('Pulgar en tierra', lm, 'earthThumbControl');
});

test('PIPELINE 2: Solo índice en zona cielo → heavenControl', () => {
  const lm = makeLandmarks({
    4: {x: 0.38, y: 0.55},  // thumb curled
    8: {x: 0.44, y: 0.30},  // index in heaven zone
    12: {y: 0.58},
    16: {y: 0.60},
    20: {y: 0.62},
    9: {y: 0.40},  // hand center in heaven
  });
  expectGesture('Índice en cielo', lm, 'heavenControl');
});

test('PIPELINE 3: Solo índice en zona tierra → earthIndexControl', () => {
  const lm = makeLandmarks({
    2: {x: 0.42, y: 0.62},  // thumb MCP (moved to earth zone)
    4: {x: 0.42, y: 0.64},  // thumb TIP very close to MCP = curled
    6: {x: 0.44, y: 0.62},  // index PIP
    8: {x: 0.44, y: 0.55},  // index TIP above PIP = extended
    10: {x: 0.50, y: 0.65}, // middle PIP
    12: {x: 0.50, y: 0.68}, // middle TIP curled (below PIP)
    14: {x: 0.56, y: 0.65}, // ring PIP
    16: {x: 0.56, y: 0.68}, // ring TIP curled
    18: {x: 0.62, y: 0.68}, // pinky PIP
    20: {x: 0.62, y: 0.72}, // pinky TIP curled
    9: {y: 0.64},           // hand center in earth
  });
  expectGesture('Índice en tierra', lm, 'earthIndexControl');
});

test('PIPELINE 4: Small Friend (índice arriba, pulgar abajo)', () => {
  const lm = makeLandmarks({
    4: {x: 0.30, y: 0.65},  // thumb extended in earth zone
    8: {x: 0.44, y: 0.30},  // index extended in heaven zone
    12: {y: 0.58},
    16: {y: 0.60},
    20: {y: 0.62},
    9: {y: 0.50},
  });
  expectGesture('Small Friend', lm, 'smallFriend');
});

test('PIPELINE 5: Pellizco cerca de barra → pinch', () => {
  const lm = makeLandmarks({
    4: {x: 0.44, y: 0.47},  // thumb near beam
    8: {x: 0.44, y: 0.46},  // index near beam (close to thumb)
    12: {y: 0.58},
    16: {y: 0.60},
    20: {y: 0.62},
    9: {y: 0.50},
  });
  expectGesture('Pellizco', lm, 'pinch');
});

test('PIPELINE 6: Mano fuera del soroban → outside', () => {
  const lm = makeLandmarks({
    4: {x: 0.05, y: 0.50},  // hand at far left
    8: {x: 0.05, y: 0.30},
    9: {x: 0.05, y: 0.50},
    12: {y: 0.58},
    16: {y: 0.60},
    20: {y: 0.62},
  });
  expectGesture('Fuera del soroban', lm, 'outside');
});

test('PIPELINE 7: Puño cerrado en centro → idle', () => {
  const lm = makeLandmarks({
    4: {x: 0.38, y: 0.58},  // thumb curled
    8: {y: 0.58},   // index curled
    12: {y: 0.58},  // middle curled
    16: {y: 0.58},  // ring curled
    20: {y: 0.58},  // pinky curled
    9: {y: 0.55},   // hand center
  });
  expectGesture('Puño cerrado', lm, 'idle');
});

test('PIPELINE 8: 3 dedos en barra + movimiento → clear', () => {
  // 3 fingers extended, hand on beam, moving horizontally
  const lm1 = makeLandmarks({
    4: {x: 0.38, y: 0.58},  // thumb curled
    8: {x: 0.44, y: 0.38},  // index extended (tip well above PIP)
    12: {x: 0.50, y: 0.35}, // middle extended
    16: {x: 0.56, y: 0.38}, // ring extended
    20: {x: 0.62, y: 0.58}, // pinky curled
    9: {x: 0.50, y: 0.50},
  });
  const lm2 = makeLandmarks({
    4: {x: 0.38, y: 0.58},
    8: {x: 0.46, y: 0.38},
    12: {x: 0.52, y: 0.35},
    16: {x: 0.58, y: 0.38},
    20: {x: 0.62, y: 0.58},
    9: {x: 0.52, y: 0.50},
  });
  const lm3 = makeLandmarks({
    4: {x: 0.38, y: 0.58},
    8: {x: 0.48, y: 0.38},
    12: {x: 0.54, y: 0.35},
    16: {x: 0.60, y: 0.38},
    20: {x: 0.62, y: 0.58},
    9: {x: 0.54, y: 0.50},
  });
  const lm4 = makeLandmarks({
    4: {x: 0.38, y: 0.58},
    8: {x: 0.50, y: 0.38},
    12: {x: 0.56, y: 0.35},
    16: {x: 0.62, y: 0.38},
    20: {x: 0.62, y: 0.58},
    9: {x: 0.56, y: 0.50},
  });
  landmarkHistory = [lm1, lm2, lm3, lm4];
  const result = classifyGesture(lm4);
  const ok = result === 'clear';
  if (ok) { console.log(`  ✓ Borrar deslizando: ${result}`); passed++; }
  else { console.log(`  ❌ Borrar: esperaba 'clear', obtuvo '${result}'`); failed++; }
});

// Test de lógica de acciones
test('PIPELINE 9: earthThumbControl - pulgar cerca de barra → 4 earth beads', () => {
  state = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  const earthZoneTop = beamScreenY + 10;  // 360
  const earthZoneBottom = sorobanBottom - 10;  // 640
  const zoneH = earthZoneBottom - earthZoneTop;  // 280

  // Thumb near beam (top of earth zone) → should map to 4 beads
  const thumbY = earthZoneTop + 10;  // very close to beam
  const relPos = (thumbY - earthZoneTop) / zoneH;  // ~0.036
  const target = Math.round((1 - Math.max(0, Math.min(1, relPos))) * 4);
  if (assert(target === 4, `Pulgar cerca barra → ${target} bolas (esperado 4)`)) passed++; else failed++;
});

test('PIPELINE 10: earthThumbControl - pulgar lejos de barra → 0 earth beads', () => {
  const earthZoneTop = beamScreenY + 10;
  const earthZoneBottom = sorobanBottom - 10;
  const zoneH = earthZoneBottom - earthZoneTop;

  const thumbY = earthZoneBottom - 10;  // very far from beam
  const relPos = (thumbY - earthZoneTop) / zoneH;  // ~0.96
  const target = Math.round((1 - Math.max(0, Math.min(1, relPos))) * 4);
  if (assert(target === 0, `Pulgar lejos barra → ${target} bolas (esperado 0)`)) passed++; else failed++;
});

test('PIPELINE 11: heavenControl - índice cerca de barra → heaven=1', () => {
  const heavenZoneTop = sorobanTop + 10;  // 210
  const heavenZoneBottom = beamScreenY - 10;  // 340
  const zoneH = heavenZoneBottom - heavenZoneTop;  // 130

  const indexY = heavenZoneBottom - 10;  // close to beam
  const relPos = (indexY - heavenZoneTop) / zoneH;  // ~0.92
  const target = relPos > 0.65 ? 1 : 0;
  if (assert(target === 1, `Índice cerca barra → heaven=${target} (esperado 1)`)) passed++; else failed++;
});

test('PIPELINE 12: heavenControl - índice lejos de barra → heaven=0', () => {
  const heavenZoneTop = sorobanTop + 10;
  const heavenZoneBottom = beamScreenY - 10;
  const zoneH = heavenZoneBottom - heavenZoneTop;

  const indexY = heavenZoneTop + 10;  // far from beam
  const relPos = (indexY - heavenZoneTop) / zoneH;  // ~0.08
  const target = relPos > 0.65 ? 1 : 0;
  if (assert(target === 0, `Índice lejos barra → heaven=${target} (esperado 0)`)) passed++; else failed++;
});

// Resumen
console.log('\n╔══════════════════════════════════════════════╗');
console.log(`║  RESULTADOS: ${passed} pasados, ${failed} fallidos            ║`);
console.log('╚══════════════════════════════════════════════╝');

if (failed > 0) {
  console.log('\n⚠️  Hay tests fallidos');
  process.exit(1);
} else {
  console.log('\n✅ Pipeline completo funciona correctamente');
}
