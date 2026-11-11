// Test v4 - Logica precisa de cuentas: deteccion, cantidad y direccion
const COLS=10;
let passed=0,failed=0;
function assert(cond,msg){if(!cond){console.log('  ❌ FAIL: '+msg);failed++}else{console.log('  ✓ '+msg);passed++}}
function test(name,fn){console.log('\n'+name);try{fn()}catch(e){console.log('  ❌ EXCEPTION: '+e.message);failed++}}

const state=Array.from({length:COLS},()=>({heaven:0,earth:0}));

// Simular la logica de aplicacion de movimientos
function applyEarthMovement(col,finger,beadIdx,movementY){
  const current=state[col].earth;
  let target=current;
  let applied=false;

  if(finger==='thumb'&&movementY<-15){
    if(beadIdx>=0){
      target=Math.max(current,beadIdx+1);
    }else{
      target=Math.min(4,current+1);
    }
    if(target>current){
      state[col].earth=target;
      applied=true;
    }
  }else if(finger==='index'&&movementY>15){
    if(beadIdx>=0){
      target=Math.min(current,beadIdx);
    }else{
      target=Math.max(0,current-1);
    }
    if(target<current){
      state[col].earth=target;
      applied=true;
    }
  }
  return{applied,from:current,to:state[col].earth,moved:Math.abs(state[col].earth-current)};
}

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  TEST v4 - Logica precisa de cuentas                 ║');
console.log('╚══════════════════════════════════════════════════════╝');

test('TEST 1: Pulgar en cuenta 2 (earth=0) → sumar 3 cuentas',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'thumb',2,-50);
  assert(r.applied,'Se aplica el movimiento');
  assert(state[0].earth===3,'earth=3 (cuentas 0,1,2 activadas)');
  assert(r.moved===3,'Se movieron 3 cuentas');
});

test('TEST 2: Pulgar en cuenta 0 (earth=0) → sumar 1 cuenta',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'thumb',0,-50);
  assert(r.applied,'Se aplica el movimiento');
  assert(state[0].earth===1,'earth=1 (solo cuenta 0 activada)');
  assert(r.moved===1,'Se movio 1 cuenta');
});

test('TEST 3: Pulgar en cuenta 3 (earth=0) → sumar 4 cuentas',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'thumb',3,-50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===4,'earth=4 (todas activadas)');
  assert(r.moved===4,'Se movieron 4 cuentas');
});

test('TEST 4: Indice en cuenta 1 (earth=3) → restar 2 cuentas',()=>{
  state[0].earth=3;
  const r=applyEarthMovement(0,'index',1,50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===1,'earth=1 (cuentas 1,2 desactivadas)');
  assert(r.moved===2,'Se movieron 2 cuentas');
});

test('TEST 5: Indice en cuenta 2 (earth=3) → restar 1 cuenta',()=>{
  state[0].earth=3;
  const r=applyEarthMovement(0,'index',2,50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===2,'earth=2 (cuenta 2 desactivada)');
  assert(r.moved===1,'Se movio 1 cuenta');
});

test('TEST 6: Indice en cuenta 0 (earth=4) → restar 4 cuentas',()=>{
  state[0].earth=4;
  const r=applyEarthMovement(0,'index',0,50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===0,'earth=0 (todas desactivadas)');
  assert(r.moved===4,'Se movieron 4 cuentas');
});

test('TEST 7: Pulgar en cuenta 2 (earth=3) → NO cambia (cuenta ya activa)',()=>{
  state[0].earth=3;
  const r=applyEarthMovement(0,'thumb',2,-50);
  assert(!r.applied,'No se aplica (target=max(3,3)=3, no > current)');
  assert(state[0].earth===3,'earth sigue en 3');
});

test('TEST 8: Indice en cuenta 1 (earth=1) → NO cambia (cuenta ya inactiva)',()=>{
  state[0].earth=1;
  const r=applyEarthMovement(0,'index',1,50);
  assert(!r.applied,'No se aplica (target=min(1,1)=1, no < current)');
  assert(state[0].earth===1,'earth sigue en 1');
});

test('TEST 9: Pulgar sin cuenta especifica → sumar 1',()=>{
  state[0].earth=1;
  const r=applyEarthMovement(0,'thumb',-1,-50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===2,'earth=2');
  assert(r.moved===1,'Se movio 1 cuenta');
});

test('TEST 10: Indice sin cuenta especifica → restar 1',()=>{
  state[0].earth=3;
  const r=applyEarthMovement(0,'index',-1,50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===2,'earth=2');
  assert(r.moved===1,'Se movio 1 cuenta');
});

test('TEST 11: Pulgar movimiento insuficiente (<15px) → no aplica',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'thumb',2,-10);
  assert(!r.applied,'No se aplica (movimiento < 15px)');
  assert(state[0].earth===0,'earth sigue en 0');
});

test('TEST 12: Indice movimiento insuficiente (<15px) → no aplica',()=>{
  state[0].earth=3;
  const r=applyEarthMovement(0,'index',1,10);
  assert(!r.applied,'No se aplica (movimiento < 15px)');
  assert(state[0].earth===3,'earth sigue en 3');
});

test('TEST 13: Pulgar en earth=4 → no puede sumar mas',()=>{
  state[0].earth=4;
  const r=applyEarthMovement(0,'thumb',3,-50);
  assert(!r.applied,'No se aplica (ya en maximo)');
  assert(state[0].earth===4,'earth sigue en 4');
});

test('TEST 14: Indice en earth=0 → no puede restar mas',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'index',0,50);
  assert(!r.applied,'No se aplica (ya en minimo)');
  assert(state[0].earth===0,'earth sigue en 0');
});

test('TEST 15: Pulgar mueve hacia abajo → no aplica (direccion incorrecta)',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'thumb',2,50);
  assert(!r.applied,'No se aplica (pulgar solo suma, movimiento hacia abajo)');
  assert(state[0].earth===0,'earth sigue en 0');
});

test('TEST 16: Indice mueve hacia arriba → no aplica (direccion incorrecta)',()=>{
  state[0].earth=3;
  const r=applyEarthMovement(0,'index',1,-50);
  assert(!r.applied,'No se aplica (indice solo resta, movimiento hacia arriba)');
  assert(state[0].earth===3,'earth sigue en 3');
});

test('TEST 17: Secuencia completa - sumar de 0 a 4 con pulgar',()=>{
  state[0].earth=0;
  let r=applyEarthMovement(0,'thumb',0,-50);
  assert(r.applied&&state[0].earth===1,'Paso 1: earth=1');
  r=applyEarthMovement(0,'thumb',1,-50);
  assert(r.applied&&state[0].earth===2,'Paso 2: earth=2');
  r=applyEarthMovement(0,'thumb',2,-50);
  assert(r.applied&&state[0].earth===3,'Paso 3: earth=3');
  r=applyEarthMovement(0,'thumb',3,-50);
  assert(r.applied&&state[0].earth===4,'Paso 4: earth=4');
});

test('TEST 18: Secuencia completa - restar de 4 a 0 con indice',()=>{
  state[0].earth=4;
  let r=applyEarthMovement(0,'index',3,50);
  assert(r.applied&&state[0].earth===3,'Paso 1: earth=3');
  r=applyEarthMovement(0,'index',2,50);
  assert(r.applied&&state[0].earth===2,'Paso 2: earth=2');
  r=applyEarthMovement(0,'index',1,50);
  assert(r.applied&&state[0].earth===1,'Paso 3: earth=1');
  r=applyEarthMovement(0,'index',0,50);
  assert(r.applied&&state[0].earth===0,'Paso 4: earth=0');
});

test('TEST 19: Pulgar en cuenta lejana activa muchas de golpe',()=>{
  state[0].earth=0;
  const r=applyEarthMovement(0,'thumb',3,-50);
  assert(r.applied,'Se aplica');
  assert(state[0].earth===4,'earth=4 (activo todas hasta la cuenta 3)');
  assert(r.moved===4,'4 cuentas movidas de golpe');
});

test('TEST 20: Columnas independientes',()=>{
  state[0].earth=0;
  state[1].earth=4;
  applyEarthMovement(0,'thumb',2,-50);
  applyEarthMovement(1,'index',1,50);
  assert(state[0].earth===3,'Col 0: earth=3 (pulgar sumo)');
  assert(state[1].earth===1,'Col 1: earth=1 (indice resto)');
});

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  RESULTADOS: '+passed+' pasados, '+failed+' fallidos                ║');
console.log('╚══════════════════════════════════════════════════════╝');
if(failed>0){console.log('\n⚠️  Hay tests fallidos');process.exit(1)}
else console.log('\n✅ Todos los tests pasaron');
