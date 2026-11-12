(function(){
  var root=document.documentElement,btn=document.getElementById('theme');
  try{var t=localStorage.getItem('mode');if(t==='light'||t==='dark')root.setAttribute('data-mode',t);}catch(e){}
  function isDark(){return getComputedStyle(root).getPropertyValue('--mode').trim()==='dark';}
  btn.addEventListener('click',function(){
    var next=isDark()?'light':'dark';
    root.setAttribute('data-mode',next);
    try{localStorage.setItem('mode',next);}catch(e){}
    if(window.__redraw)window.__redraw();
  });

  /* ---- synthetic textured point cloud (SfM-like): RGB colour or uncertainty ---- */
  var cv=document.getElementById('tree'),ctx=cv.getContext('2d'),vb=document.getElementById('vmode'),cap=document.getElementById('cap');
  var seed=11;function rnd(){seed=(seed*16807)%2147483647;return seed/2147483647;}
  function gauss(){return (rnd()+rnd()+rnd()+rnd()-2)/2;}
  function cl(v,a,b){return v<a?a:(v>b?b:v);}
  var X=[],Y=[],Z=[],CI=[],UU=[],AO=[];
  // palette index layout: 0-7 bark, 8-39 leaf dark->light, 40-43 autumn leaf, 44-55 litter/soil, 56-61 grass
  var base=[],k;
  for(k=0;k<8;k++)base.push([22+(k%4)*3,28+(k%3)*4,15+k*3.2]);
  for(k=0;k<32;k++){var tt=k/31;base.push([135-55*tt,38+24*tt,15+37*tt]);}
  base.push([46,72,50],[40,68,46],[18,55,38],[28,60,42]);
  for(k=0;k<12;k++)base.push([26+(k%5)*8,22+(k%4)*7,14+(k%6)*3.5]);
  for(k=0;k<6;k++)base.push([82+k*7,40+k*3,20+k*4]);
  function add(x,y,z,c,u,a){X.push(x);Y.push(y);Z.push(z);CI.push(c);UU.push(u);AO.push(a);}
  var i,n;
  // trunk with flared base and ridged bark
  for(i=0;i<2000;i++){
    var h=Math.pow(rnd(),1.1)*0.62,a=rnd()*6.283,r=0.03*(1+0.9*Math.exp(-h*18))*(1-h*0.35),rg=1+0.14*Math.sin(a*9+h*3);
    add(r*rg*Math.cos(a),h,r*rg*Math.sin(a),Math.floor(rnd()*4)+(Math.sin(a*9)>0?4:0),0.1+0.25*rnd()+h*0.15,1);
  }
  // branches and foliage clusters
  var tips=[],B=9;
  for(i=0;i<B;i++){
    var az=i*2.399+rnd()*.4,len=.16+rnd()*.18,y0=.3+rnd()*.28,lift=.18+rnd()*.2,ca=Math.cos(az),sa=Math.sin(az);
    for(n=0;n<130;n++){var s=n/129,x=ca*len*s,z=sa*len*s,y=y0+lift*s-.05*s*s;add(x+gauss()*.005,y,z+gauss()*.005,Math.floor(rnd()*8),0.35+0.3*s+0.1*rnd(),1);}
    tips.push([ca*len,y0+lift-.05,sa*len,.13+rnd()*.07]);
  }
  tips.push([0,.82,0,.2],[.06,.7,.05,.18],[-.07,.68,-.05,.18],[0,.93,0,.1]);
  tips.forEach(function(c){
    var R=c[3],m=c[1]>.9?500:(c[3]>.17?900:650);
    for(n=0;n<m;n++){
      var dx=gauss()*R*1.1,dy=gauss()*R*.8,dz=gauss()*R*1.1,d=Math.min(1,Math.sqrt(dx*dx+dy*dy+dz*dz)/R*.9);
      var px=c[0]+dx,py=c[1]+dy,pz=c[2]+dz,rad=Math.sqrt(px*px+pz*pz),sun=cl(.5+.9*(py-.5)+.35*(rad-.15)+.25*gauss(),0,.999);
      var ci=rnd()<.04?40+Math.floor(rnd()*4):8+Math.floor(sun*32);
      add(px,py,pz,ci,cl(.15+.6*(1-d)+.2*rnd(),0,1),sun<.35?2:(sun<.55?1:0));
    }
  });
  // forest floor, understory
  for(i=0;i<2400;i++){
    var q=rnd()*6.283,rr=.8*Math.sqrt(rnd()),r2=rnd();
    add(Math.cos(q)*rr,.002*rnd(),Math.sin(q)*rr,r2<.55?44+Math.floor(rnd()*12):(r2<.8?56+Math.floor(rnd()*6):44+Math.floor(rnd()*3)),.25+.35*rnd(),r2<.2?1:0);
  }
  for(i=0;i<6;i++){
    var sa2=rnd()*6.283,sr=.4+rnd()*.35,sx=Math.cos(sa2)*sr,sz=Math.sin(sa2)*sr;
    for(n=0;n<140;n++)add(sx+gauss()*.07,.03+Math.abs(gauss())*.07,sz+gauss()*.07,8+Math.floor(cl(.45+.3*gauss(),0,.99)*32),.4+.3*rnd(),1);
  }
  var N=X.length,pal=[],upal=[],order=[],zv=new Float32Array(N),bk=new Uint8Array(N),sxA=new Float32Array(N),syA=new Float32Array(N),fA=new Float32Array(N);
  for(i=0;i<N;i++)order.push(i);
  function buildPal(){
    var dark=isDark(),m=dark?1.14:1,L,c;
    pal=[];
    for(c=0;c<base.length;c++)for(L=0;L<5;L++){var f=(.6+.15*L)*m;pal.push('hsl('+base[c][0]+','+base[c][1]+'%,'+Math.min(80,base[c][2]*f*1.15)+'%)');}
    upal=[];for(c=0;c<16;c++){var u=c/15;upal.push('hsl('+(220-u*180)+',75%,'+(dark?52:44)+'%)');}
  }
  buildPal();

  var W=0,H=0,dpr=1,theta=.6,drag=false,lx=0,uMode=false,still=matchMedia('(prefers-reduced-motion:reduce)').matches,pit=.2;
  function size(){var b=cv.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=b.width;H=b.height;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function draw(){
    if(!W)return;
    ctx.clearRect(0,0,W,H);
    var S=H*.8,cx=W*.55,cy=H*.5,c=Math.cos(theta),s=Math.sin(theta),cp=Math.cos(pit),sp=Math.sin(pit),j;
    for(j=0;j<N;j++){
      var x1=X[j]*c+Z[j]*s,z1=-X[j]*s+Z[j]*c,yy=Y[j]-.45;
      var yv=yy*cp-z1*sp,zz=yy*sp+z1*cp,f=1/(1-zz*.3);
      zv[j]=zz;sxA[j]=cx+x1*S*f;syA[j]=cy-yv*S*f;fA[j]=f;
    }
    var cnt=new Int32Array(65),bb;
    for(j=0;j<N;j++){bb=Math.floor(cl((zv[j]+.8)/1.6,0,.999)*64);bk[j]=bb;cnt[bb+1]++;}
    for(bb=0;bb<64;bb++)cnt[bb+1]+=cnt[bb];
    for(j=0;j<N;j++){order[cnt[bk[j]]++]=j;}
    var px=Math.max(1.1,H/430);
    for(j=0;j<N;j++){
      var p=order[j],d=px*(.9+fA[p]*.6);
      if(uMode)ctx.fillStyle=upal[Math.round(UU[p]*15)];
      else{var lv=Math.floor(cl((zv[p]+.55)/1.1,0,.999)*5)-AO[p];ctx.fillStyle=pal[CI[p]*5+(lv<0?0:lv)];}
      ctx.fillRect(sxA[p],syA[p],d,d);
    }
    var mark=getComputedStyle(root).getPropertyValue('--mark').trim();
    ctx.strokeStyle=mark;ctx.fillStyle=mark;ctx.lineWidth=1.5;ctx.font='600 12px "Bricolage Grotesque",system-ui,sans-serif';
    var bx=W*.1,top=cy-(.97-.45)*cp*S,bot=cy+.45*cp*S;
    ctx.beginPath();ctx.moveTo(bx,top);ctx.lineTo(bx,bot);ctx.moveTo(bx-5,top);ctx.lineTo(bx+5,top);ctx.moveTo(bx-5,bot);ctx.lineTo(bx+5,bot);ctx.stroke();
    ctx.fillText('Height 18 m',bx+8,(top+bot)/2);
    var yb=cy-(.072-.45)*cp*S;
    ctx.beginPath();ctx.moveTo(cx-S*.07,yb);ctx.lineTo(cx+S*.07,yb);ctx.stroke();
    ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(cx+S*.07,yb);ctx.lineTo(W-150,yb);ctx.stroke();ctx.setLineDash([]);
    ctx.fillText('DBH 42 cm',W-148,yb-6);
  }
  vb.addEventListener('click',function(){
    uMode=!uMode;
    vb.textContent=uMode?'Show colour':'Show uncertainty';
    cap.textContent=uMode?'Illustrative per-point uncertainty: blue is low, orange is high. Drag to rotate.':'Illustrative synthetic reconstruction. Drag to rotate.';
    draw();
  });
  var last=0;
  function tick(t){if(still||drag){last=t;}else if(t-last>32){theta+=(t-last)*.00022;draw();last=t;}requestAnimationFrame(tick);}
  cv.addEventListener('pointerdown',function(e){drag=true;lx=e.clientX;cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing';});
  cv.addEventListener('pointermove',function(e){if(!drag)return;theta+=(e.clientX-lx)*.01;lx=e.clientX;draw();});
  function up(){drag=false;cv.style.cursor='grab';}
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  new ResizeObserver(size).observe(cv);
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){buildPal();draw();});
  window.__redraw=function(){buildPal();draw();};
  requestAnimationFrame(tick);
})();

/* Burger menu */
(function(){
  var b=document.getElementById('burger'),m=document.getElementById('menu');
  if(!b||!m)return;
  function set(open){
    m.classList.toggle('open',open);
    b.setAttribute('aria-expanded',open?'true':'false');
    b.setAttribute('aria-label',open?'Close menu':'Open menu');
  }
  b.addEventListener('click',function(e){e.stopPropagation();set(!m.classList.contains('open'));});
  m.addEventListener('click',function(e){if(e.target.closest('a'))set(false);});      /* close after choosing a link */
  document.addEventListener('click',function(e){if(!m.contains(e.target))set(false);}); /* close on outside tap */
  document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false);});
  matchMedia('(min-width:901px)').addEventListener('change',function(e){if(e.matches)set(false);});
})();