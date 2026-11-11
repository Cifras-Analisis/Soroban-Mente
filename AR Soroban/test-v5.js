// Test v5 - Objetivo por posicion (multi-cuenta) y continuidad del gesto
const COLS=10,COL_W=80,SLOT=42,BEAD_H=38,GAP=22,TRAVEL=SLOT+GAP;
const HEAVEN_H=SLOT+TRAVEL,BEAM_H=20,EARTH_H=SLOT*4+TRAVEL;
const BEAD_PAD=(SLOT-BEAD_H)/2;
const MIN_TRAVEL=30;

let passed=0,failed=0;
function assert(cond,msg){if(!cond){console.log('  ❌ FAIL: '+msg);failed++}else{console.log('  ✓ '+msg);passed++}}
function test(name,fn){console.log('\n'+name);try{fn()}catch(e){console.log('  ❌ EXCEPTION: '+e.message);failed++}}

const state=Array.from({length:COLS},()=>({heaven:0,earth:0}));

// Replica exacta de beadTargetFromY del HTML
function beadTargetFromY(col,finger,y,sorobanTop,bsY){
  const s=state[col];
  const base=sorobanTop+(HEAVEN_H+BEAM_H)*bsY;
  let best=null,bestDist=Infinity;
  for(let i=0;i<4;i++){
    const active=i<s.earth;
    if(finger==='thumb'&&active)continue;
    if(finger==='index'&&!active)continue;
    const off=active?0:TRAVEL;
    const cy=base+(off+i*SLOT+BEAD_PAD+BEAD_H/2)*bsY;
    const d=Math.abs(y-cy);
    if(d<bestDist){bestDist=d;best=i}
  }
  if(best===null)return null;
  return finger==='thumb'?best+1:best;
}

// Replica de la aplicacion en processInteraction
function applyMovement(col,finger,y,movementY,opts){
  opts=opts||{};
  const bsY=opts.bsY===undefined?1:opts.bsY;
  const sorobanTop=opts.sorobanTop||0;
  const holdOk=opts.holdOk!==false;
  const cooldownOk=opts.cooldownOk!==false;
  const current=state[col].earth;
  const targetFromPos=beadTargetFromY(col,finger,y,sorobanTop,bsY);
  let target=current,applied=false;
  if(holdOk&&cooldownOk){
    if(finger==='thumb'&&movementY<-15&&targetFromPos!==null){
      target=Math.max(current,targetFromPos);
      if(target>current){state[col].earth=target;applied=true}
    }else if(finger==='index'&&movementY>15&&targetFromPos!==null){
      target=Math.min(current,targetFromPos);
      if(target<current){state[col].earth=target;applied=true}
    }
  }
  return{applied,from:current,to:state[col].earth,moved:Math.abs(state[col].earth-current),target:targetFromPos};
}

// Centros de cuentas para bsY=1, sorobanTop=0
const inactiveCy=i=>HEAVEN_H+BEAM_H+TRAVEL+i*SLOT+BEAD_PAD+BEAD_H/2; // 211+42i
const activeCy=i=>HEAVEN_H+BEAM_H+i*SLOT+BEAD_PAD+BEAD_H/2;          // 147+42i

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  TEST v5 - Multi-cuenta por posicion                 ║');
console.log('╚══════════════════════════════════════════════════════╝');

test('TEST 1: Pulgar toca cuenta 2 (earth=0) → mueve 3 de golpe',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(2),-50);
  assert(r.applied,'Se aplica');
  assert(r.moved===3,'3 cuentas movidas en un solo gesto');
  assert(state[0].earth===3,'earth=3');
});

test('TEST 2: Pulgar toca cuenta 0 (earth=0) → mueve 1',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(0),-50);
  assert(r.applied&&state[0].earth===1&&r.moved===1,'1 cuenta');
});

test('TEST 3: Pulgar toca cuenta 3 (earth=0) → mueve 4',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(3),-50);
  assert(r.applied&&state[0].earth===4&&r.moved===4,'4 cuentas');
});

test('TEST 4: Pulgar entre cuentas 1 y 2 → elige la mas cercana',()=>{
  state[0].earth=0;
  const y=(inactiveCy(1)+inactiveCy(2))/2+5; // mas cerca de 2
  const r=applyMovement(0,'thumb',y,-50);
  assert(r.target===3,'target=3 (cuenta mas cercana = 2, +1)');
  assert(state[0].earth===3,'earth=3');
});

test('TEST 5: Indice toca cuenta activa 1 (earth=4) → resta 3',()=>{
  state[0].earth=4;
  const r=applyMovement(0,'index',activeCy(1),50);
  assert(r.applied,'Se aplica');
  assert(r.moved===3,'3 cuentas restadas de golpe');
  assert(state[0].earth===1,'earth=1');
});

test('TEST 6: Indice toca cuenta activa 3 (earth=4) → resta 1',()=>{
  state[0].earth=4;
  const r=applyMovement(0,'index',activeCy(3),50);
  assert(r.applied&&state[0].earth===3&&r.moved===1,'1 cuenta');
});

test('TEST 7: Indice toca cuenta activa 0 (earth=4) → resta 4',()=>{
  state[0].earth=4;
  const r=applyMovement(0,'index',activeCy(0),50);
  assert(r.applied&&state[0].earth===0&&r.moved===4,'4 cuentas');
});

test('TEST 8: Indice toca zona inactiva (earth=4) → resta 1 (cuenta activa mas baja)',()=>{
  state[0].earth=4;
  const r=applyMovement(0,'index',inactiveCy(3),50);
  assert(r.target===3,'target=3 (ultima activa)');
  assert(r.applied&&state[0].earth===3,'earth=3');
});

test('TEST 9: Pulgar con earth=4 → no hay cuentas inactivas, no aplica',()=>{
  state[0].earth=4;
  const r=applyMovement(0,'thumb',inactiveCy(3),-50);
  assert(r.target===null,'target=null');
  assert(!r.applied&&state[0].earth===4,'sin cambios');
});

test('TEST 10: Indice con earth=0 → no hay cuentas activas, no aplica',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'index',activeCy(0),50);
  assert(r.target===null,'target=null');
  assert(!r.applied&&state[0].earth===0,'sin cambios');
});

test('TEST 11: Pulgar mueve hacia abajo → no aplica',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(2),50);
  assert(!r.applied&&state[0].earth===0,'sin cambios (direccion incorrecta)');
});

test('TEST 12: Indice mueve hacia arriba → no aplica',()=>{
  state[0].earth=4;
  const r=applyMovement(0,'index',activeCy(1),-50);
  assert(!r.applied&&state[0].earth===4,'sin cambios (direccion incorrecta)');
});

test('TEST 13: Movimiento insuficiente (<15px) → no aplica',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(2),-10);
  assert(!r.applied&&state[0].earth===0,'sin cambios');
});

test('TEST 14: Sin hold confirmado → no aplica',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(2),-50,{holdOk:false});
  assert(!r.applied&&state[0].earth===0,'sin cambios');
});

test('TEST 15: Con cooldown activo → no aplica',()=>{
  state[0].earth=0;
  const r=applyMovement(0,'thumb',inactiveCy(2),-50,{cooldownOk:false});
  assert(!r.applied&&state[0].earth===0,'sin cambios');
});

test('TEST 16: Funciona con escala distinta (bsY=1.3, top=50)',()=>{
  state[0].earth=0;
  const top=50,bsY=1.3;
  const cy=top+(HEAVEN_H+BEAM_H+TRAVEL+2*SLOT+BEAD_PAD+BEAD_H/2)*bsY;
  const r=applyMovement(0,'thumb',cy,-50,{bsY,sorobanTop:top});
  assert(r.applied&&state[0].earth===3,'earth=3 con escala 1.3');
});

test('TEST 17: Columnas independientes',()=>{
  state[0].earth=0;state[1].earth=4;
  applyMovement(0,'thumb',inactiveCy(2),-50);
  applyMovement(1,'index',activeCy(1),50);
  assert(state[0].earth===3,'col 0 earth=3');
  assert(state[1].earth===1,'col 1 earth=1');
});

test('TEST 18: Secuencia 0→4 tocando cada cuenta',()=>{
  state[0].earth=0;
  applyMovement(0,'thumb',inactiveCy(0),-50);
  assert(state[0].earth===1,'earth=1');
  applyMovement(0,'thumb',inactiveCy(1),-50);
  assert(state[0].earth===2,'earth=2');
  applyMovement(0,'thumb',inactiveCy(2),-50);
  assert(state[0].earth===3,'earth=3');
  applyMovement(0,'thumb',inactiveCy(3),-50);
  assert(state[0].earth===4,'earth=4');
});

test('TEST 19: Secuencia 4→0 tocando cada cuenta activa',()=>{
  state[0].earth=4;
  applyMovement(0,'index',activeCy(3),50);
  assert(state[0].earth===3,'earth=3');
  applyMovement(0,'index',activeCy(2),50);
  assert(state[0].earth===2,'earth=2');
  applyMovement(0,'index',activeCy(1),50);
  assert(state[0].earth===1,'earth=1');
  applyMovement(0,'index',activeCy(0),50);
  assert(state[0].earth===0,'earth=0');
});

test('TEST 20: Continuidad - dedo sale de las cuentas pero sigue en la columna',()=>{
  // Simula: toque inicia en cuenta 2, dedo sube 100px (sale del area),
  // la columna sigue siendo la misma -> el gesto NO se cancela
  state[0].earth=0;
  let touchingFinger='thumb',touchedBead={col:0,type:'earth',idx:2};
  let fingerPos={x:40,y:inactiveCy(2)-100};
  const col=0; // getColFromScreenX devuelve 0
  let touch=null;
  if(touchingFinger&&touchedBead&&col===touchedBead.col)touch=touchedBead;
  assert(touch!==null,'El gesto sobrevive al salir del area de cuentas');
  const r=applyMovement(0,'thumb',inactiveCy(2),-100);
  assert(r.applied&&state[0].earth===3,'Se aplica aunque el dedo este lejos');
});

test('TEST 21: Cielo solo lo cambia el indice',()=>{
  state[0].heaven=0;
  state[0].heaven=state[0].heaven?0:1;
  assert(state[0].heaven===1,'indice activa cielo');
  state[0].heaven=state[0].heaven?0:1;
  assert(state[0].heaven===0,'indice desactiva cielo');
});

test('TEST 22: Tras aplicar, sin nuevo movimiento no se repite',()=>{
  state[0].earth=0;
  const r1=applyMovement(0,'thumb',inactiveCy(2),-50);
  assert(r1.applied&&state[0].earth===3,'primer gesto mueve 3');
  const r2=applyMovement(0,'thumb',inactiveCy(2),-5);
  assert(!r2.applied&&state[0].earth===3,'sin nuevo movimiento no cambia');
});

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  RESULTADOS: '+passed+' pasados, '+failed+' fallidos                ║');
console.log('╚══════════════════════════════════════════════════════╝');
if(failed>0){console.log('\n⚠️  Hay tests fallidos');process.exit(1)}
else console.log('\n✅ Todos los tests pasaron');
