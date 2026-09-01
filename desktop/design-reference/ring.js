(function(){
  var cs = document.querySelectorAll('canvas.fring');
  function draw(t){cs.forEach(function(c){var ctx=c.getContext('2d'),w=c.width,cx=w/2,base=w*.30,col=c.dataset.color||'#E8A33D';
    ctx.clearRect(0,0,w,w);
    ctx.beginPath();ctx.arc(cx,cx,base-6,0,Math.PI*2);ctx.strokeStyle='rgba(240,237,232,.08)';ctx.lineWidth=1;ctx.stroke();
    for(var i=0;i<64;i++){var a=i/64*Math.PI*2-Math.PI/2;var s=Math.sin(t*.0018+i*.55);
      var amp=(7+s*5)*(w/200*1.3);ctx.strokeStyle=col;ctx.globalAlpha=.28+Math.abs(s)*.62;
      ctx.lineWidth=2.4;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*base,cx+Math.sin(a)*base);
      ctx.lineTo(cx+Math.cos(a)*(base+amp),cx+Math.sin(a)*(base+amp));ctx.stroke();}
    ctx.globalAlpha=1;});
    if(!reduce)requestAnimationFrame(draw);}
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce){draw(40000);}else{requestAnimationFrame(draw);}
})();