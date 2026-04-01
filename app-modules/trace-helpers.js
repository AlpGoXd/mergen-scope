(function(global){
  function clampYValue(v){
    if(!isFinite(v))return null;
    return Math.max(-300,Math.min(300,v));
  }

  function interpolatePointAtX(a,b,x){
    if(!a||!b||!isFinite(x)||!isFinite(a.freq)||!isFinite(b.freq)||!isFinite(a.amp)||!isFinite(b.amp))return null;
    if(a.freq===b.freq)return {freq:x,amp:b.amp};
    var t=(x-a.freq)/(b.freq-a.freq);
    if(!isFinite(t))return null;
    return {freq:x,amp:a.amp + (b.amp-a.amp)*t};
  }

  function getVisibleTraceData(tr,zoom){
    var data=tr&&Array.isArray(tr.data)?tr.data:[];
    if(!zoom||!isFinite(zoom.left)||!isFinite(zoom.right)||zoom.right<=zoom.left)return data;
    if(!data.length)return [];
    var left=zoom.left,right=zoom.right;
    var out=[];
    var i;
    for(i=0;i<data.length;i++){
      var p=data[i];
      if(!p||!isFinite(p.freq)||!isFinite(p.amp))continue;
      if(p.freq<left)continue;
      if(p.freq>right)break;
      out.push(p);
    }
    var leftIdx=-1,rightIdx=-1;
    for(i=0;i<data.length;i++){
      if(data[i]&&isFinite(data[i].freq)){
        if(data[i].freq<=left)leftIdx=i;
        if(rightIdx===-1&&data[i].freq>=right)rightIdx=i;
      }
    }
    if(out.length){
      if(out[0].freq>left&&leftIdx>=0&&leftIdx+1<data.length){
        var leftPt=interpolatePointAtX(data[leftIdx],data[leftIdx+1],left);
        if(leftPt)out.unshift(leftPt);
      } else if(out[0].freq===left){
        out[0]={freq:left,amp:out[0].amp};
      }
      var last=out[out.length-1];
      if(last.freq<right&&rightIdx>=0&&rightIdx-1>=0){
        var rightPt=interpolatePointAtX(data[rightIdx-1],data[rightIdx],right);
        if(rightPt)out.push(rightPt);
      } else if(last.freq===right){
        out[out.length-1]={freq:right,amp:last.amp};
      }
      return out;
    }
    if(leftIdx>=0&&leftIdx+1<data.length){
      var a=data[leftIdx],b=data[leftIdx+1];
      if(a&&b&&isFinite(a.freq)&&isFinite(b.freq)&&a.freq<=left&&b.freq>=right){
        var pLeft=interpolatePointAtX(a,b,left);
        var pRight=interpolatePointAtX(a,b,right);
        return [pLeft,pRight].filter(Boolean);
      }
    }
    return [];
  }

  function findHorizontalCrossings(tr, yVal, zoom){
    var data=getVisibleTraceData(tr,zoom).filter(function(p){return p&&isFinite(p.freq)&&isFinite(p.amp);});
    if(data.length<2||!isFinite(yVal))return [];
    var out=[];
    function pushFreq(freq){
      if(!isFinite(freq))return;
      for(var i=0;i<out.length;i++){ if(Math.abs(out[i]-freq)<=1e-9)return; }
      out.push(freq);
    }
    for(var i=0;i<data.length;i++){
      if(data[i].amp===yVal)pushFreq(data[i].freq);
      if(i===0)continue;
      var a=data[i-1],b=data[i];
      var da=a.amp-yVal, db=b.amp-yVal;
      if(da===0||db===0)continue;
      if(da*db<0){
        var freq=(isFinite(a.freq)&&isFinite(b.freq)&&b.amp!==a.amp)?(a.freq + (b.freq-a.freq)*((yVal-a.amp)/(b.amp-a.amp))):null;
        pushFreq(freq);
      }
    }
    return out;
  }

  function getSafeYRangeFromData(allTr,vis,zoom){
    var mn=Infinity,mx=-Infinity,found=false;
    allTr.forEach(function(tr){
      if(!vis[tr.name])return;
      var d=getVisibleTraceData(tr,zoom);
      d.forEach(function(p){
        if(!p||!isFinite(p.amp))return;
        var a=clampYValue(p.amp);
        if(a===null)return;
        found=true;
        if(a<mn)mn=a;
        if(a>mx)mx=a;
      });
    });
    if(!found||!isFinite(mn)||!isFinite(mx))return null;
    if(mx-mn<0.1){
      var center=(mn+mx)/2;
      mn=center-2.5;
      mx=center+2.5;
    }
    var pad=Math.max((mx-mn)*0.08,0.5);
    mn=clampYValue(mn-pad);
    mx=clampYValue(mx+pad);
    if(mn===null||mx===null||!isFinite(mn)||!isFinite(mx)||mx<=mn)return null;
    return {min:mn,max:mx};
  }

  function sanitizeYDomain(z){
    if(!z||!isFinite(z.min)||!isFinite(z.max))return null;
    var mn=clampYValue(z.min),mx=clampYValue(z.max);
    if(mn===null||mx===null||!isFinite(mn)||!isFinite(mx)||mx<=mn)return null;
    var span=mx-mn;
    if(span<0.001||span>2000)return null;
    return {min:mn,max:mx};
  }

  function makeNiceTicks(domain,count){
    if(!domain||!isFinite(domain.min)||!isFinite(domain.max)||domain.max<=domain.min)return undefined;
    count=Math.max(2,count||9);
    var span=domain.max-domain.min;
    var rough=span/(count-1);
    if(!isFinite(rough)||rough<=0)return undefined;
    var mag=Math.pow(10,Math.floor(Math.log10(Math.abs(rough))));
    var norm=rough/mag;
    var niceNorm=norm<=1?1:norm<=2?2:norm<=2.5?2.5:norm<=5?5:10;
    var step=niceNorm*mag;
    if(!isFinite(step)||step<=0)return undefined;
    var start=Math.floor(domain.min/step)*step;
    var end=Math.ceil(domain.max/step)*step;
    var ticks=[];
    var decimals=Math.max(0,Math.ceil(-Math.log10(step))+1);
    for(var v=start; v<=end+step*0.5; v+=step){
      var rounded=Number(v.toFixed(Math.min(6,decimals)));
      if(rounded>=domain.min-step*0.25&&rounded<=domain.max+step*0.25)ticks.push(rounded);
      if(ticks.length>count+4)break;
    }
    if(ticks.length<2)ticks=[Number(domain.min.toFixed(3)),Number(domain.max.toFixed(3))];
    return ticks;
  }

  function makeYTicksFromDomain(domain){
    if(!domain||!isFinite(domain.min)||!isFinite(domain.max)||domain.max<=domain.min)return undefined;
    var ticks=makeNiceTicks(domain,9);
    var span=domain.max-domain.min;
    var eps=Math.max(Math.abs(span)*1e-9,1e-9);
    if(!ticks||!ticks.length){
      return [Number(domain.min.toFixed(6)),Number(domain.max.toFixed(6))];
    }
    var clipped=[];
    ticks.forEach(function(tick){
      if(!isFinite(tick))return;
      if(tick<domain.min-eps||tick>domain.max+eps)return;
      var clamped=Math.max(domain.min,Math.min(domain.max,tick));
      var rounded=Number(clamped.toFixed(6));
      if(!clipped.length||Math.abs(clipped[clipped.length-1]-rounded)>eps)clipped.push(rounded);
    });
    if(clipped.length<2){
      return [Number(domain.min.toFixed(6)),Number(domain.max.toFixed(6))];
    }
    return clipped;
  }

  function getPrimaryTickStep(ticks, fallbackSpan){
    if(ticks&&ticks.length>1){
      var steps=[];
      for(var i=1;i<ticks.length;i++){
        var step=Math.abs(ticks[i]-ticks[i-1]);
        if(isFinite(step)&&step>0)steps.push(step);
      }
      if(steps.length){
        steps.sort(function(a,b){return a-b;});
        return steps[Math.floor(steps.length/2)];
      }
    }
    if(isFinite(fallbackSpan)&&fallbackSpan>0)return fallbackSpan/8;
    return null;
  }

  function computeYWheelZoom(base,deltaY,frac,autoRange){
    if(!base||!isFinite(base.min)||!isFinite(base.max))return autoRange||null;
    var span=base.max-base.min;
    if(!isFinite(span)||span<=0)return autoRange||null;
    var factor=deltaY<0?0.85:(1/0.85);
    var nextSpan=Math.max(0.001,Math.min(2000,span*factor));
    if(!isFinite(frac))frac=0.5;
    frac=Math.max(0,Math.min(1,frac));
    var center=base.min+(span*frac);
    if(!isFinite(center))center=(base.min+base.max)/2;
    var newMin=center-frac*nextSpan;
    var newMax=newMin+nextSpan;
    return sanitizeYDomain({min:newMin,max:newMax})||autoRange||null;
  }

  global.TraceHelpers={
    clampYValue:clampYValue,
    interpolatePointAtX:interpolatePointAtX,
    getVisibleTraceData:getVisibleTraceData,
    findHorizontalCrossings:findHorizontalCrossings,
    getSafeYRangeFromData:getSafeYRangeFromData,
    sanitizeYDomain:sanitizeYDomain,
    makeNiceTicks:makeNiceTicks,
    makeYTicksFromDomain:makeYTicksFromDomain,
    getPrimaryTickStep:getPrimaryTickStep,
    computeYWheelZoom:computeYWheelZoom
  };
})(window);
