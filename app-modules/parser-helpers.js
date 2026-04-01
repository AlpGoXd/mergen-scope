(function(global){
  var TM=global.TraceModel||{};
  var FSH=global.FileStoreHelpers||{};
  var makeTrace=TM.makeTrace||function(prefix,fileName,traceName){return {name:prefix+traceName,dn:prefix+traceName,fileName:fileName,data:[]};};
  var dedupeParsedTraces=FSH.dedupeParsedTraces||function(traces){return traces||[];};
  var normalizeTraceData=FSH.normalizeTraceData||function(data){return data||[];};
  var _fc=0;

  function resetParserFileCounter(){
    _fc=0;
  }

  function syncParserFileCounter(files){
    var nextCount=Array.isArray(files)?files.length:0;
    if(nextCount>_fc)_fc=nextCount;
  }

  function nearestPoint(tr,freq,left,right){
    if(!tr||!tr.data||!tr.data.length||!isFinite(freq))return null;
    var data=tr.data;
    var lo=0,hi=data.length-1,mid;
    if(left!=null||right!=null){
      while(lo<data.length&&left!=null&&data[lo].freq<left)lo++;
      while(hi>=0&&right!=null&&data[hi].freq>right)hi--;
      if(lo>hi)return null;
    }
    while(lo<hi){
      mid=(lo+hi)>>1;
      if(data[mid].freq<freq)lo=mid+1; else hi=mid;
    }
    var idx=lo;
    var best=data[idx],bestDist=Math.abs(data[idx].freq-freq);
    if(idx>0){
      var p=data[idx-1],d=Math.abs(p.freq-freq);
      if(d<bestDist){best=p;bestDist=d;idx=idx-1;}
    }
    if(idx+1<data.length){
      var n=data[idx+1],d2=Math.abs(n.freq-freq);
      if(d2<bestDist){best=n;bestDist=d2;idx=idx+1;}
    }
    if(data.length>1){
      var prev=idx>0?data[idx-1]:null;
      var next=idx+1<data.length?data[idx+1]:null;
      var localStep=Math.min(
        prev?Math.abs(best.freq-prev.freq):Infinity,
        next?Math.abs(next.freq-best.freq):Infinity
      );
      if(!isFinite(localStep)||localStep<=0){
        var span=Math.abs(data[data.length-1].freq-data[0].freq);
        localStep=data.length>1?span/(data.length-1):Infinity;
      }
      var maxDist=isFinite(localStep)&&localStep>0?localStep*2.5:Infinity;
      if(bestDist>maxDist)return null;
    }
    return best;
  }

  function parseRSDat(text,fileName){
    _fc++;
    var prefix=fileName.replace(/\.[^.]+$/,'')+" ";
    var lines=text.split(/\r?\n/),meta={},traces=[],cur=null,inData=false,hadTraceDecl=false;
    for(var i=0;i<lines.length;i++){
      var trimmed=lines[i].trim();
      if(!trimmed){if(inData)inData=false;continue;}
      var parts=trimmed.split(';').map(function(s){return s.trim();});
      if(inData&&cur){
        var nums=parts.filter(function(s){return s!=='';}).map(Number);
        if(nums.length>=2&&nums.every(function(n){return !isNaN(n);})){cur.data.push({freq:nums[0],amp:nums[1]});continue;}
        if(nums.length===1&&!isNaN(nums[0])){cur.data.push({amp:nums[0]});continue;}
        inData=false;
      }
      if(/^Trace$/i.test(parts[0])&&parts[1]&&/^\d+$/.test(parts[1])){
        hadTraceDecl=true;
        cur=makeTrace(prefix,fileName,"Tr"+parts[1],_fc);
        traces.push(cur);
        continue;
      }
      if(/^Trace Mode$/i.test(parts[0])&&cur){cur.mode=parts[1]||'';continue;}
      if(/^Detector$/i.test(parts[0])&&cur){cur.detector=parts[1]||'';continue;}
      if(/^Values$/i.test(parts[0])){
        inData=true;
        if(!cur){
          cur=makeTrace(prefix,fileName,"Tr"+(traces.length+1),_fc);
          traces.push(cur);
        }
        continue;
      }
      if(parts.length>=2&&/^[a-zA-Z]/.test(parts[0])){
        var nv=parseFloat(parts[1]);
        meta[parts[0]]=!isNaN(nv)&&parts[1]!==''?{value:nv,unit:parts[2]||''}:parts[1];
      }
    }
    if(traces.length===0&&!hadTraceDecl){
      cur=makeTrace(prefix,fileName,'Tr1',_fc);
      for(var j=0;j<lines.length;j++){
        var p=lines[j].trim().split(';').filter(function(s){return s.trim()!=='';}).map(Number);
        if(p.length>=2&&p.every(function(n){return !isNaN(n);}))cur.data.push({freq:p[0],amp:p[1]});
        else if(p.length===1&&!isNaN(p[0])&&cur.data.length>0)cur.data.push({amp:p[0]});
      }
      if(cur.data.length>0)traces.push(cur);
    }
    traces=dedupeParsedTraces(traces.filter(function(t){return t.data.length>0;}));
    var sf=meta["Start"]&&meta["Start"].value||0;
    var ef=meta["Stop"]&&meta["Stop"].value||0;
    traces.forEach(function(tr){
      if(tr.data.length>0&&tr.data[0].freq===undefined){
        var n=tr.data.length;
        tr.data.forEach(function(d,idx){d.freq=sf+(idx/Math.max(n-1,1))*(ef-sf);});
      }
      tr.data=normalizeTraceData(tr.data);
      tr.units={
        x:(meta["StartXAxis"]&&meta["StartXAxis"].unit)||(meta["StopXAxis"]&&meta["StopXAxis"].unit)||(meta["Center Freq"]&&meta["Center Freq"].unit)||"Hz",
        y:(meta["Ref Level"]&&meta["Ref Level"].unit)||"dBm"
      };
    });
    traces=dedupeParsedTraces(traces.filter(function(t){return t.data&&t.data.length>0;}));
    return {meta:meta,traces:traces};
  }

  global.ParserHelpers={
    resetParserFileCounter:resetParserFileCounter,
    syncParserFileCounter:syncParserFileCounter,
    nearestPoint:nearestPoint,
    parseRSDat:parseRSDat
  };
})(window);
