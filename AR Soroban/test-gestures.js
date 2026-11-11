// Test script para Soroban AR - Simula gestos de MediaPipe
// Ejecutar con: node test-gestures.js

const assert = (condition, msg) => {
  if (!condition) {
    console.log(`  ❌ FAIL: ${msg}`);
    return false;
  }
  console.log(`  ✓ ${msg}`);
  return true;
};

// ============ Simular constantes del soroban ============
const COLS = 10;
const COL_W = 80;
const state = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));

// ============ Helpers para generar landmarks simulados ============
function makeLandmarks(overrides = {}) {
  const base = [
    {x: 0.50, y: 0.80, z: 0},  // 0: wrist
    {x: 0.42, y: 0.65, z: 0},  // 1: thumb CMC
    {x: 0.38, y: 0.55, z: 0},  // 2: thumb MCP
    {x: 0.34, y: 0.45, z: 0},  // 3: thumb IP
    {x: 0.30, y: 0.35, z: 0},  // 4: thumb TIP
    {x: 0.44, y: 0.60, z: 0},  // 5: index MCP
    {x: 0.44, y: 0.45, z: 0},  // 6: index PIP
    {x: 0.44, y: 0.35, z: 0},  // 7: index DIP
    {x: 0.44, y: 0.25, z: 0},  // 8: index TIP
    {x: 0.50, y: 0.58, z: 0},  // 9: middle MCP (hand center)
    {x: 0.50, y: 0.42, z: 0},  // 10: middle PIP
    {x: 0.50, y: 0.32, z: 0},  // 11: middle DIP
    {x: 0.50, y: 0.22, z: 0},  // 12: middle TIP
    {x: 0.56, y: 0.60, z: 0},  // 13: ring MCP
    {x: 0.56, y: 0.45, z: 0},  // 14: ring PIP
    {x: 0.56, y: 0.35, z: 0},  // 15: ring DIP
    {x: 0.56, y: 0.25, z: 0},  // 16: ring TIP
    {x: 0.62, y: 0.62, z: 0},  // 17: pinky MCP
    {x: 0.62, y: 0.50, z: 0},  // 18: pinky PIP
    {x: 0.62, y: 0.42, z: 0},  // 19: pinky DIP
    {x: 0.62, y: 0.34, z: 0},  // 20: pinky TIP
  ];
  for (const [idx, vals] of Object.entries(overrides)) {
    if (vals.x !== undefined) base[idx].x = vals.x;
    if (vals.y !== undefined) base[idx].y = vals.y;
    if (vals.z !== undefined) base[idx].z = vals.z;
  }
  return base;
}

// Generar mano con dedos específicos extendidos/retraídos
function handOpen() {
  return makeLandmarks();
}

function handFist() {
  return makeLandmarks({
    4: {y: 0.55},  // thumb tip curled down
    8: {y: 0.55},  // index tip curled
    12: {y: 0.52}, // middle tip curled
    16: {y: 0.55}, // ring tip curled
    20: {y: 0.58}, // pinky tip curled
  });
}

function handIndexOnly() {
  return makeLandmarks({
    4: {y: 0.55},  // thumb curled
    8: {y: 0.25},  // index extended
    12: {y: 0.52}, // middle curled
    16: {y: 0.55}, // ring curled
    20: {y: 0.58}, // pinky curled
  });
}

function handThumbOnly() {
  return makeLandmarks({
    4: {x: 0.30, y: 0.35},  // thumb extended far
    8: {y: 0.55},  // index curled
    12: {y: 0.52}, // middle curled
    16: {y: 0.55}, // ring curled
    20: {y: 0.58}, // pinky curled
  });
}

function handPinch() {
  return makeLandmarks({
    4: {x: 0.44, y: 0.26},  // thumb tip close to index
    8: {x: 0.44, y: 0.25},  // index tip
    12: {y: 0.52}, // middle curled
    16: {y: 0.55}, // ring curled
    20: {y: 0.58}, // pinky curled
  });
}

function handThumbAndIndex() {
  return makeLandmarks({
    4: {x: 0.30, y: 0.35},  // thumb extended
    8: {x: 0.44, y: 0.25},  // index extended
    12: {y: 0.52}, // middle curled
    16: {y: 0.55}, // ring curled
    20: {y: 0.58}, // pinky curled
  });
}

function handThreeFingers() {
  return makeLandmarks({
    4: {y: 0.55},  // thumb curled
    8: {y: 0.25},  // index extended
    12: {y: 0.22}, // middle extended
    16: {y: 0.25}, // ring extended
    20: {y: 0.58}, // pinky curled
  });
}

// ============ Funciones de detección (copiadas del HTML) ============
let landmarkHistory = [];

function getSmoothed(idx) {
  if (landmarkHistory.length === 0) return null;
  const n = landmarkHistory.length;
  const frames = landmarkHistory.slice(Math.max(0, n - 5));
  let sx = 0, sy = 0;
  for (const f of frames) { sx += f[idx].x; sy += f[idx].y; }
  return {x: sx / frames.length, y: sy / frames.length, z: frames[0][idx].z};
}

function isIndexExt(lm) { return lm[8].y < lm[6].y - 0.02; }
function isMiddleExt(lm) { return lm[12].y < lm[10].y - 0.02; }
function isRingExt(lm) { return lm[16].y < lm[14].y - 0.02; }
function isPinkyExt(lm) { return lm[20].y < lm[18].y - 0.02; }

function isThumbExt(lm) {
  const tip = getSmoothed(4), mcp = getSmoothed(2);
  if (!tip || !mcp) return lm[4].x < lm[3].x - 0.01;
  const d = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
  return d > 0.06;
}

function pinchDistFn(lm) {
  const t = getSmoothed(4), i = getSmoothed(8);
  if (!t || !i) return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  return Math.hypot(t.x - i.x, t.y - i.y);
}

function getColFromX(normX) {
  const canvasWidth = 1280;
  const sorobanLeft = 1280 * 0.1;
  const sorobanRight = 1280 * 0.9;
  const screenX = (1 - normX) * canvasWidth;
  if (screenX < sorobanLeft || screenX > sorobanRight) return -1;
  const rel = (screenX - sorobanLeft) / (sorobanRight - sorobanLeft);
  const c = Math.floor(rel * COLS);
  return Math.max(0, Math.min(COLS - 1, c));
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
  if (!handCenter) return {gesture: 'error', details: 'no hand center'};

  return {
    thumbExt, indexExt, middleExt, ringExt, pinkyExt,
    pinch: pinch.toFixed(4),
    numExt,
    handCenterX: handCenter.x.toFixed(3),
    handCenterY: handCenter.y.toFixed(3),
  };
}

// ============ Tests ============
let passed = 0, failed = 0;

function test(name, fn) {
  console.log(`\n${name}`);
  try {
    fn();
  } catch (e) {
    console.log(`  ❌ EXCEPTION: ${e.message}`);
    failed++;
  }
}

console.log('╔══════════════════════════════════════════╗');
console.log('║   SOROBAN AR - Test de gestos simulados  ║');
console.log('╚══════════════════════════════════════════╝');

// Test 1: Detección de dedos extendidos
test('TEST 1: Mano abierta - todos los dedos extendidos', () => {
  landmarkHistory = [handOpen()];
  const lm = landmarkHistory[0];
  if (assert(isIndexExt(lm), 'Índice extendido')) passed++; else failed++;
  if (assert(isMiddleExt(lm), 'Medio extendido')) passed++; else failed++;
  if (assert(isRingExt(lm), 'Anular extendido')) passed++; else failed++;
  if (assert(isPinkyExt(lm), 'Meñique extendido')) passed++; else failed++;
  if (assert(isThumbExt(lm), 'Pulgar extendido')) passed++; else failed++;
});

test('TEST 2: Puño - ningún dedo extendido', () => {
  landmarkHistory = [handFist()];
  const lm = landmarkHistory[0];
  if (assert(!isIndexExt(lm), 'Índice NO extendido')) passed++; else failed++;
  if (assert(!isMiddleExt(lm), 'Medio NO extendido')) passed++; else failed++;
  if (assert(!isRingExt(lm), 'Anular NO extendido')) passed++; else failed++;
  if (assert(!isPinkyExt(lm), 'Meñique NO extendido')) passed++; else failed++;
});

test('TEST 3: Solo índice extendido', () => {
  landmarkHistory = [handIndexOnly()];
  const lm = landmarkHistory[0];
  if (assert(isIndexExt(lm), 'Índice extendido')) passed++; else failed++;
  if (assert(!isMiddleExt(lm), 'Medio NO extendido')) passed++; else failed++;
  if (assert(!isRingExt(lm), 'Anular NO extendido')) passed++; else failed++;
  if (assert(!isPinkyExt(lm), 'Meñique NO extendido')) passed++; else failed++;
});

test('TEST 4: Solo pulgar extendido', () => {
  landmarkHistory = [handThumbOnly()];
  const lm = landmarkHistory[0];
  if (assert(!isIndexExt(lm), 'Índice NO extendido')) passed++; else failed++;
  if (assert(isThumbExt(lm), 'Pulgar extendido')) passed++; else failed++;
});

test('TEST 5: Pellizco - pulgar e índice juntos', () => {
  landmarkHistory = [handPinch()];
  const lm = landmarkHistory[0];
  const dist = pinchDistFn(lm);
  if (assert(dist < 0.06, `Distancia pellizco = ${dist.toFixed(4)} (< 0.06)`)) passed++; else failed++;
});

test('TEST 6: Pulgar + Índice (para Small Friend)', () => {
  landmarkHistory = [handThumbAndIndex()];
  const lm = landmarkHistory[0];
  if (assert(isThumbExt(lm), 'Pulgar extendido')) passed++; else failed++;
  if (assert(isIndexExt(lm), 'Índice extendido')) passed++; else failed++;
  if (assert(!isMiddleExt(lm), 'Medio NO extendido')) passed++; else failed++;
});

test('TEST 7: Tres dedos (para borrar)', () => {
  landmarkHistory = [handThreeFingers()];
  const lm = landmarkHistory[0];
  if (assert(isIndexExt(lm), 'Índice extendido')) passed++; else failed++;
  if (assert(isMiddleExt(lm), 'Medio extendido')) passed++; else failed++;
  if (assert(isRingExt(lm), 'Anular extendido')) passed++; else failed++;
  if (assert(!isPinkyExt(lm), 'Meñique NO extendido')) passed++; else failed++;
});

// Test 2: Mapeo de columnas
test('TEST 8: Mapeo de posición X a columna', () => {
  // Simular soroban en centro de pantalla
  const col = getColFromX(0.5);
  if (assert(col >= 0 && col < COLS, `Col para X=0.5: ${col} (rango válido)`)) passed++; else failed++;

  // Borde izquierdo (fuera del soroban)
  const colLeft = getColFromX(0.01);
  if (assert(colLeft === -1, `Fuera de soroban a la izquierda: ${colLeft}`)) passed++; else failed++;

  // Borde derecho (fuera del soroban)
  const colRight = getColFromX(0.99);
  if (assert(colRight === -1, `Fuera de soroban a la derecha: ${colRight}`)) passed++; else failed++;
});

// Test 3: Lógica del soroban
test('TEST 9: Estado inicial del soroban = 0', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 0, `Valor inicial = ${v}`)) passed++; else failed++;
});

test('TEST 10: Sumar 1 en última columna (earth=1)', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  s[COLS - 1].earth = 1;
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 1, `Valor con earth=1 en última col = ${v}`)) passed++; else failed++;
});

test('TEST 11: Sumar 5 en última columna (heaven=1)', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  s[COLS - 1].heaven = 1;
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 5, `Valor con heaven=1 en última col = ${v}`)) passed++; else failed++;
});

test('TEST 12: Valor 9 (heaven=1, earth=4)', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  s[COLS - 1].heaven = 1;
  s[COLS - 1].earth = 4;
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 9, `Valor 9 = heaven(1) + earth(4): ${v}`)) passed++; else failed++;
});

test('TEST 13: Valor 123 en soroban', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  // 123 = col[-3]=1, col[-2]=2, col[-1]=3
  s[COLS - 3].earth = 1;
  s[COLS - 2].earth = 2;
  s[COLS - 1].earth = 3;
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 123, `Valor 123: ${v}`)) passed++; else failed++;
});

test('TEST 14: Small Friend - sumar 2 a 3 = 5', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  s[COLS - 1].earth = 3;  // Valor actual: 3
  // Small Friend: heaven=1, earth=0 → valor 5
  s[COLS - 1].heaven = 1;
  s[COLS - 1].earth = 0;
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 5, `3 + 2 (Small Friend) = ${v}`)) passed++; else failed++;
});

test('TEST 15: Sumar 7 (heaven=1, earth=2)', () => {
  const s = Array.from({length: COLS}, () => ({heaven: 0, earth: 0}));
  s[COLS - 1].heaven = 1;
  s[COLS - 1].earth = 2;
  let v = 0;
  for (let c = 0; c < COLS; c++) v = v * 10 + s[c].heaven * 5 + s[c].earth;
  if (assert(v === 7, `Valor 7 = heaven(1) + earth(2): ${v}`)) passed++; else failed++;
});

// Test 4: Suavizado de landmarks
test('TEST 16: Suavizado con media móvil', () => {
  landmarkHistory = [
    makeLandmarks({8: {y: 0.30}}),
    makeLandmarks({8: {y: 0.28}}),
    makeLandmarks({8: {y: 0.32}}),
  ];
  const smoothed = getSmoothed(8);
  const expected = (0.30 + 0.28 + 0.32) / 3;
  if (assert(Math.abs(smoothed.y - expected) < 0.001, `Y suavizado = ${smoothed.y.toFixed(4)} (esperado ~${expected.toFixed(4)})`)) passed++; else failed++;
});

// Test 5: Velocidad de movimiento
test('TEST 17: Detección de velocidad (movimiento vertical)', () => {
  landmarkHistory = [
    makeLandmarks({8: {y: 0.40}}),
    makeLandmarks({8: {y: 0.35}}),
    makeLandmarks({8: {y: 0.30}}),
    makeLandmarks({8: {y: 0.25}}),
  ];
  const n = landmarkHistory.length;
  const recent = landmarkHistory[n - 1][8].y;
  const older = landmarkHistory[Math.max(0, n - 4)][8].y;
  const velY = (recent - older) / (n - 1);
  if (assert(velY < 0, `Velocidad Y = ${velY.toFixed(4)} (negativa = moviendo arriba)`)) passed++; else failed++;
});

// Resumen
console.log('\n╔══════════════════════════════════════════╗');
console.log(`║  RESULTADOS: ${passed} pasados, ${failed} fallidos         ║`);
console.log('╚══════════════════════════════════════════╝');

if (failed > 0) {
  console.log('\n⚠️  Hay tests fallidos - revisar código');
  process.exit(1);
} else {
  console.log('\n✅ Todos los tests pasaron');
}
