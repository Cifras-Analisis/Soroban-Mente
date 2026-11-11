// Test de la lógica nueva: dead zones, histéresis, hold, cooldown
const assert = (condition, msg) => {
  if (!condition) { console.log(`  ❌ FAIL: ${msg}`); return false; }
  console.log(`  ✓ ${msg}`);
  return true;
};

let passed = 0, failed = 0;

function test(name, fn) {
  console.log(`\n${name}`);
  try { fn(); } catch (e) { console.log(`  ❌ EXCEPTION: ${e.message}`); failed++; }
}

// ============ Dead zones para tierra ============
function earthFromPos(relPos, currentEarth) {
  const b = [0.15, 0.35, 0.55, 0.75];
  const dz = 0.05;
  if (relPos < b[0] - dz) return 4;
  if (relPos < b[0] + dz) return currentEarth;
  if (relPos < b[1] - dz) return 3;
  if (relPos < b[1] + dz) return currentEarth;
  if (relPos < b[2] - dz) return 2;
  if (relPos < b[2] + dz) return currentEarth;
  if (relPos < b[3] - dz) return 1;
  if (relPos < b[3] + dz) return currentEarth;
  return 0;
}

// ============ Histéresis para cielo ============
function heavenFromPos(relPos, currentHeaven) {
  const actT = 0.55, deactT = 0.35;
  if (currentHeaven === 0) return relPos > actT ? 1 : 0;
  return relPos < deactT ? 0 : 1;
}

// ============ Cooldown ============
let colLastAction = {};
const ACTION_COOLDOWN = 333;
function canApplyCol(col) {
  const now = Date.now();
  const last = colLastAction[col] || 0;
  return (now - last) >= ACTION_COOLDOWN;
}

console.log('╔══════════════════════════════════════════════╗');
console.log('║  TESTS v2 - Dead zones, histéresis, hold     ║');
console.log('╚══════════════════════════════════════════════╝');

test('TEST 1: Dead zones - posición clara → valor definido', () => {
  if (assert(earthFromPos(0.05, 0) === 4, 'relPos=0.05 (cerca barra) → 4')) passed++; else failed++;
  if (assert(earthFromPos(0.25, 0) === 3, 'relPos=0.25 → 3')) passed++; else failed++;
  if (assert(earthFromPos(0.45, 0) === 2, 'relPos=0.45 → 2')) passed++; else failed++;
  if (assert(earthFromPos(0.65, 0) === 1, 'relPos=0.65 → 1')) passed++; else failed++;
  if (assert(earthFromPos(0.85, 0) === 0, 'relPos=0.85 (lejos barra) → 0')) passed++; else failed++;
});

test('TEST 2: Dead zones - posición en buffer → mantiene valor actual', () => {
  if (assert(earthFromPos(0.15, 4) === 4, 'En borde 0.15 con actual=4 → mantiene 4')) passed++; else failed++;
  if (assert(earthFromPos(0.15, 3) === 3, 'En borde 0.15 con actual=3 → mantiene 3')) passed++; else failed++;
  if (assert(earthFromPos(0.35, 3) === 3, 'En borde 0.35 con actual=3 → mantiene 3')) passed++; else failed++;
  if (assert(earthFromPos(0.35, 2) === 2, 'En borde 0.35 con actual=2 → mantiene 2')) passed++; else failed++;
  if (assert(earthFromPos(0.55, 2) === 2, 'En borde 0.55 con actual=2 → mantiene 2')) passed++; else failed++;
  if (assert(earthFromPos(0.75, 1) === 1, 'En borde 0.75 con actual=1 → mantiene 1')) passed++; else failed++;
});

test('TEST 3: Dead zones - jitter pequeño no cambia valor', () => {
  let val = earthFromPos(0.25, 0);
  if (assert(val === 3, 'Posición 0.25 → 3')) passed++; else failed++;
  val = earthFromPos(0.28, val);
  if (assert(val === 3, 'Jitter a 0.28 (aún en zona 3) → sigue 3')) passed++; else failed++;
  val = earthFromPos(0.30, val);
  if (assert(val === 3, 'Jitter a 0.30 (dead zone) → sigue 3')) passed++; else failed++;
  val = earthFromPos(0.32, val);
  if (assert(val === 3, 'Jitter a 0.32 (dead zone) → sigue 3')) passed++; else failed++;
});

test('TEST 4: Histéresis cielo - activar requiere pasar umbral alto', () => {
  if (assert(heavenFromPos(0.30, 0) === 0, 'relPos=0.30 con cielo=0 → sigue 0')) passed++; else failed++;
  if (assert(heavenFromPos(0.50, 0) === 0, 'relPos=0.50 con cielo=0 → sigue 0')) passed++; else failed++;
  if (assert(heavenFromPos(0.56, 0) === 1, 'relPos=0.56 con cielo=0 → activa a 1')) passed++; else failed++;
  if (assert(heavenFromPos(0.60, 0) === 1, 'relPos=0.60 con cielo=0 → 1')) passed++; else failed++;
});

test('TEST 5: Histéresis cielo - desactivar requiere pasar umbral bajo', () => {
  if (assert(heavenFromPos(0.50, 1) === 1, 'relPos=0.50 con cielo=1 → sigue 1')) passed++; else failed++;
  if (assert(heavenFromPos(0.40, 1) === 1, 'relPos=0.40 con cielo=1 → sigue 1')) passed++; else failed++;
  if (assert(heavenFromPos(0.36, 1) === 1, 'relPos=0.36 con cielo=1 → sigue 1')) passed++; else failed++;
  if (assert(heavenFromPos(0.30, 1) === 0, 'relPos=0.30 con cielo=1 → desactiva a 0')) passed++; else failed++;
});

test('TEST 6: Histéresis cielo - banda muerta entre 0.35 y 0.55', () => {
  let val = 0;
  val = heavenFromPos(0.40, val);
  if (assert(val === 0, 'Desde 0, pos=0.40 (banda muerta) → 0')) passed++; else failed++;
  val = heavenFromPos(0.45, val);
  if (assert(val === 0, 'Desde 0, pos=0.45 (banda muerta) → 0')) passed++; else failed++;
  val = heavenFromPos(0.56, val);
  if (assert(val === 1, 'Desde 0, pos=0.56 → activa a 1')) passed++; else failed++;
  val = heavenFromPos(0.50, val);
  if (assert(val === 1, 'Desde 1, pos=0.50 (banda muerta) → 1')) passed++; else failed++;
  val = heavenFromPos(0.40, val);
  if (assert(val === 1, 'Desde 1, pos=0.40 (banda muerta) → 1')) passed++; else failed++;
  val = heavenFromPos(0.30, val);
  if (assert(val === 0, 'Desde 1, pos=0.30 → desactiva a 0')) passed++; else failed++;
});

test('TEST 7: Cooldown - no permite acciones seguidas', () => {
  colLastAction = {};
  if (assert(canApplyCol(5) === true, 'Col 5: primera vez → permitido')) passed++; else failed++;
  colLastAction[5] = Date.now();
  if (assert(canApplyCol(5) === false, 'Col 5: inmediatamente después → bloqueado')) passed++; else failed++;
  if (assert(canApplyCol(3) === true, 'Col 3: primera vez → permitido (independiente)')) passed++; else failed++;
});

test('TEST 8: Cooldown - permite después de 333ms', () => {
  colLastAction = {};
  colLastAction[5] = Date.now() - 400;
  if (assert(canApplyCol(5) === true, 'Col 5: 400ms después → permitido')) passed++; else failed++;
});

test('TEST 9: Hold threshold - 1 segundo', () => {
  const HOLD = 1000;
  const start = Date.now() - 500;
  if (assert(Date.now() - start < HOLD, '500ms transcurridos → NO confirmado')) passed++; else failed++;
  const start2 = Date.now() - 1100;
  if (assert(Date.now() - start2 >= HOLD, '1100ms transcurridos → confirmado')) passed++; else failed++;
});

test('TEST 10: Columna determinada por pulgar+índice', () => {
  const COLS = 10;
  const sorobanLeft = 128, sorobanRight = 1152, canvasWidth = 1280;

  function getColFromX(normX) {
    const screenX = (1 - normX) * canvasWidth;
    if (screenX < sorobanLeft || screenX > sorobanRight) return -1;
    const rel = (screenX - sorobanLeft) / (sorobanRight - sorobanLeft);
    return Math.max(0, Math.min(COLS - 1, Math.floor(rel * COLS)));
  }

  const thumbX = 0.50, indexX = 0.50;
  const thumbCol = getColFromX(thumbX);
  const indexCol = getColFromX(indexX);
  if (assert(thumbCol === indexCol, `Misma posición: thumb=${thumbCol}, index=${indexCol} → misma columna`)) passed++; else failed++;

  const t2 = getColFromX(0.45), i2 = getColFromX(0.55);
  if (assert(t2 !== i2, `Diferente posición: thumb=${t2}, index=${i2} → columnas distintas`)) passed++; else failed++;
});

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`║  RESULTADOS: ${passed} pasados, ${failed} fallidos            ║`);
console.log(`╚══════════════════════════════════════════════╝`);

if (failed > 0) { console.log('\n⚠️  Hay tests fallidos'); process.exit(1); }
else console.log('\n✅ Todos los tests pasaron');
