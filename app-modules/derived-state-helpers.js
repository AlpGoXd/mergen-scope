(function(global){
  var TM=global.TraceModel||{};
  var getTraceId=TM.getTraceId||function(tr){return tr?(tr.id||tr.name||null):null;};
  var getTraceSourceIds=TM.getTraceSourceIds||function(tr){return tr&&tr.sourceTraceIds?tr.sourceTraceIds.slice():[];};

  function reconcileDerivedTraceGraph(rawTr, derivedTraces, removedSeedIds){
    var validIds={};
    (rawTr||[]).forEach(function(tr){
      var id=getTraceId(tr);
      if(id)validIds[id]=true;
    });
    var removedIds={};
    (removedSeedIds||[]).forEach(function(id){
      if(id)removedIds[id]=true;
    });
    var kept=[],removed=[];
    (derivedTraces||[]).forEach(function(tr){
      var id=getTraceId(tr);
      if(id&&removedIds[id]){
        removed.push(tr);
        return;
      }
      var srcIds=getTraceSourceIds(tr);
      var ok=srcIds.length&&srcIds.every(function(srcId){return !!validIds[srcId]&&!removedIds[srcId];});
      if(ok){
        kept.push(tr);
        if(id)validIds[id]=true;
      } else {
        if(id)removedIds[id]=true;
        removed.push(tr);
      }
    });
    return {kept:kept,removed:removed,removedIds:removedIds};
  }

  global.DerivedStateHelpers={
    reconcileDerivedTraceGraph:reconcileDerivedTraceGraph
  };
})(window);
