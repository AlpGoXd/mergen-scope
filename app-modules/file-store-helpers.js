(function(global){
  function traceSig(tr){
    if(!tr||!tr.data||!tr.data.length)return "";
    var a=tr.data[0],b=tr.data[tr.data.length-1];
    return [tr.kind||"raw",tr.operationType||"",tr.dn||"",tr.mode||"",tr.detector||"",tr.data.length,
      a.freq!==undefined?a.freq:"na",a.amp,b.freq!==undefined?b.freq:"na",b.amp].join("|");
  }

  function dedupeParsedTraces(traces){
    var seen={},out=[];
    (traces||[]).forEach(function(tr){
      if(!tr||!tr.data||!tr.data.length)return;
      var sig=traceSig(tr);
      if(seen[sig])return;
      seen[sig]=true;
      out.push(tr);
    });
    return out;
  }

  function fileSig(fileObj){
    if(!fileObj)return "";
    var meta=fileObj.meta||{};
    var metaSig=Object.keys(meta).sort().map(function(k){
      var v=meta[k];
      return k+":"+((typeof v==="object"&&v&&v.value!==undefined)?(v.value+" "+(v.unit||"")):String(v));
    }).join("||");
    var traceSigs=(fileObj.traces||[]).map(traceSig).join("###");
    return [fileObj.fileName||"",metaSig,traceSigs].join("@@");
  }

  function dedupeFiles(list){
    var seen={},out=[];
    (list||[]).forEach(function(f){
      if(!f)return;
      var cleanTraces=dedupeParsedTraces((f.traces||[]).slice());
      var cleanFile=Object.assign({},f,{traces:cleanTraces});
      var sig=fileSig(cleanFile);
      if(!sig||seen[sig])return;
      seen[sig]=true;
      out.push(cleanFile);
    });
    return out;
  }

  function mergeFileLists(base,added){
    return dedupeFiles((base||[]).concat(added||[]));
  }

  function normalizeTraceData(data){
    if(!Array.isArray(data)||!data.length)return [];
    var rows=data.filter(function(d){
      return d&&isFinite(d.freq)&&isFinite(d.amp);
    }).map(function(d){
      return {freq:Number(d.freq),amp:Number(d.amp)};
    });
    rows.sort(function(a,b){return a.freq-b.freq;});
    var out=[];
    rows.forEach(function(row){
      var last=out[out.length-1];
      if(last&&last.freq===row.freq){
        last.amp=row.amp;
      } else {
        out.push(row);
      }
    });
    return out;
  }

  global.FileStoreHelpers={
    traceSig:traceSig,
    dedupeParsedTraces:dedupeParsedTraces,
    fileSig:fileSig,
    dedupeFiles:dedupeFiles,
    mergeFileLists:mergeFileLists,
    normalizeTraceData:normalizeTraceData
  };
})(window);
