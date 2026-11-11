// Test v6 - Ejecuta el <script> REAL de soroban-ar.html con un DOM simulado y manos sinteticas.
// Uso: node test-v6.js [ruta-al-html]
const fs=require('fs'),path=require('path'),vm=require('vm');
const file=process.argv[2]||path.join(__dirname,'soroban-ar.html');
const html=fs.readFileSync(file,'utf8');
const source=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));

let passed=0,failed=0;
function assert(cond,msg){if(!cond){console.log('  ❌ FAIL: '+msg);failed++}else{console.log('  ✓ '+msg);passed++}}

function makeApp(W=1280,H=720){
  let t=1000,keydown=null;
  const timers=[];
  // Temporizadores simulados: corren cuando el reloj de la prueba los alcanza
  function runTimers(){
    for(let i=0;i<timers.length;i++){const tm=timers[i];if(tm&&tm.at<=t){timers[i]=null;tm.f()}}
  }
  const els={};
  const makeEl=id=>{
    const classes=new Set();
    const el={id,style:{},children:[],className:'',textContent:'',
      classList:{add:(...a)=>a.forEach(c=>classes.add(c)),remove:(...a)=>a.forEach(c=>classes.delete(c)),contains:c=>classes.has(c)},
      appendChild(c){el.children.push(c);return c},
      cloneNode(){return makeEl('')},
      on:{},
      addEventListener(t,f){el.on[t]=f},
      getContext:()=>new Proxy({},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true}}),
      getBoundingClientRect(){return rectOf(el)}};
    return el;
  };
  const get=id=>els[id]||(els[id]=makeEl(id));
  // Geometria tal como la colocaria el navegador: left:5%, bottom:4%, padding 14px y transform:scale
  function layout(){
    const wrap=get('sorobanWrap'),s=parseFloat((wrap.style.transform||'scale(1)').slice(6))||1;
    const origin=wrap.style.transformOrigin||ctx.__cssOrigin;
    const w=800+28,h=358+28,left=W*.05,bottom=H*.86;
    const fx=origin==='left bottom'?0:.5,fy=origin==='left bottom'?1:.5;
    const boxLeft=left+w*fx-w*fx*s,boxTop=(bottom-h)+h*fy-h*fy*s;
    return{s,left:boxLeft+14*s,top:boxTop+14*s,boxLeft,boxBottom:boxTop+h*s};
  }
  function rectOf(el){
    const l=layout();
    if(el.id==='board')return{left:l.left,top:l.top,right:l.left+800*l.s,bottom:l.top+358*l.s,width:800*l.s,height:358*l.s};
    if(el.id==='beam')return{left:l.left,top:l.top+106*l.s,height:20*l.s,width:800*l.s};
    return{left:0,top:0,width:0,height:0};
  }
  const ctx=vm.createContext({
    __cssOrigin:/#sorobanWrap\{[^}]*transform-origin:left bottom/.test(html)?'left bottom':'center',
    console,Math,JSON,Array,Object,Set,Map,Promise,String,Number,parseFloat,
    Date:{now:()=>t},
    setTimeout:(f,ms)=>{timers.push({f,at:t+(ms||0)});return timers.length},
    clearTimeout:id=>{if(id)timers[id-1]=null},setInterval:()=>0,
    requestAnimationFrame:f=>{f();return 0},
    performance:{now:()=>t},
    location:{reload(){}},
    navigator:{mediaDevices:{}},
    document:{getElementById:id=>get(id),createElement:()=>makeEl(''),addEventListener:(t,f)=>{keydown=f}},
    window:{innerWidth:W,innerHeight:H,addEventListener(){}}
  });
  get('video').videoWidth=1280;get('video').videoHeight=720;
  vm.runInContext(source,ctx);
  vm.runInContext('resizeCanvas()',ctx);
  const ev=c=>vm.runInContext(c,ctx);
  const app={ev,get,layout,W,H,
    tick(ms=33){t+=ms;runTimers()},
    // Punto de pantalla -> landmark normalizado (inverso de videoToScreen)
    lm(p){const sc=Math.max(W/1280,H/720),dw=1280*sc,dh=720*sc,ox=(W-dw)/2,oy=(H-dh)/2;
      return{x:1-(p.x-ox)/dw,y:(p.y-oy)/dh,z:0}},
    frame(thumb,index){
      const lm=Array.from({length:21},()=>app.lm(thumb));
      lm[4]=app.lm(thumb);lm[8]=app.lm(index);
      ctx.__r={multiHandLandmarks:[lm]};
      ev('onHandResults(__r)');t+=33;runTimers();
    },
    noHand(){ctx.__r={multiHandLandmarks:[]};ev('onHandResults(__r)');t+=33;runTimers()},
    // Mantiene la mano quieta ms milisegundos
    hold(thumb,index,ms){for(let e=0;e<ms;e+=33)app.frame(thumb,index)},
    // Desliza los dedos de a->b en pasos de 33 ms
    slide(a,b,ms){const n=Math.max(1,Math.round(ms/33));
      for(let i=1;i<=n;i++){const k=i/n,m=(p,q)=>({x:p.x+(q.x-p.x)*k,y:p.y+(q.y-p.y)*k});
        app.frame(m(a.thumb,b.thumb),m(a.index,b.index))}},
    colX(c){const l=layout();return l.left+(c*80+40)*l.s},
    // y de pantalla para una coordenada interna del tablero
    y(v){const l=layout();return l.top+v*l.s},
    earth(c){return ev('state['+c+'].earth')},
    heaven(c){return ev('state['+c+'].heaven')},
    set(c,h,e){ev('state['+c+'].heaven='+h+';state['+c+'].earth='+e+';renderCol('+c+')')},
    press(key){keydown({key})},
    label(){return get('gestureLabel').textContent},
    value(){return get('valueDisplay').textContent}
  };
  return app;
}

const OFF={x:1270,y:10};                // fuera del tablero
const BEAM=116;
// Centro vertical de cada cuenta en coordenadas del tablero
const earthCy=(i,on)=>147+i*42+(on?0:64);
const heavenCy=on=>21+(on?64:0);
const below=cy=>cy+10,above=cy=>cy-10;  // mitad inferior / superior de la cuenta
const t=(name,fn)=>{console.log('\n'+name);try{fn()}catch(e){console.log('  ❌ EXCEPTION: '+e.message);failed++}};

// Mantiene y luego empuja: from/to son {thumb,index}
function push(a,from,to,ms=300){a.hold(from.thumb,from.index,600);a.slide(from,to,ms)}
const up=(p,d=70)=>({x:p.x,y:p.y-d}),down=(p,d=70)=>({x:p.x,y:p.y+d});
function thumbPush(a,c,i,dy=70){const p={x:a.colX(c),y:a.y(below(earthCy(i,false)))};push(a,{thumb:p,index:OFF},{thumb:up(p,dy),index:OFF})}
function indexPush(a,c,i,dy=70){const p={x:a.colX(c),y:a.y(above(earthCy(i,true)))};push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,dy)})}

console.log('Archivo: '+file);

t('1. Pulgar en la mitad inferior de una cuenta suma hasta ella',()=>{
  const a=makeApp();thumbPush(a,5,2);
  assert(a.earth(5)===3,'earth=3 (obtuvo '+a.earth(5)+')');
  assert(a.value().includes('300'),'valor en pantalla: '+a.value());
});

t('2. Indice en la mitad superior de una cuenta activa resta hasta ella',()=>{
  const a=makeApp();a.set(5,0,4);indexPush(a,5,1);
  assert(a.earth(5)===1,'earth=1 (obtuvo '+a.earth(5)+')');
});

t('3. Mitad equivocada no mueve la cuenta',()=>{
  const a=makeApp(),x=a.colX(5);
  let p={x,y:a.y(earthCy(0,false)-14)};
  push(a,{thumb:p,index:OFF},{thumb:up(p),index:OFF});
  assert(a.earth(5)===0,'pulgar en mitad superior: sin cambio (earth='+a.earth(5)+')');
  a.tick(700);a.set(5,0,2);
  p={x,y:a.y(earthCy(1,true)+14)};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p)});
  assert(a.earth(5)===2,'indice en mitad inferior: sin cambio (earth='+a.earth(5)+')');
});

t('4. Fuera del ancho central de la cuenta no mueve',()=>{
  const a=makeApp(),s=a.layout().s;
  const p={x:a.colX(5)+30*s,y:a.y(below(earthCy(0,false)))};
  push(a,{thumb:p,index:OFF},{thumb:up(p),index:OFF});
  assert(a.earth(5)===0,'borde lateral rechazado (earth='+a.earth(5)+')');
});

t('5. Zona vacia de la columna no acciona',()=>{
  const a=makeApp(),p={x:a.colX(5),y:a.y(50)};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,20)});
  assert(a.heaven(5)===0,'sin cambio (heaven='+a.heaven(5)+')');
});

t('6. Dedo que se desplaza y se detiene: cuenta la cuenta donde paro',()=>{
  const a=makeApp(),x=a.colX(5);
  const from={x,y:a.y(below(earthCy(3,false)))},to={x,y:a.y(below(earthCy(0,false)))};
  a.slide({thumb:from,index:OFF},{thumb:to,index:OFF},450);
  push(a,{thumb:to,index:OFF},{thumb:up(to),index:OFF});
  assert(a.earth(5)===1,'earth=1 (obtuvo '+a.earth(5)+')');
});

t('7. Indice cruzando la columna no cambia la cuenta superior',()=>{
  const a=makeApp(),x=a.colX(5);
  const from={x,y:a.y(10)},to={x,y:a.y(below(earthCy(3,false)))};
  a.slide({thumb:OFF,index:from},{thumb:OFF,index:to},800);
  assert(a.heaven(5)===0,'intacta (heaven='+a.heaven(5)+')');
});

t('8. Mano por encima del soroban no acciona',()=>{
  const a=makeApp(),p={x:a.colX(5),y:a.y(0)-120};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,60)});
  assert(a.heaven(5)===0,'sin cambio (heaven='+a.heaven(5)+')');
});

t('9. Cuenta superior: el indice baja desde arriba y sube desde abajo',()=>{
  const a=makeApp(),x=a.colX(5);
  let p={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,75)});
  assert(a.heaven(5)===1,'activada');
  a.tick(700);
  p={x,y:a.y(below(heavenCy(true)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,75)});
  assert(a.heaven(5)===1,'empujar abajo desde abajo no desactiva');
  a.tick(700);
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:up(p,90)});
  assert(a.heaven(5)===0,'empujar arriba desde abajo desactiva');
});

t('10. Reglas: pulgar no resta, indice no suma, pulgar no toca cuenta superior',()=>{
  const a=makeApp(),x=a.colX(5);a.set(5,0,2);
  let p={x,y:a.y(below(earthCy(1,true)))};
  push(a,{thumb:p,index:OFF},{thumb:down(p),index:OFF});
  assert(a.earth(5)===2,'pulgar no resta');
  a.tick(700);p={x,y:a.y(above(earthCy(2,false)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:up(p)});
  assert(a.earth(5)===2,'indice no suma');
  a.tick(700);p={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb:p,index:OFF},{thumb:down(p,75),index:OFF});
  assert(a.heaven(5)===0,'pulgar no cambia cuenta superior');
});

t('11. Pulgar en decenas e indice en unidades: se trabaja en decenas',()=>{
  const a=makeApp();a.set(9,0,2);
  const thumb={x:a.colX(8),y:a.y(below(earthCy(0,false)))},index={x:a.colX(9),y:a.y(above(earthCy(1,true)))};
  push(a,{thumb,index},{thumb:up(thumb),index:down(index)});
  assert(a.earth(8)===1,'decenas earth=1 (obtuvo '+a.earth(8)+')');
  assert(a.earth(9)===2,'unidades intactas (obtuvo '+a.earth(9)+')');
});

t('12. Indice en decenas y pulgar en unidades: se trabaja en decenas',()=>{
  const a=makeApp();a.set(8,0,2);
  const index={x:a.colX(8),y:a.y(above(earthCy(1,true)))},thumb={x:a.colX(9),y:a.y(below(earthCy(0,false)))};
  push(a,{thumb,index},{thumb:up(thumb),index:down(index)});
  assert(a.earth(8)===1,'decenas earth=1 (obtuvo '+a.earth(8)+')');
  assert(a.earth(9)===0,'unidades intactas (obtuvo '+a.earth(9)+')');
});

t('13. Dedo de la izquierda sin movimiento posible bloquea al otro',()=>{
  const a=makeApp();a.set(5,0,2);
  const thumb={x:a.colX(4),y:a.y(above(heavenCy(false)))},index={x:a.colX(5),y:a.y(above(earthCy(1,true)))};
  push(a,{thumb,index},{thumb,index:down(index)});
  assert(a.earth(5)===2,'la columna de la derecha queda intacta (obtuvo '+a.earth(5)+')');
});

t('14. Pinza: pulgar sube e indice baja cuenta superior a la vez',()=>{
  const a=makeApp(),x=a.colX(5);
  const thumb={x,y:a.y(below(earthCy(0,false)))},index={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb,index},{thumb:up(thumb,60),index:down(index,60)});
  assert(a.heaven(5)===1&&a.earth(5)===1,'suma 6 de un gesto (h='+a.heaven(5)+', e='+a.earth(5)+')');
  assert(a.value()==='Valor: 60000','valor: '+a.value());
});

t('15. Pinza con un dedo casi quieto: solo el movimiento largo',()=>{
  const a=makeApp(),x=a.colX(5);
  const thumb={x,y:a.y(below(earthCy(0,false)))},index={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb,index},{thumb:up(thumb,70),index:down(index,5)});
  assert(a.earth(5)===1&&a.heaven(5)===0,'solo el pulgar (h='+a.heaven(5)+', e='+a.earth(5)+')');
});

t('16. Dos dedos compitiendo: prima el movimiento mas largo',()=>{
  const a=makeApp(),x=a.colX(5);a.set(5,0,2);
  const index={x,y:a.y(above(earthCy(1,true)))},thumb={x,y:a.y(below(earthCy(3,false)))};
  push(a,{thumb,index},{thumb:up(thumb,20),index:down(index,80)});
  assert(a.earth(5)===1,'gana el indice (obtuvo '+a.earth(5)+')');
});

t('17. Dos dedos con movimientos parecidos: empate, no se mueve nada',()=>{
  const a=makeApp(),x=a.colX(5);a.set(5,0,2);
  const index={x,y:a.y(above(earthCy(1,true)))},thumb={x,y:a.y(below(earthCy(3,false)))};
  push(a,{thumb,index},{thumb:up(thumb,50),index:down(index,50)});
  assert(a.earth(5)===2,'sin cambio (obtuvo '+a.earth(5)+')');
});

t('18. Movimiento en zigzag no cuenta',()=>{
  const a=makeApp(),x=a.colX(5),p={x,y:a.y(below(earthCy(2,false)))};
  a.hold(p,OFF,600);
  // Sale de la zona de reposo de lado, va y vuelve dentro de la columna, y apenas sube
  let last=p;
  for(const q of[{x:x+24,y:p.y-6},{x:x-24,y:p.y-12},{x:x+24,y:p.y-18},{x:x-24,y:p.y-24},{x:x+24,y:p.y-34}]){
    a.slide({thumb:last,index:OFF},{thumb:q,index:OFF},120);last=q;
  }
  assert(a.earth(5)===0,'sin cambio (obtuvo '+a.earth(5)+')');
});

t('19. Gesto sobrevive si el dedo sale verticalmente de las cuentas',()=>{
  const a=makeApp(),x=a.colX(5),p={x,y:a.y(below(earthCy(1,false)))};
  push(a,{thumb:p,index:OFF},{thumb:{x,y:a.y(0)-60},index:OFF},400);
  assert(a.earth(5)===2,'earth=2 (obtuvo '+a.earth(5)+')');
});

t('20. Barrido: dedos juntos por la barra ponen en 0 cada columna recorrida',()=>{
  const a=makeApp();[3,4,5,6].forEach(c=>a.set(c,1,3));
  const y=a.y(BEAM),s=a.layout().s,at=x=>({thumb:{x:x-10*s,y},index:{x:x+10*s,y}});
  a.hold(at(a.colX(3)).thumb,at(a.colX(3)).index,300);
  a.slide(at(a.colX(3)),at(a.colX(5)),400);
  assert([3,4,5].every(c=>a.heaven(c)===0&&a.earth(c)===0),'columnas 3 a 5 en 0');
  assert(a.heaven(6)===1&&a.earth(6)===3,'la columna siguiente queda intacta');
  assert(a.value()==='Valor: 8000','valor: '+a.value());
});

t('21. Barrido: sin deslizar, separados o de paso no borra',()=>{
  let a=makeApp();a.set(3,0,3);
  const y=a.y(BEAM),s=a.layout().s,x=a.colX(3);
  a.hold({x:x-10*s,y},{x:x+10*s,y},900);
  assert(a.earth(3)===3,'dedos quietos sobre la barra no borran');
  a=makeApp();a.set(3,0,3);a.set(4,0,3);
  let f={thumb:{x:a.colX(3),y},index:{x:a.colX(5),y}};
  a.hold(f.thumb,f.index,300);
  a.slide(f,{thumb:{x:a.colX(4),y},index:{x:a.colX(6),y}},300);
  assert(a.earth(3)===3&&a.earth(4)===3,'dedos separados no borran');
  a=makeApp();a.set(3,0,3);a.set(4,0,3);
  f={thumb:{x:x-10*s,y},index:{x:x+10*s,y}};
  a.slide(f,{thumb:{x:f.thumb.x+90*s,y},index:{x:f.index.x+90*s,y}},130);
  assert(a.earth(3)===3&&a.earth(4)===3,'pasar rapido sin posarse no borra');
});

t('22. Perder la mano un instante no cancela el gesto',()=>{
  const a=makeApp(),x=a.colX(5),p={x,y:a.y(below(earthCy(2,false)))};
  a.hold(p,OFF,300);a.noHand();a.noHand();a.hold(p,OFF,300);
  a.slide({thumb:p,index:OFF},{thumb:up(p),index:OFF},300);
  assert(a.earth(5)===3,'earth=3 (obtuvo '+a.earth(5)+')');
});

t('23. Mensaje de exito visible y terminologia obligatoria',()=>{
  const a=makeApp(),x=a.colX(5),p={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,75)});
  a.frame(OFF,down(p,75));a.frame(OFF,down(p,75));
  assert(/cuenta superior/.test(a.label()),'label: '+a.label());
  assert(!/cielo|earth|heaven/i.test(a.label()),'sin terminos prohibidos');
  const ui=html.replace(/<script[\s\S]*?<\/script>/g,'')+[...source.matchAll(/setGestureLabel\([^\n]*/g)].join('');
  assert(!/'[^']*(cielo|bolas)[^']*'/i.test(ui),'ningun texto visible dice cielo/bolas');
});

t('24. Soroban completo dentro de pantallas grandes y ventanas bajas',()=>{
  for(const[W,H]of[[1920,1080],[2560,1440],[1280,720],[1000,420]]){
    const a=makeApp(W,H),l=a.layout();
    assert(l.boxLeft>=0,W+'x'+H+': borde izquierdo visible ('+l.boxLeft.toFixed(0)+')');
    assert(l.boxBottom<=H,W+'x'+H+': borde inferior visible ('+l.boxBottom.toFixed(0)+')');
    assert(a.y(0)>=60,W+'x'+H+': no choca con el HUD ('+a.y(0).toFixed(0)+')');
  }
});

t('25. Un solo acceso a camara: no carga camera_utils',()=>{
  assert(!/camera_utils/.test(html),'sin segundo getUserMedia oculto');
});

t('26. Diagnostico: tecla D no altera el soroban y muestra el motivo',()=>{
  const a=makeApp(),x=a.colX(5);a.set(5,0,2);
  a.press('d');
  assert(a.get('diag').style.display==='block','panel visible');
  assert(a.earth(5)===2,'estado intacto');
  const p={x,y:a.y(below(earthCy(2,false)))};
  push(a,{thumb:p,index:OFF},{thumb:down(p),index:OFF});
  assert(/dirección incorrecta/.test(a.get('diagText').textContent),'motivo: '+a.get('diagText').textContent.split('\n').pop());
  a.press('D');
  assert(a.get('diag').style.display==='none','panel oculto');
});

t('27. Los controles ajustan el umbral en vivo',()=>{
  const a=makeApp(),x=a.colX(5),p={x,y:a.y(below(earthCy(0,false)))};
  a.ev('TUNE.hold=200');
  a.hold(p,OFF,260);a.slide({thumb:p,index:OFF},{thumb:up(p),index:OFF},300);
  assert(a.earth(5)===1,'espera de 200 ms aplicada (earth='+a.earth(5)+')');
});

t('28. Suben juntas: cuentas inferiores suman y la superior resta',()=>{
  const a=makeApp(),x=a.colX(5);a.set(5,1,0);
  const thumb={x,y:a.y(below(earthCy(1,false)))},index={x,y:a.y(below(heavenCy(true)))};
  push(a,{thumb,index},{thumb:up(thumb,75),index:up(index,75)});
  assert(a.heaven(5)===0&&a.earth(5)===2,'de 5 a 2 en un gesto (h='+a.heaven(5)+', e='+a.earth(5)+')');
});

t('29. Bajan juntas: cuentas inferiores restan y la superior suma',()=>{
  const a=makeApp(),x=a.colX(5);a.set(5,0,3);
  const thumb={x,y:a.y(above(earthCy(1,true)))},index={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb,index},{thumb:down(thumb,75),index:down(index,75)});
  assert(a.heaven(5)===1&&a.earth(5)===1,'de 3 a 6 en un gesto (h='+a.heaven(5)+', e='+a.earth(5)+')');
});

t('30. El pulgar no baja cuentas inferiores sin el indice en la cuenta superior',()=>{
  let a=makeApp(),x=a.colX(5);a.set(5,0,3);
  const thumb={x,y:a.y(above(earthCy(1,true)))},index={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb,index:OFF},{thumb:down(thumb,75),index:OFF});
  assert(a.earth(5)===3,'pulgar solo: sin cambio (obtuvo '+a.earth(5)+')');
  a=makeApp();x=a.colX(5);a.set(5,0,3);
  push(a,{thumb,index},{thumb:down(thumb,75),index});
  assert(a.earth(5)===3&&a.heaven(5)===0,'indice quieto: sin cambio');
  a=makeApp();x=a.colX(5);a.set(5,0,3);
  push(a,{thumb,index},{thumb,index:down(index,75)});
  assert(a.heaven(5)===1&&a.earth(5)===3,'pulgar quieto: solo la cuenta superior');
});

t('31. Señalar cada control explica que significa',()=>{
  const a=makeApp(),rows=a.get('diagSliders').children,help=a.get('diagHelp'),seen=new Set();
  assert(rows.length===7,'siete controles');
  for(const r of rows){
    r.on.mouseenter();
    assert(help.textContent.length>30,r.children[0].textContent+': '+help.textContent.slice(0,40)+'...');
    seen.add(help.textContent);
    r.on.mouseleave();
    assert(/Señala una variable/.test(help.textContent),'vuelve al mensaje inicial');
  }
  assert(seen.size===7,'cada control tiene su explicacion');
});

t('32. Velocidad minima: el empuje lento no cuenta y el rapido si',()=>{
  const slow=(a,p)=>{a.hold(p,OFF,600);a.slide({thumb:p,index:OFF},{thumb:up(p,75),index:OFF},1800)};
  let a=makeApp(),p={x:a.colX(5),y:a.y(below(earthCy(0,false)))};
  a.press('d');slow(a,p);
  assert(a.earth(5)===0,'lento rechazado (earth='+a.earth(5)+')');
  assert(/muy lento/.test(a.get('diagText').textContent),'motivo: muy lento');
  a=makeApp();thumbPush(a,5,0);
  assert(a.earth(5)===1,'rapido aceptado (earth='+a.earth(5)+')');
  a=makeApp();a.ev('TUNE.speed=0');slow(a,p);
  assert(a.earth(5)===1,'en 0 no exige velocidad (earth='+a.earth(5)+')');
});

t('33. Pellizco inverso: ambos dedos se alejan de la barra a la vez',()=>{
  const x=m=>m.colX(5);
  let a=makeApp();a.set(5,1,3);
  let thumb={x:x(a),y:a.y(above(earthCy(1,true)))},index={x:x(a),y:a.y(below(heavenCy(true)))};
  push(a,{thumb,index},{thumb:down(thumb,75),index:up(index,75)});
  assert(a.heaven(5)===0&&a.earth(5)===1,'de 8 a 1 en un gesto (h='+a.heaven(5)+', e='+a.earth(5)+')');
  a=makeApp();a.set(5,1,3);
  push(a,{thumb,index},{thumb:down(thumb,75),index});
  assert(a.heaven(5)===1&&a.earth(5)===3,'indice quieto: sin cambio');
  a=makeApp();a.set(5,1,3);
  push(a,{thumb,index},{thumb,index:up(index,75)});
  assert(a.heaven(5)===0&&a.earth(5)===3,'pulgar quieto: solo la cuenta superior');
});

t('34. Mascota: reacciona a la mano sin alterar el soroban',()=>{
  const a=makeApp(),m=()=>a.get('mascot').className,x=a.colX(5),p={x,y:a.y(below(earthCy(2,false)))};
  a.hold(OFF,OFF,100);
  assert(m()==='awake','atenta con la mano fuera del tablero: '+m());
  a.hold(p,OFF,100);
  assert(m()==='focus','concentrada durante el gesto: '+m());
  a.slide({thumb:p,index:OFF},{thumb:up(p),index:OFF},0);
  a.hold(p,OFF,500);a.slide({thumb:p,index:OFF},{thumb:up(p),index:OFF},300);
  assert(/^happy/.test(m()),'feliz al aplicar: '+m());
  assert(a.earth(5)===3,'el gesto se aplica igual');
  a.noHand();a.tick(9000);a.noHand();
  assert(m()==='sleep','dormida sin mano: '+m());
});

t('35. Mascota: da una pista tras varios intentos fallidos',()=>{
  const a=makeApp(),m=()=>a.get('mascot').className,x=a.colX(5),p={x,y:a.y(below(earthCy(2,false)))};
  for(let i=0;i<3;i++){
    assert(!/hint/.test(m()),'sin pista antes del intento '+(i+1));
    a.hold(p,OFF,400);
    a.slide({thumb:p,index:OFF},{thumb:down(p,60),index:OFF},200);
    a.hold(OFF,OFF,70);
  }
  assert(/^hint talk/.test(m()),'pista: '+m());
  assert(a.get('mascotBubble').textContent==='Empuja desde la punta','frase: '+a.get('mascotBubble').textContent);
  assert(a.earth(5)===0,'ningun intento movio cuentas');
});

t('36. Mascota: pista si el dedo no encuentra la punta',()=>{
  const a=makeApp(),p={x:a.colX(5),y:a.y(50)};
  a.hold(OFF,p,3200);
  assert(/^hint/.test(a.get('mascot').className),'pista: '+a.get('mascot').className);
});

t('37. Tecla M oculta y muestra la mascota',()=>{
  const a=makeApp();a.set(5,0,2);
  a.press('m');
  assert(a.get('mascot').style.display==='none','oculta');
  a.press('M');
  assert(a.get('mascot').style.display==='','visible');
  assert(a.earth(5)===2,'estado intacto');
});

t('38. Puntos de los dedos encima de las cuentas opacas',()=>{
  const z=id=>+new RegExp('#'+id+'\\{[^}]*z-index:(\\d+)').exec(html)[1];
  assert(z('overlay')>z('sorobanWrap'),'overlay '+z('overlay')+' sobre soroban '+z('sorobanWrap'));
  assert(!/#sorobanWrap\{[^}]*opacity/.test(html),'sin opacidad general del soroban');
});

t('39. Se resaltan todas las cuentas que se moverian',()=>{
  const lit=(a,c)=>a.ev('JSON.stringify(cols['+c+'].earth.map(b=>b.classList.contains("touched")?1:0))');
  let a=makeApp(),x=a.colX(5),p={x,y:a.y(below(earthCy(2,false)))};
  a.set(5,0,1);a.hold(p,OFF,150);
  assert(lit(a,5)==='[0,1,1,0]','pulgar sube cuentas 2 y 3: '+lit(a,5));
  a=makeApp();a.set(5,0,4);p={x,y:a.y(above(earthCy(1,true)))};a.hold(OFF,p,150);
  assert(lit(a,5)==='[0,1,1,1]','indice baja cuentas 2 a 4: '+lit(a,5));
  a.hold(OFF,OFF,70);
  assert(lit(a,5)==='[0,0,0,0]','se apagan al soltar: '+lit(a,5));
  a=makeApp();p={x,y:a.y(above(heavenCy(false)))};a.hold(OFF,p,150);
  assert(a.ev('cols[5].heaven.classList.contains("touched")'),'cuenta superior resaltada');
});

t('40. Cuenta seleccionada vibra y gana brillo',()=>{
  assert(/\.bead\.touched\{[^}]*animation:beadbuzz/.test(html),'vibracion');
  assert(/\.bead\.touched\{[^}]*brightness/.test(html),'brillo');
});

t('41. Espera mas corta y valores guardados nuevos',()=>{
  const a=makeApp();
  assert(a.ev('TUNE.hold')===210,'espera 210 ms');
  assert(a.ev('TUNE_KEY')==='sorobanAR.tune.v2','clave nueva: no se reutilizan los 260 ms guardados');
  assert(a.ev('TUNE.travel')===34&&a.ev('TUNE.margin')===7&&a.ev('TUNE.straight')===.45,'el resto de los valores no cambia');
});

t('42. Catalogo: un digito, solo amigos, en el orden de los ciclos',()=>{
  const a=makeApp(),cat=JSON.parse(a.ev('JSON.stringify(buildCatalog())'));
  const keys=cat.map(g=>g.key);
  assert(keys[0]==='SF+1'&&keys.indexOf('SF-1')>keys.indexOf('SF+4'),'empieza por SF sumando y luego SF restando');
  const kindAt=k=>keys.findIndex(x=>x.startsWith(k));
  assert(kindAt('SF-')<kindAt('BF+')&&kindAt('BF+')<kindAt('BF-')&&kindAt('BF-')<kindAt('BFSF+')&&kindAt('BFSF+')<kindAt('BFSF-'),'orden SF+, SF-, BF+, BF-, BFSF+, BFSF-');
  let ok=true,msg='';
  for(const g of cat)for(const it of g.items){
    const kind=a.ev('exerciseKind(solve('+it.a+','+it.b+',"'+it.op+'"))');
    const digits=it.b<=9&&(it.op==='+'?it.a<=9:it.a-it.b<=9)&&(it.a<=9||g.kind!=='SF');
    if(kind!==g.kind||!digits||it.result!==(it.op==='+'?it.a+it.b:it.a-it.b)){ok=false;msg=g.key+' '+JSON.stringify(it)}
  }
  assert(ok,'cada ejercicio usa exactamente su formula '+msg);
  const f=k=>cat.find(g=>g.key===k).formula;
  assert(f('SF+4').main==='+4 = +5 −1'&&f('SF+4').friend==='amigo pequeño de 4: 1','SF+4: '+f('SF+4').main);
  assert(f('BF+7').main==='+7 = +10 −3','BF+7: '+f('BF+7').main);
  assert(f('BF-7').main==='−7 = −10 +3','BF-7: '+f('BF-7').main);
  assert(/−4 = −5 \+1/.test(f('BFSF+6').friend),'BFSF+6: '+f('BFSF+6').friend);
});

t('43. Al comenzar pide un ejercicio con su formula y el primer numero puesto',()=>{
  const a=makeApp();a.ev('startExercises()');
  const ex=JSON.parse(a.ev('JSON.stringify(EX.cur)'));
  assert(a.get('exercise').style.display==='block','tarjeta visible');
  assert(a.get('exOp').textContent===ex.a+' + '+ex.b,'operacion: '+a.get('exOp').textContent);
  assert(a.get('exFormula').textContent==='+1 = +5 −4','formula: '+a.get('exFormula').textContent);
  assert(a.ev('getValue()')===ex.a,'el soroban muestra el primer numero');
  assert(a.get('exProgress').textContent==='Ciclo 1 · 1 de 5','progreso: '+a.get('exProgress').textContent);
});

t('44. Hacer 4 + 1 con la formula: paso a paso y como combinacion',()=>{
  const a=makeApp(),x=a.colX(9);a.ev('startExercises()');
  // Paso a paso: +5 con el indice y luego -4 con el indice
  let p={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,75)});
  assert(a.get('exercise').className==='','tras +5 va bien (valor '+a.ev('getValue()')+')');
  a.tick(700);
  p={x,y:a.y(above(earthCy(0,true)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,75)});
  assert(a.ev('getValue()')===5,'resultado 5');
  assert(a.get('exercise').className==='done'&&a.get('exOp').textContent==='4 + 1 = 5','ejercicio completado');
  assert(a.ev('sfx.played.win')===1,'suena el premio');
  a.hold(OFF,OFF,1300);
  assert(a.ev('EX.idx')===1&&a.ev('getValue()')===4,'pasa al siguiente y pone el 4');
  // Combinacion: el indice baja la cuenta superior y el pulgar baja las inferiores a la vez
  const index={x,y:a.y(above(heavenCy(false)))},thumb={x,y:a.y(above(earthCy(0,true)))};
  push(a,{thumb,index},{thumb:down(thumb,75),index:down(index,75)});
  assert(a.ev('getValue()')===5&&a.get('exercise').className==='done','combinacion completa el ejercicio');
});

t('45. Movimiento fuera de la formula avisa y se puede corregir',()=>{
  const a=makeApp();a.ev('startExercises()');a.tick(2000);
  const p={x:a.colX(8),y:a.y(below(earthCy(0,false)))};
  push(a,{thumb:p,index:OFF},{thumb:up(p),index:OFF});
  assert(a.get('exercise').className==='error','error marcado (valor '+a.ev('getValue()')+')');
  assert(/Usa la fórmula/.test(a.get('mascotBubble').textContent),'mascota: '+a.get('mascotBubble').textContent);
  a.tick(700);
  const q={x:a.colX(8),y:a.y(above(earthCy(0,true)))};
  push(a,{thumb:OFF,index:q},{thumb:OFF,index:down(q,75)});
  assert(a.get('exercise').className==='','corregido (valor '+a.ev('getValue()')+')');
});

t('46. Teclas R y N',()=>{
  const a=makeApp(),x=a.colX(9);a.ev('startExercises()');
  const p={x,y:a.y(above(heavenCy(false)))};
  push(a,{thumb:OFF,index:p},{thumb:OFF,index:down(p,75)});
  assert(a.ev('getValue()')===9,'se movio la cuenta superior');
  a.press('r');
  assert(a.ev('getValue()')===4&&a.ev('EX.idx')===0,'R reinicia el ejercicio');
  a.press('n');
  assert(a.ev('EX.idx')===1,'N pasa al siguiente');
});

t('47. Cinco ejercicios por ciclo, fanfarria y siguiente formula',()=>{
  const a=makeApp();a.ev('startExercises()');
  const first=a.ev('EX.group.key');
  for(let i=0;i<5;i++){a.ev('setValue(EX.cur.result);checkExercise()');a.tick(1300)}
  assert(a.ev('sfx.played.win')===5,'cinco premios');
  assert(a.ev('sfx.played.fanfare')===1,'fanfarria de fin de ciclo');
  assert(a.get('bigMsg').textContent==='¡Ciclo completado!','mensaje: '+a.get('bigMsg').textContent);
  a.tick(2000);
  assert(a.ev('EX.cycle')===1&&a.ev('EX.group.key')==='SF+2'&&first==='SF+1','siguiente formula: '+a.ev('EX.group.key'));
  assert(a.ev('EX.idx')===0&&a.ev('getValue()')===a.ev('EX.cur.a'),'primer ejercicio del nuevo ciclo listo');
});

t('48. Un ciclo nunca repite el mismo ejercicio dos veces seguidas',()=>{
  const a=makeApp();
  const ok=a.ev('buildCatalog().every(g=>{for(let r=0;r<20;r++){const l=cycleItems(g);if(l.length!==5)return false;if(g.items.length>1&&l.some((x,i)=>i&&x===l[i-1]))return false}return true})');
  assert(ok,'5 ejercicios sin repetir seguidos en todas las formulas');
});

console.log('\nRESULTADOS: '+passed+' pasados, '+failed+' fallidos');
process.exit(failed?1:0);
