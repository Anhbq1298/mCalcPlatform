const ns='http://www.w3.org/2000/svg';
function canvas(host,width,height,label){
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 '+width+' '+height);
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label',label);
  svg.setAttribute('class','notch-cad');
  host.replaceChildren(svg);
  const add=(tag,attrs,text)=>{
    const item=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attrs))item.setAttribute(key,value);
    if(text)item.textContent=text;
    svg.append(item);
  };
  const line=(x1,y1,x2,y2,type='object')=>add('line',{x1,y1,x2,y2,class:type});
  const text=(x,y,value)=>add('text',{x,y},value);
  const path=(d,type='object')=>add('path',{d,class:type});
  const poly=points=>add('polygon',{points:points.map(p=>p.join(',')).join(' '),class:'shape'});
  const dim=(x,y,x2,y2,value)=>{
    line(x,y,x2,y2,'dimension');
    for(const [a,b] of [[x,y],[x2,y2]])line(a-4,b+4,a+4,b-4,'dimension');
    if(y===y2)text((x+x2)/2-8,y-6,value);
    else text(x+5,(y+y2)/2+4,value);
  };
  return {line,text,path,poly,dim,add};
}

export function notchTypical(host){
  const d=canvas(host,540,320,'Typical parametric notch detail');
  const x=125, y=78, top=112, lower=213, bottom=255;
  d.poly([[x,top],[235,top],[235,y],[470,y],[470,bottom],[266,bottom],[266,lower],[x,lower]]);
  d.line(235,y+12,470,y+12);d.line(266,bottom-12,470,bottom-12);
  d.path('M125 78H235 M125 255H266 M125 78V255','hidden');
  d.path('M125 112V39 M235 78V39 M125 213V286 M266 255V286 M125 78H66 M125 112H66 M125 213H66 M125 255H66','dimension');
  d.dim(125,47,235,47,'Lt');d.dim(125,279,266,279,'Lb');
  d.dim(76,78,76,112,'dt');d.dim(76,213,76,255,'db');
  d.text(275,160,'Supported beam web');
  d.text(273,306,'End of beam shown dashed');
}

export function plateTypical(host,detail){
  const d=canvas(host,565,340,'Typical parametric fin plate detail');
  const rows=detail?.rows??4, cols=detail?.columns??2;
  const x=110,y=55, width=205,height=208;
  const scaleY=height/(detail?.height??290),scaleX=width/(detail?.width??160);
  const vertical=(detail?.pitch??70)*scaleY,horizontal=(detail?.gauge??60)*scaleX;
  const firstX=x+(detail?.firstColumn??50)*scaleX, firstY=y+(detail?.end??40)*scaleY;
  const lastX=firstX+(cols-1)*horizontal,lastY=firstY+(rows-1)*vertical;
  d.add('rect',{x,y,width,height,class:'shape'});
  d.line(x,y-7,x,y+height+8,'weld');
  d.path('M110 55V29 M315 55V29 M110 55H53 M110 263H53','dimension');
  d.dim(x,34,x+width,34,'B');d.dim(65,y,65,y+height,'H');
  for(let i=0;i<cols;i++){
    const bx=firstX+i*horizontal;
    d.line(bx,y-5,bx,y+height+4,'centerline');
    for(let j=0;j<rows;j++){
      const by=firstY+j*vertical;
      if(!i)d.line(firstX-16,by,lastX+16,by,'centerline');
      d.add('circle',{cx:bx,cy:by,r:Math.min(6,vertical/3),class:'object'});
    }
  }
  d.path('M'+firstX+' '+firstY+'H91 M'+firstX+' '+(firstY+vertical)+'H91 M'+firstX+' '+lastY+'H91','dimension');
  d.dim(92,y,92,firstY,'et');d.dim(92,firstY,92,firstY+vertical,'pv');d.dim(92,lastY,92,y+height,'eb');
  d.dim(x,284,firstX,284,'x₁');
  if(cols===2)d.dim(firstX,284,lastX,284,'ph');
  d.dim(lastX,284,x+width,284,'ef');
  d.text(345,83,detail?rows+' × '+cols+' holes · Ø'+detail.hole:'nr × nc holes · Ød₀');
  d.text(345,132,'Weld section');
  d.line(369,145,369,222,'weld');
  d.poly([[370,178],[484,178],[484,191],[370,191]]);
  d.path('M370 166V178H382Z M370 191H382L370 203Z','object');
  d.line(380,170,415,153,'dimension');d.text(420,157,'w');
  d.dim(510,178,510,191,'t');
  d.text(115,326,'Use dimensions for the selected mark');
}

export function pairSection(host,pair,cell,c){
  const main=pair.support.values,b=pair.beam.values,n=pair.cope;
  const p=(main.b-main.tw)/2;
  const scale=Math.min(0.65,235/Math.max(main.h,b.h)),x=150,y=44;
  const d=canvas(host,555,330,'Selected beam pair section');
  const xy=(a,z)=>[x+a*scale,y+z*scale];
  const primary=[[-p-main.tw,0],[p,0],[p,main.tf],[0,main.tf],[0,main.h-main.tf],
    [p,main.h-main.tf],[p,main.h],[-p-main.tw,main.h],[-p-main.tw,main.h-main.tf],
    [-main.tw,main.h-main.tf],[-main.tw,main.tf],[-p-main.tw,main.tf]];
  const run=Math.max(350,c.gap+Math.max(n.Lt,n.Lb)+160), a=c.gap;
  d.poly(primary.map(v=>xy(...v)));
  if(n.dt+n.db>=b.h){d.text(166,305,'No web remains between the proposed copes');return;}
  const outline=[[a,n.dt],[a+n.Lt,n.dt],[a+n.Lt,0],[run,0],[run,b.h],
    [a+n.Lb,b.h],[a+n.Lb,b.h-n.db],[a,b.h-n.db]];
  d.poly(outline.map(v=>xy(...v)));
  d.line(...xy(a+n.Lt,b.tf),...xy(run,b.tf));
  d.line(...xy(a+n.Lb,b.h-b.tf),...xy(run,b.h-b.tf));
  d.line(...xy(-p-main.tw-12,0),...xy(run+10,0),'centerline');
  if(cell?.g){
    const g=cell.g, z=pair.plateTop;
    d.poly([[0,z],[g.bp,z],[g.bp,z+g.hp],[0,z+g.hp]].map(v=>xy(...v)));
    for(let i=0;i<g.nr;i++)for(let j=0;j<g.nc;j++){
      const [cx,cy]=xy(g.zp+j*c.gauge,z+c.end+i*c.pitch);
      d.add('circle',{cx,cy,r:c.hole*scale/2,class:'shape'});
    }
  }
  d.text(20,307,[['Top',n.Lt,n.dt],['Bottom',n.Lb,n.db]].filter(([,l])=>l)
    .map(([name,l,h])=>name+' '+l+' × '+Number(h.toFixed(2))+' mm').join('   ·   ')||'No cope');
}

export function pairPlan(host,pair,cell,c){
  const main=pair.support.values,b=pair.beam.values;
  const d=canvas(host,555,255,'Selected beam pair plan');
  const scale=Math.min(.6,155/b.b,130/main.b), x=178,y=118;
  const px=a=>x+a*scale, py=z=>y+z*scale;
  const reach=(main.b-main.tw)/2, left=-reach-main.tw;
  const start=c.gap+pair.cope.Lt, run=Math.max(370,start+160);
  d.poly([[px(left),31],[px(reach),31],[px(reach),207],[px(left),207]]);
  d.poly([[px(start),py(-b.b/2)],[px(run),py(-b.b/2)],[px(run),py(b.b/2)],[px(start),py(b.b/2)]]);
  for(const o of [-main.tw,0])d.line(px(o),33,px(o),205,'hidden');
  for(const o of [-b.tw/2,b.tw/2])d.line(px(c.gap),py(o),px(run),py(o),'hidden');
  d.line(px(c.gap),py(-b.tw/2),px(c.gap),py(b.tw/2),'hidden');
  if(cell?.g){
    const g=cell.g, upper=-b.tw/2-g.tp;
    d.path('M'+px(0)+' '+py(upper)+'H'+px(g.bp)+'V'+py(-b.tw/2)+'H'+px(0)+'Z','hidden');
    for(let i=0;i<g.nc;i++){
      const z=px(g.zp+i*c.gauge);
      d.line(z,py(upper-8),z,py(b.tw/2+8),'centerline');
    }
  }
  d.line(px(-main.tw/2),22,px(-main.tw/2),218,'centerline');
  d.line(px(left-12),y,px(run+12),y,'centerline');
  d.text(16,21,'Supporting beam');
  d.text(278,233,'Supported beam · top view');
}
