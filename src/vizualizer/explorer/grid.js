'use strict';
const GridLayout = {
  insertTrack(rect,axis,index){
    const start=axis==='row'?'row':'col',span=axis==='row'?'rows':'cols';
    const next={...rect};
    if(index<=rect[start])next[start]++;
    else if(index<rect[start]+rect[span])next[span]++;
    return next;
  },
  deleteTrack(rect,axis,index){
    const start=axis==='row'?'row':'col',span=axis==='row'?'rows':'cols';
    const next={...rect};
    if(index<rect[start])next[start]--;
    else if(index<rect[start]+rect[span]){
      if(rect[span]===1)return null;
      next[span]--;
    }
    return next;
  },
  resizeTracks(sizes,indices,delta,minimum){
    const chosen=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<sizes.length);
    if(!chosen.length)return [...sizes];
    const applied=Math.max(delta,...chosen.map(i=>minimum-sizes[i]));
    return sizes.map((size,i)=>chosen.includes(i)?size+applied:size);
  },
  resizePixels(rect,edge,dx,dy,widths,heights){
    function deltaIndex(sizes,index,delta){
      const edges=[0];for(const size of sizes)edges.push(edges[edges.length-1]+size);
      const target=edges[index]+delta;
      let nearest=0;for(let i=1;i<edges.length;i++)if(Math.abs(edges[i]-target)<Math.abs(edges[nearest]-target))nearest=i;
      return nearest-index;
    }
    const x=edge.includes('w')?rect.col:rect.col+rect.cols;
    const y=edge.includes('n')?rect.row:rect.row+rect.rows;
    return this.resize(rect,edge,deltaIndex(widths,x,dx),deltaIndex(heights,y,dy),{cols:widths.length,rows:heights.length});
  },
  overlaps(a,b){return a.col<b.col+b.cols&&b.col<a.col+a.cols&&a.row<b.row+b.rows&&b.row<a.row+a.rows;},
  canPlace(rect,charts,bounds,ignore){
    if(![rect.col,rect.row,rect.cols,rect.rows].every(Number.isInteger)||rect.col<0||rect.row<0||rect.cols<1||rect.rows<1||rect.col+rect.cols>bounds.cols||rect.row+rect.rows>bounds.rows)return false;
    return charts.every(c=>c.id===ignore||!this.overlaps(rect,c));
  },
  resize(rect,edge,dx,dy,bounds){
    let left=rect.col,right=rect.col+rect.cols,top=rect.row,bottom=rect.row+rect.rows;
    if(edge.includes('w'))left=Math.max(0,Math.min(right-1,left+dx));
    if(edge.includes('e'))right=Math.min(bounds.cols,Math.max(left+1,right+dx));
    if(edge.includes('n'))top=Math.max(0,Math.min(bottom-1,top+dy));
    if(edge.includes('s'))bottom=Math.min(bounds.rows,Math.max(top+1,bottom+dy));
    return {col:left,row:top,cols:right-left,rows:bottom-top};
  }
};
if(typeof module!=='undefined')module.exports=GridLayout;
