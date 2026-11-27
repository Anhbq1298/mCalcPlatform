// Coordinates are millimetres. Both sheets use the solver's actual bolt grid.
export function typical(svg,c,g,b,result,plan,symbolic){
  const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,txt)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(txt)n.textContent=txt;svg.append(n);return n;};
  svg.replaceChildren();svg.setAttribute('xmlns',ns);svg.setAttribute('fill','none');svg.setAttribute('stroke','#172633');
  const line=(x1,y1,x2,y2,extra={})=>add('line',{x1,y1,x2,y2,...extra});
  const rect=(x,y,width,height,fill='white')=>add('rect',{x,y,width,height,fill});
  const txt=(x,y,label)=>add('text',{x,y,fill:'#172633',stroke:'none','font-family':'sans-serif','font-size':10,'text-anchor':'middle'},label);
  const dim=(x1,y1,x2,y2,s,v)=>{
    line(x1,y1,x2,y2);for(const [x,y] of [[x1,y1],[x2,y2]])line(x-3,y+3,x+3,y-3);
    const x=(x1+x2)/2,y=(y1+y2)/2;
    const label=txt(x,y-4,symbolic?s:s+' '+Number(v.toFixed(2)));
    if(x1===x2)label.setAttribute('transform','rotate(-90 '+x+' '+y+')');
  };
  const length=g.bp+95,top=b.tf+b.r+c.clearance;
  if(plan){
    const width=b.b/2, face=b.tw/2, outer=face+g.tp;
    svg.setAttribute('viewBox',[-35,-width-45,length+100,b.b+105].join(' '));
    rect(c.gap,-width,length-c.gap,b.b,'#f5f6f7');rect(c.gap,-face,length-c.gap,b.tw);
    rect(0,face,g.bp,g.tp,'#ddd');line(0,-width-25,0,width+25,{'stroke-width':3});
    for(const [y,sign] of [[face,-1],[outer,1]])add('polygon',{points:[[0,y],[g.sw,y],[0,y+sign*g.sw]].map(p=>p.join(',')).join(' '),fill:'#444'});
    for(const x of [...new Set(result.group.bolts.map(p=>p.x))]){
      rect(x-c.diameter/2,-face-5,c.diameter,outer+face+10);
      for(const [y,sign] of [[-face,-1],[outer,1]]){
        rect(x-.95*c.diameter,y+(sign<0?-3:0),1.9*c.diameter,3);
        rect(x-.75*c.diameter,y+(sign<0?-15:3),1.5*c.diameter,12);
      }
    }
    dim(0,-width-15,c.gap,-width-15,'g',c.gap);dim(g.bp+20,face,g.bp+20,outer,'tp',g.tp);
    txt(length/2,width+28,'Double fillet · '+(symbolic?'sw':g.sw+' mm leg')+' · hardware schematic');
  }else{
    svg.setAttribute('viewBox',[-85,-65,length+180,b.h+145].join(' '));
    rect(c.gap,0,length-c.gap,b.h);line(c.gap,b.tf,length,b.tf);line(c.gap,b.h-b.tf,length,b.h-b.tf);
    rect(0,top,g.bp,g.hp,'#eee');line(0,-12,0,b.h+10,{'stroke-width':3});
    for(const p of result.group.bolts){
      const y=top+g.hp-p.y;
      add('circle',{cx:p.x,cy:y,r:c.diameter/2,fill:'white'});line(p.x-15,y,p.x+15,y,{'stroke-dasharray':'5 2'});line(p.x,y-15,p.x,y+15,{'stroke-dasharray':'5 2'});
    }
    dim(-24,top,-24,top+g.hp,'hp',g.hp);dim(-49,0,-49,b.h,'h',b.h);
    dim(g.bp+18,top,g.bp+18,top+c.end,'e1',c.end);dim(g.bp+18,top+c.end,g.bp+18,top+c.end+c.pitch,'p1',c.pitch);
    dim(0,b.h+38,g.bp,b.h+38,'bp',g.bp);dim(0,-22,c.gap,-22,'g',c.gap);
    dim(c.gap,-22,g.zp,-22,'eb',c.beamEnd);const last=g.zp+(g.nc-1)*c.gauge;
    if(g.nc===2)dim(g.zp,-22,last,-22,'p2',c.gauge);dim(last,-22,g.bp,-22,'e2',c.plateEdge);
    txt(length/2,b.h+58,g.nr+' rows × '+g.nc+' columns · M'+c.diameter);
  }
}
