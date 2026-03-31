(function(global){
  var IP3_ROLE_KEYS=["f1","f2","im3l","im3u"];
  var IP3_ROLE_LABELS={f1:"F1",f2:"F2",im3l:"IM3L",im3u:"IM3U"};

  function isIP3Label(label){
    return ["F1","F2","IM3L","IM3U"].indexOf(label)!==-1;
  }

  function cloneMarkerWithoutIP3Label(marker){
    if(!marker)return marker;
    if(!isIP3Label(marker.label))return marker;
    var next=Object.assign({},marker);
    delete next.label;
    return next;
  }

  function getIP3PointsFromMarkers(markers){
    var pts={f1:null,f2:null,im3l:null,im3u:null};
    Object.keys(IP3_ROLE_LABELS).forEach(function(key){
      var label=IP3_ROLE_LABELS[key];
      var marker=(markers||[]).find(function(item){return item&&item.label===label;});
      if(marker)pts[key]={freq:marker.freq,amp:marker.amp,trace:marker.trace,label:marker.label};
    });
    return pts;
  }

  function getVisibleDataForTrace(tr, zoom){
    if(!tr||!tr.data)return [];
    if(!zoom)return tr.data;
    return tr.data.filter(function(point){return point.freq>=zoom.left&&point.freq<=zoom.right;});
  }

  function buildExtrema(tr, zoom, kind){
    var data=getVisibleDataForTrace(tr, zoom).filter(function(point){return isFinite(point.freq)&&isFinite(point.amp);});
    if(!data.length)return [];
    var out=[];
    for(var i=1;i<data.length-1;i++){
      var prev=data[i-1],cur=data[i],next=data[i+1];
      if(kind==="max"){
        if(cur.amp>=prev.amp&&cur.amp>=next.amp&&(cur.amp>prev.amp||cur.amp>next.amp))out.push(cur);
      } else {
        if(cur.amp<=prev.amp&&cur.amp<=next.amp&&(cur.amp<prev.amp||cur.amp<next.amp))out.push(cur);
      }
    }
    if(!out.length){
      out.push(data.reduce(function(best,point){
        if(!best)return point;
        return kind==="max"?(point.amp>best.amp?point:best):(point.amp<best.amp?point:best);
      },null));
    }
    return out;
  }

  function isLocalExtremum(data,idx,kind){
    if(!data||idx<=0||idx>=data.length-1)return false;
    var prev=data[idx-1],cur=data[idx],next=data[idx+1];
    if(!prev||!cur||!next)return false;
    if(kind==="max")return cur.amp>=prev.amp&&cur.amp>=next.amp&&(cur.amp>prev.amp||cur.amp>next.amp);
    return cur.amp<=prev.amp&&cur.amp<=next.amp&&(cur.amp<prev.amp||cur.amp<next.amp);
  }

  function nearestIndexByFreq(data,freq){
    if(!data||!data.length)return -1;
    var bestIdx=0,bestDf=Math.abs(data[0].freq-freq);
    for(var i=1;i<data.length;i++){
      var df=Math.abs(data[i].freq-freq);
      if(df<bestDf){bestDf=df;bestIdx=i;}
    }
    return bestIdx;
  }

  function findHighestPeakExcluding(data,excludeFreqs,exHz){
    var best=null;
    (data||[]).forEach(function(point){
      if(!isFinite(point&&point.freq)||!isFinite(point&&point.amp))return;
      if((excludeFreqs||[]).some(function(freq){return Math.abs(point.freq-freq)<exHz;}))return;
      if(!best||point.amp>best.amp)best=point;
    });
    return best;
  }

  function findPeakNearFreq(data,targetHz,windowHz){
    var best=null,near=null,nearDf=Infinity;
    (data||[]).forEach(function(point){
      if(!isFinite(point&&point.freq)||!isFinite(point&&point.amp))return;
      var df=Math.abs(point.freq-targetHz);
      if(df<nearDf){nearDf=df;near=point;}
      if(df<=windowHz&&(!best||point.amp>best.amp))best=point;
    });
    return best||near;
  }

  global.MarkerHelpers={
    IP3_ROLE_KEYS:IP3_ROLE_KEYS,
    IP3_ROLE_LABELS:IP3_ROLE_LABELS,
    isIP3Label:isIP3Label,
    cloneMarkerWithoutIP3Label:cloneMarkerWithoutIP3Label,
    getIP3PointsFromMarkers:getIP3PointsFromMarkers,
    getVisibleDataForTrace:getVisibleDataForTrace,
    buildExtrema:buildExtrema,
    isLocalExtremum:isLocalExtremum,
    nearestIndexByFreq:nearestIndexByFreq,
    findHighestPeakExcluding:findHighestPeakExcluding,
    findPeakNearFreq:findPeakNearFreq
  };
})(window);
