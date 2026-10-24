/** Pack unrotated dog silhouettes by their bounds; no scaling or rotation. */
export function packRectangles(rectangles, area, gap = 14) {
  const orders = [
    (a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height),
    (a,b)=>b.height-a.height,
    (a,b)=>b.width*b.height-a.width*a.height,
    (a,b)=>b.width-a.width,
  ];
  let best = new Map();
  for (const compare of orders) {
    let free=[{x:area.x,y:area.y,width:area.width,height:area.height}];
    const packed=new Map();
    for (const rect of [...rectangles].sort(compare)) {
      const width=rect.width+gap,height=rect.height+gap;
      const fit=free.filter(r=>r.width>=width&&r.height>=height).sort((a,b)=>
        Math.min(a.width-width,a.height-height)-Math.min(b.width-width,b.height-height)
        || a.width*a.height-b.width*b.height)[0];
      if(!fit) continue;
      const used={x:fit.x,y:fit.y,width,height};
      packed.set(rect.id,{x:used.x+gap/2,y:used.y+gap/2});
      const next=[];
      for(const r of free) {
        if(used.x>=r.x+r.width||used.x+width<=r.x||used.y>=r.y+r.height||used.y+height<=r.y) {next.push(r);continue;}
        if(used.x>r.x) next.push({...r,width:used.x-r.x});
        if(used.x+width<r.x+r.width) next.push({...r,x:used.x+width,width:r.x+r.width-used.x-width});
        if(used.y>r.y) next.push({...r,height:used.y-r.y});
        if(used.y+height<r.y+r.height) next.push({...r,y:used.y+height,height:r.y+r.height-used.y-height});
      }
      free=next.filter((r,i)=>!next.some((other,j)=>i!==j&&r.x>=other.x&&r.y>=other.y&&r.x+r.width<=other.x+other.width&&r.y+r.height<=other.y+other.height&&(j<i||r.x!==other.x||r.y!==other.y||r.width!==other.width||r.height!==other.height)));
    }
    if(packed.size>best.size) best=packed;
    if(best.size===rectangles.length) break;
  }
  return best;
}
