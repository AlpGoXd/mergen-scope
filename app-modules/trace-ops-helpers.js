(function(global){
  var TH=global.TraceHelpers||{};
  var interpolatePointAtX=TH.interpolatePointAtX;

  function ampsFromExactMatch(data, freq){
    for(var i=0;i<data.length;i++){
      var p=data[i];
      if(p&&isFinite(p.freq)&&p.freq===freq&&isFinite(p.amp))return p.amp;
      if(p&&isFinite(p.freq)&&p.freq>freq)break;
    }
    return null;
  }

  function cubicInterpolateSegment(p0,p1,p2,p3,x){
    if(!p1||!p2||!isFinite(x)||!isFinite(p1.freq)||!isFinite(p2.freq)||p1.freq===p2.freq)return null;
    var t=(x-p1.freq)/(p2.freq-p1.freq);
    if(!isFinite(t))return null;
    var y0=(p0&&isFinite(p0.amp))?p0.amp:p1.amp;
    var y1=p1.amp;
    var y2=p2.amp;
    var y3=(p3&&isFinite(p3.amp))?p3.amp:p2.amp;
    return 0.5*((2*y1)+(-y0+y2)*t+(2*y0-5*y1+4*y2-y3)*t*t+(-y0+3*y1-3*y2+y3)*t*t*t);
  }

  function interpolateAmpAtFreq(data, freq, method){
    if(!Array.isArray(data)||!data.length||!isFinite(freq))return null;
    var mode=method||"linear";
    var prev=null;
    for(var i=0;i<data.length;i++){
      var p=data[i];
      if(!p||!isFinite(p.freq)||!isFinite(p.amp))continue;
      if(p.freq===freq)return p.amp;
      if(p.freq>freq){
        if(!prev)return null;
        if(mode==="exact")return null;
        if(mode==="nearest")return Math.abs(freq-prev.freq)<=Math.abs(p.freq-freq)?prev.amp:p.amp;
        if(mode==="previous")return prev.amp;
        if(mode==="next")return p.amp;
        if(mode==="cubic"){
          var p0=null,p3=null;
          for(var j=i-2;j>=0;j--){ if(data[j]&&isFinite(data[j].freq)&&isFinite(data[j].amp)){ p0=data[j]; break; } }
          for(var k=i+1;k<data.length;k++){ if(data[k]&&isFinite(data[k].freq)&&isFinite(data[k].amp)){ p3=data[k]; break; } }
          var cubicAmp=cubicInterpolateSegment(p0,prev,p,p3,freq);
          if(isFinite(cubicAmp))return cubicAmp;
        }
        var ip=interpolatePointAtX?interpolatePointAtX(prev,p,freq):null;
        return ip&&isFinite(ip.amp)?ip.amp:null;
      }
      prev=p;
    }
    return null;
  }

  function getOverlapWindow(aData,bData){
    if(!Array.isArray(aData)||!Array.isArray(bData)||!aData.length||!bData.length)return null;
    var left=Math.max(aData[0].freq,bData[0].freq);
    var right=Math.min(aData[aData.length-1].freq,bData[bData.length-1].freq);
    return (isFinite(left)&&isFinite(right)&&right>=left)?{left:left,right:right}:null;
  }

  function getDataInWindow(data, window){
    if(!window)return [];
    return (data||[]).filter(function(p){return p&&isFinite(p.freq)&&p.freq>=window.left&&p.freq<=window.right&&isFinite(p.amp);});
  }

  function overlapArraysMatchExactly(aData,bData){
    if(aData.length!==bData.length||!aData.length)return false;
    for(var i=0;i<aData.length;i++){
      if(aData[i].freq!==bData[i].freq)return false;
    }
    return true;
  }

  function normalizeOddWindowSize(raw, maxLen, minVal){
    var win=Math.round(parseFloat(raw));
    if(!isFinite(win))win=minVal||3;
    if(win<(minVal||3))win=minVal||3;
    if(win%2===0)win=win+1;
    if(isFinite(maxLen)&&maxLen>0&&win>maxLen){
      win=maxLen;
      if(win%2===0)win=Math.max((minVal||1),win-1);
    }
    return Math.max((minVal||1),win);
  }

  function medianOfNumbers(vals){
    if(!vals||!vals.length)return null;
    var sorted=vals.slice().sort(function(a,b){return a-b;});
    var mid=Math.floor(sorted.length/2);
    return (sorted.length%2)?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  }

  function solveLinearSystem(mat, vec){
    var n=mat.length;
    var a=mat.map(function(row,i){return row.slice().concat([vec[i]]);});
    for(var col=0;col<n;col++){
      var pivot=col;
      for(var row=col+1;row<n;row++){
        if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
      }
      if(Math.abs(a[pivot][col])<1e-12)return null;
      if(pivot!==col){
        var tmp=a[col];a[col]=a[pivot];a[pivot]=tmp;
      }
      var div=a[col][col];
      for(var j=col;j<=n;j++)a[col][j]/=div;
      for(var r=0;r<n;r++){
        if(r===col)continue;
        var factor=a[r][col];
        if(!factor)continue;
        for(var c=col;c<=n;c++)a[r][c]-=factor*a[col][c];
      }
    }
    return a.map(function(row){return row[n];});
  }

  function savitzkyGolayValue(data, idx, window, order){
    var half=Math.floor(window/2);
    var lo=Math.max(0,idx-half),hi=Math.min(data.length-1,idx+half);
    var xs=[],ys=[];
    for(var i=lo;i<=hi;i++){
      if(!data[i]||!isFinite(data[i].amp))continue;
      xs.push(i-idx);
      ys.push(data[i].amp);
    }
    var deg=Math.min(order, xs.length-1);
    if(xs.length===0)return null;
    if(deg<=0)return ys.reduce(function(a,b){return a+b;},0)/ys.length;
    var size=deg+1, mat=[], vec=[];
    for(var r=0;r<size;r++){
      mat[r]=[];
      for(var c=0;c<size;c++){
        var sum=0;
        for(var k=0;k<xs.length;k++)sum+=Math.pow(xs[k],r+c);
        mat[r][c]=sum;
      }
      var rhs=0;
      for(var m=0;m<xs.length;m++)rhs+=ys[m]*Math.pow(xs[m],r);
      vec[r]=rhs;
    }
    var coeff=solveLinearSystem(mat,vec);
    return coeff&&isFinite(coeff[0])?coeff[0]:ys.reduce(function(a,b){return a+b;},0)/ys.length;
  }

  function smoothTraceData(data, method, window, polyOrder){
    var src=Array.isArray(data)?data:[];
    if(!src.length)return {data:[],window:window,polyOrder:polyOrder};
    var mode=method||"moving-average";
    if(mode==="none"){
      return {data:src.map(function(p){return {freq:p.freq,amp:p.amp};}),window:1,polyOrder:null};
    }
    var win=normalizeOddWindowSize(window, src.length, 3);
    if(win>src.length&&src.length>0)win=normalizeOddWindowSize(src.length, src.length, 1);
    if(win<3){
      return {data:src.map(function(p){return {freq:p.freq,amp:p.amp};}),window:win,polyOrder:polyOrder};
    }
    var half=Math.floor(win/2);
    if(mode==="moving-average"){
      return {data:src.map(function(p,idx){
        var lo=Math.max(0,idx-half),hi=Math.min(src.length-1,idx+half),sum=0,count=0;
        for(var i=lo;i<=hi;i++){ if(isFinite(src[i].amp)){sum+=src[i].amp;count++;} }
        return {freq:p.freq,amp:count?sum/count:p.amp};
      }),window:win,polyOrder:null};
    }
    if(mode==="median-filter"){
      return {data:src.map(function(p,idx){
        var lo=Math.max(0,idx-half),hi=Math.min(src.length-1,idx+half),vals=[];
        for(var i=lo;i<=hi;i++){ if(isFinite(src[i].amp))vals.push(src[i].amp); }
        var med=medianOfNumbers(vals);
        return {freq:p.freq,amp:isFinite(med)?med:p.amp};
      }),window:win,polyOrder:null};
    }
    if(mode==="savitzky-golay"){
      var ord=Math.round(parseFloat(polyOrder));
      if(!isFinite(ord))ord=2;
      ord=Math.max(1,Math.min(ord,win-1));
      return {data:src.map(function(p,idx){
        var y=savitzkyGolayValue(src,idx,win,ord);
        return {freq:p.freq,amp:isFinite(y)?y:p.amp};
      }),window:win,polyOrder:ord};
    }
    return {data:src.map(function(p){return {freq:p.freq,amp:p.amp};}),window:win,polyOrder:polyOrder};
  }

  function applyBinaryTraceMathOp(aAmp, bAmp, op){
    if(!isFinite(aAmp)||!isFinite(bAmp))return null;
    if(op==="add")return aAmp+bAmp;
    if(op==="subtract")return aAmp-bAmp;
    if(op==="multiply")return aAmp*bAmp;
    if(op==="divide"){
      if(bAmp===0)return null;
      return aAmp/bAmp;
    }
    return null;
  }

  function computeBinaryTraceMathData(aData, bData, requestedInterpolation, operation){
    var window=getOverlapWindow(aData,bData);
    if(!window)return {error:"No overlap between the selected traces."};
    var aOverlap=getDataInWindow(aData,window);
    var bOverlap=getDataInWindow(bData,window);
    if(!aOverlap.length||!bOverlap.length)return {error:"No overlap between the selected traces."};
    var effectiveInterpolation=requestedInterpolation;
    var exactAligned=overlapArraysMatchExactly(aOverlap,bOverlap);
    if(requestedInterpolation==="auto")effectiveInterpolation=exactAligned?"exact":"linear";
    if(requestedInterpolation==="exact"&&!exactAligned){
      return {error:"Exact only requires matching X samples over the overlap range."};
    }
    var dropped=0;
    var data=aOverlap.map(function(p){
      var bAmp=(effectiveInterpolation==="exact")?ampsFromExactMatch(bOverlap,p.freq):interpolateAmpAtFreq(bData,p.freq,effectiveInterpolation);
      var amp=applyBinaryTraceMathOp(p.amp,bAmp,operation);
      if(!isFinite(amp)){ dropped++; return null; }
      return {freq:p.freq,amp:amp};
    }).filter(Boolean);
    if(!data.length)return {error:operation==="divide"?"A / B produced no valid points over the overlap range.":"No valid points were produced over the overlap range."};
    return {data:data,appliedInterpolation:effectiveInterpolation,droppedPoints:dropped};
  }

  global.TraceOpsHelpers={
    ampsFromExactMatch:ampsFromExactMatch,
    cubicInterpolateSegment:cubicInterpolateSegment,
    interpolateAmpAtFreq:interpolateAmpAtFreq,
    getOverlapWindow:getOverlapWindow,
    getDataInWindow:getDataInWindow,
    overlapArraysMatchExactly:overlapArraysMatchExactly,
    normalizeOddWindowSize:normalizeOddWindowSize,
    medianOfNumbers:medianOfNumbers,
    solveLinearSystem:solveLinearSystem,
    savitzkyGolayValue:savitzkyGolayValue,
    smoothTraceData:smoothTraceData,
    applyBinaryTraceMathOp:applyBinaryTraceMathOp,
    computeBinaryTraceMathData:computeBinaryTraceMathData
  };
})(window);
