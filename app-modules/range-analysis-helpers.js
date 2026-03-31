(function(global){
  var TH=global.TraceHelpers||{};
  var TM=global.TraceModel||{};
  var normalizeUnitName=TM.normalizeUnitName||function(unit){return String(unit||"").trim().toLowerCase().replace(/\s+/g,"");};
  var findHorizontalCrossings=TH.findHorizontalCrossings||function(){return [];};

  function finiteData(data){
    return (data||[]).filter(function(point){
      return point&&isFinite(point.freq)&&isFinite(point.amp);
    });
  }

  function sliceTraceToRange(traceOrData, rangeHz){
    var data=Array.isArray(traceOrData)?traceOrData:(traceOrData&&traceOrData.data)||[];
    data=finiteData(data);
    if(!rangeHz||!isFinite(rangeHz.left)||!isFinite(rangeHz.right)||rangeHz.right<rangeHz.left)return data;
    return data.filter(function(point){return point.freq>=rangeHz.left&&point.freq<=rangeHz.right;});
  }

  function medianOf(values){
    if(!values||!values.length)return null;
    var sorted=values.slice().sort(function(a,b){return a-b;});
    var mid=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  }

  function computeRangeStats(data){
    var points=finiteData(data);
    if(!points.length)return null;
    var amps=points.map(function(point){return point.amp;});
    var sum=amps.reduce(function(acc,value){return acc+value;},0);
    var minPoint=points.reduce(function(best,point){return !best||point.amp<best.amp?point:best;},null);
    var maxPoint=points.reduce(function(best,point){return !best||point.amp>best.amp?point:best;},null);
    return {
      count:points.length,
      min:minPoint,
      max:maxPoint,
      average:sum/points.length,
      median:medianOf(amps),
      spanHz:points.length>1?(points[points.length-1].freq-points[0].freq):0
    };
  }

  function buildPeakSpurTable(data, options){
    var points=finiteData(data);
    if(!points.length)return [];
    options=options||{};
    var limit=Math.max(1,Math.min(50,Math.round(Number(options.limit)||10)));
    var minSpacingHz=Math.max(0,Number(options.minSpacingHz)||0);
    var minAmp=(options.minAmp===null||options.minAmp===undefined||options.minAmp==="")?null:Number(options.minAmp);
    var peaks=[];
    if(points.length<3){
      peaks=points.slice();
    } else {
      for(var i=1;i<points.length-1;i++){
        var prev=points[i-1],cur=points[i],next=points[i+1];
        if(cur.amp>=prev.amp&&cur.amp>=next.amp&&(cur.amp>prev.amp||cur.amp>next.amp))peaks.push(cur);
      }
    }
    if(!peaks.length){
      peaks=[points.reduce(function(best,point){return !best||point.amp>best.amp?point:best;},null)];
    }
    peaks=peaks.filter(function(point){
      return !isFinite(minAmp)||minAmp===null?true:point.amp>=minAmp;
    }).sort(function(a,b){return b.amp-a.amp;});
    var out=[];
    peaks.forEach(function(point){
      if(out.length>=limit)return;
      if(minSpacingHz>0&&out.some(function(row){return Math.abs(row.freq-point.freq)<minSpacingHz;}))return;
      out.push({rank:out.length+1,freq:point.freq,amp:point.amp});
    });
    return out;
  }

  function buildMarkerDeltaTable(markers, traceName, rangeHz, xUnit, yUnit){
    var list=(markers||[]).filter(function(marker){
      if(!marker||marker.trace!==traceName||!isFinite(marker.freq)||!isFinite(marker.amp))return false;
      if(rangeHz&&isFinite(rangeHz.left)&&marker.freq<rangeHz.left)return false;
      if(rangeHz&&isFinite(rangeHz.right)&&marker.freq>rangeHz.right)return false;
      return true;
    }).sort(function(a,b){return a.freq-b.freq;});
    var rows=[];
    for(var i=0;i<list.length;i++){
      for(var j=i+1;j<list.length;j++){
        var a=list[i],b=list[j];
        var dx=b.freq-a.freq;
        var dy=b.amp-a.amp;
        rows.push({
          from:a.label||("M"+(i+1)),
          to:b.label||("M"+(j+1)),
          freqA:a.freq,
          freqB:b.freq,
          ampA:a.amp,
          ampB:b.amp,
          deltaX:dx,
          deltaY:dy,
          slope:(isFinite(dx)&&dx!==0)?(dy/dx):null,
          slopeUnit:(yUnit||"dB")+"/"+(xUnit||"Hz")
        });
      }
    }
    return rows;
  }

  function interpolateFreqAtLevel(a,b,level){
    if(!a||!b||!isFinite(a.freq)||!isFinite(b.freq)||!isFinite(a.amp)||!isFinite(b.amp)||!isFinite(level))return null;
    if(a.amp===b.amp)return null;
    var t=(level-a.amp)/(b.amp-a.amp);
    if(!isFinite(t))return null;
    return a.freq+(b.freq-a.freq)*t;
  }

  function nearestIndexByFreq(data,freq){
    if(!data||!data.length||!isFinite(freq))return -1;
    var bestIdx=0;
    var bestDelta=Math.abs(data[0].freq-freq);
    for(var i=1;i<data.length;i++){
      var delta=Math.abs(data[i].freq-freq);
      if(delta<bestDelta){
        bestDelta=delta;
        bestIdx=i;
      }
    }
    return bestIdx;
  }

  function computeBandwidthAtDrop(data, refFreq, refAmp, dropDb){
    var points=finiteData(data);
    if(points.length<2||!isFinite(refFreq)||!isFinite(refAmp)||!isFinite(dropDb))return null;
    var level=refAmp-Math.abs(dropDb);
    var refIdx=nearestIndexByFreq(points,refFreq);
    if(refIdx<0)return null;
    var left=null,right=null,leftMode="none",rightMode="none";
    for(var i=refIdx;i>0;i--){
      var a=points[i-1],b=points[i];
      if(a.amp===level){left=a.freq;leftMode="sample";break;}
      if(b.amp===level){left=b.freq;leftMode="sample";break;}
      if((a.amp-level)*(b.amp-level)<0){
        left=interpolateFreqAtLevel(a,b,level);
        leftMode="linear";
        break;
      }
    }
    for(var j=refIdx;j<points.length-1;j++){
      var c=points[j],d=points[j+1];
      if(c.amp===level){right=c.freq;rightMode="sample";break;}
      if(d.amp===level){right=d.freq;rightMode="sample";break;}
      if((c.amp-level)*(d.amp-level)<0){
        right=interpolateFreqAtLevel(c,d,level);
        rightMode="linear";
        break;
      }
    }
    if(!isFinite(left)||!isFinite(right)||right<=left)return null;
    return {
      refFreq:refFreq,
      refAmp:refAmp,
      level:level,
      left:left,
      right:right,
      bandwidth:right-left,
      mode:(leftMode===rightMode)?leftMode:(leftMode+"/"+rightMode)
    };
  }

  function findThresholdCrossingsForLevel(data, level){
    var points=finiteData(data);
    var trace={name:"analysis-threshold",data:points};
    return (findHorizontalCrossings(trace,level,null)||[]).map(function(freq){
      return {freq:freq,mode:"linear"};
    });
  }

  function computeRippleFlatness(data){
    var stats=computeRangeStats(data);
    if(!stats)return null;
    return {
      min:stats.min,
      max:stats.max,
      ripple:stats.max.amp-stats.min.amp,
      spanHz:stats.spanHz
    };
  }

  function logPowerToMilliwatts(amp, unit){
    var norm=normalizeUnitName(unit);
    if(norm==="dbm")return Math.pow(10,amp/10);
    if(norm==="dbw")return Math.pow(10,(amp+30)/10);
    return null;
  }

  function integrateLinearArea(data, linearValueFn){
    var points=finiteData(data);
    if(points.length<2)return null;
    var total=0;
    var segs=[];
    for(var i=0;i<points.length-1;i++){
      var a=points[i],b=points[i+1];
      var pa=linearValueFn(a.amp),pb=linearValueFn(b.amp);
      if(!isFinite(pa)||!isFinite(pb))continue;
      var width=b.freq-a.freq;
      if(!isFinite(width)||width<=0)continue;
      var area=((pa+pb)/2)*width;
      if(!isFinite(area)||area<0)continue;
      total+=area;
      segs.push({left:a.freq,right:b.freq,area:area});
    }
    return total>0?{total:total,segs:segs}:null;
  }

  function interpolateFreqForAreaTarget(segs,target){
    if(!segs||!segs.length||!isFinite(target))return null;
    var acc=0;
    for(var i=0;i<segs.length;i++){
      var seg=segs[i];
      if(acc+seg.area>=target){
        var frac=seg.area>0?(target-acc)/seg.area:0;
        frac=Math.max(0,Math.min(1,frac));
        return seg.left+(seg.right-seg.left)*frac;
      }
      acc+=seg.area;
    }
    return segs[segs.length-1].right;
  }

  function computeOccupiedBandwidth(data, percent, yUnit){
    var norm=normalizeUnitName(yUnit);
    if(!(norm==="dbm"||norm==="dbw")){
      return {supported:false,reason:"Occupied bandwidth currently requires a power-like trace in dBm or dBW."};
    }
    percent=Number(percent);
    if(!isFinite(percent)||percent<=0||percent>=100)percent=99;
    var integrated=integrateLinearArea(data,function(amp){return logPowerToMilliwatts(amp,yUnit);});
    if(!integrated)return {supported:false,reason:"Not enough visible samples to estimate occupied bandwidth."};
    var total=integrated.total;
    var lowerTarget=total*((1-(percent/100))/2);
    var upperTarget=total*((1+(percent/100))/2);
    var lower=interpolateFreqForAreaTarget(integrated.segs,lowerTarget);
    var upper=interpolateFreqForAreaTarget(integrated.segs,upperTarget);
    if(!isFinite(lower)||!isFinite(upper)||upper<=lower){
      return {supported:false,reason:"Could not resolve occupied bandwidth edges from the visible trace samples."};
    }
    return {
      supported:true,
      percent:percent,
      lower:lower,
      upper:upper,
      bandwidth:upper-lower,
      note:"Estimated from sampled visible-trace power after converting dBm/dBW samples to linear power."
    };
  }

  function spectralDensityToMilliwattsPerHz(amp, unit){
    var norm=normalizeUnitName(unit);
    if(norm==="dbm/hz"||norm==="dbmperhz")return Math.pow(10,amp/10);
    if(norm==="dbw/hz"||norm==="dbwperhz")return Math.pow(10,(amp+30)/10);
    return null;
  }

  function computeChannelPower(data, yUnit){
    var norm=normalizeUnitName(yUnit);
    if(!(norm==="dbm/hz"||norm==="dbmperhz"||norm==="dbw/hz"||norm==="dbwperhz")){
      return {supported:false,reason:"Channel power is deferred unless the trace unit is explicit spectral power density such as dBm/Hz or dBW/Hz."};
    }
    var integrated=integrateLinearArea(data,function(amp){return spectralDensityToMilliwattsPerHz(amp,yUnit);});
    if(!integrated)return {supported:false,reason:"Not enough visible samples to integrate channel power."};
    var mW=integrated.total;
    if(!isFinite(mW)||mW<=0)return {supported:false,reason:"Integrated channel power is not finite in the visible range."};
    return {
      supported:true,
      powerDbm:10*Math.log10(mW),
      powerDbw:10*Math.log10(mW/1000),
      note:"Integrated from spectral-density samples over the visible range using trapezoidal integration."
    };
  }

  global.RangeAnalysisHelpers={
    sliceTraceToRange:sliceTraceToRange,
    computeRangeStats:computeRangeStats,
    buildPeakSpurTable:buildPeakSpurTable,
    buildMarkerDeltaTable:buildMarkerDeltaTable,
    computeBandwidthAtDrop:computeBandwidthAtDrop,
    findThresholdCrossingsForLevel:findThresholdCrossingsForLevel,
    computeRippleFlatness:computeRippleFlatness,
    computeOccupiedBandwidth:computeOccupiedBandwidth,
    computeChannelPower:computeChannelPower
  };
})(window);
