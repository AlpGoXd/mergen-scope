(function(global){
  var TH=global.TraceHelpers||{};
  var getSafeYRangeFromData=TH.getSafeYRangeFromData||function(){return null;};

  function clampPaneCount(count){
    var n=Number(count);
    if(!isFinite(n))n=1;
    n=Math.round(n);
    if(n<1)n=1;
    if(n>4)n=4;
    return n;
  }

  function normalizePaneRenderMode(renderMode){
    var mode=String(renderMode||"cartesian").trim().toLowerCase().replace(/\s+/g,"-").replace(/_/g,"-");
    if(mode==="smithinverted")mode="smith-inverted";
    if(mode!=="smith"&&mode!=="smith-inverted"&&mode!=="cartesian")mode="cartesian";
    return mode;
  }

  function clonePane(pane,index){
    if(!pane||!pane.id)return null;
    return {
      id:pane.id,
      title:pane.title||("Pane "+(index+1)),
      renderMode:normalizePaneRenderMode(pane.renderMode)
    };
  }

  function buildPanes(mode,prevPanes){
    var count=clampPaneCount(mode);
    var panes=[];
    var prevById={};
    (prevPanes||[]).forEach(function(pane){
      if(pane&&pane.id)prevById[pane.id]=pane;
    });
    for(var i=1;i<=count;i++){
      var id="pane-"+i;
      var prev=prevById[id]||null;
      panes.push({
        id:id,
        title:(prev&&prev.title)||("Pane "+i),
        renderMode:normalizePaneRenderMode(prev&&prev.renderMode)
      });
    }
    return panes;
  }

  function normalizePanes(panes,mode){
    var next=(Array.isArray(panes)?panes:[]).map(clonePane).filter(Boolean);
    if(!next.length){
      next=buildPanes(mode||1);
    } else {
      var count=clampPaneCount(mode||next.length);
      var built=buildPanes(count,next);
      var byId={};
      next.forEach(function(pane){byId[pane.id]=pane;});
      next=built.map(function(pane){
        var prev=byId[pane.id]||null;
        return {
          id:pane.id,
          title:(prev&&prev.title)||pane.title,
          renderMode:normalizePaneRenderMode(prev&&prev.renderMode||pane.renderMode)
        };
      });
    }
    return next;
  }

  function normalizeTracePaneMap(allTr, prevMap, panes){
    var next=Object.assign({},prevMap||{});
    var paneIds=(panes||[]).map(function(pane){return pane.id;});
    var traceNames=(allTr||[]).map(function(tr){return tr.name;});
    traceNames.forEach(function(name){
      var paneId=next[name];
      next[name]=paneIds.indexOf(paneId)!==-1?paneId:"pane-1";
    });
    Object.keys(next).forEach(function(name){
      if(traceNames.indexOf(name)===-1)delete next[name];
    });
    return next;
  }

  function getTracePaneId(tracePaneMap, traceName){
    return (tracePaneMap&&tracePaneMap[traceName])||"pane-1";
  }

  function getPaneTraces(allTr, tracePaneMap, paneId){
    var id=paneId||"pane-1";
    return (allTr||[]).filter(function(tr){
      return getTracePaneId(tracePaneMap,tr.name)===id;
    });
  }

  function normalizePaneActiveTraceMap(allTr, tracePaneMap, panes, prevMap){
    var next={};
    var paneIds=(panes||[]).map(function(pane){return pane.id;});
    paneIds.forEach(function(paneId){
      var traces=getPaneTraces(allTr,tracePaneMap,paneId);
      var names=traces.map(function(tr){return tr.name;});
      var prevName=prevMap&&prevMap[paneId];
      next[paneId]=(prevName&&names.indexOf(prevName)!==-1)?prevName:(traces[0]?traces[0].name:null);
    });
    return next;
  }

  function clearPaneAssignments(tracePaneMap, paneId, targetPaneId){
    var next=Object.assign({},tracePaneMap||{});
    Object.keys(next).forEach(function(traceName){
      if(next[traceName]===paneId)next[traceName]=targetPaneId;
    });
    return next;
  }

  function getAlternatePaneId(panes, paneId){
    var list=(panes||[]).map(function(pane){return pane.id;});
    for(var i=0;i<list.length;i++){
      if(list[i]!==paneId)return list[i];
    }
    return "pane-1";
  }

  function getPaneAutoYDomain(allTr, tracePaneMap, paneId, vis, zoom){
    var traces=getPaneTraces(allTr,tracePaneMap,paneId);
    return getSafeYRangeFromData(traces,vis||{},zoom||null);
  }

  global.PaneHelpers={
    clampPaneCount:clampPaneCount,
    normalizePaneRenderMode:normalizePaneRenderMode,
    clonePane:clonePane,
    buildPanes:buildPanes,
    normalizePanes:normalizePanes,
    normalizeTracePaneMap:normalizeTracePaneMap,
    getTracePaneId:getTracePaneId,
    getPaneTraces:getPaneTraces,
    normalizePaneActiveTraceMap:normalizePaneActiveTraceMap,
    clearPaneAssignments:clearPaneAssignments,
    getAlternatePaneId:getAlternatePaneId,
    getPaneAutoYDomain:getPaneAutoYDomain
  };
})(window);
