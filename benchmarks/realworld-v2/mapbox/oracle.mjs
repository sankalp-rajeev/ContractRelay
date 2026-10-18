// An independent ray-casting oracle: no Turf, upstream implementation or model.
function inRing(point,ring) {
  const x=point.longitude,y=point.latitude;let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
export function mechanicalOracle(entry,input,output) {
  if(entry.id==='mapbox')return output.inside===(inRing(input.point,input.polygon[0])&&!input.polygon.slice(1).some(ring=>inRing(input.point,ring)))
    &&JSON.stringify(output.point)===JSON.stringify(input.point);
  throw new Error('UNKNOWN_ORACLE');
}
