(function(global){
  var TH=global.TraceHelpers||{};
  var TM=global.TraceModel||{};
  var getVisibleTraceData=TH.getVisibleTraceData||function(tr){return tr&&tr.data?tr.data:[];};
  var getEffectiveTraceYUnit=TM.getEffectiveTraceYUnit||function(){return "";};
  var getTraceLabel=TM.getTraceLabel||function(tr){return tr?(tr.dn||tr.name||""):"";};
  var normalizeUnitName=TM.normalizeUnitName||function(unit){return String(unit||"").trim().toLowerCase().replace(/\s+/g,"");};

  var ANALYSIS_ITEMS=[
    {id:"noise-psd",title:"Noise PSD",colorVar:"noiseTr",kind:"analysis",group:"measure"},
    {id:"ip3",title:"IP3 / TOI",colorVar:"ip3C",kind:"analysis",group:"measure"},
    {id:"peak-spur-table",title:"Peak / Spur Table",colorVar:"tr3",kind:"analysis",group:"measure"},
    {id:"marker-delta-table",title:"Marker Delta Table",colorVar:"tr4",kind:"analysis",group:"measure"},
    {id:"range-stats",title:"Range Statistics",colorVar:"tr2",kind:"analysis",group:"measure"},
    {id:"bandwidth-helper",title:"3 dB / 10 dB BW",colorVar:"tr1",kind:"analysis",group:"measure"},
    {id:"threshold-crossings",title:"Threshold Crossings",colorVar:"refH",kind:"analysis",group:"measure"},
    {id:"ripple-flatness",title:"Ripple / Flatness",colorVar:"tr5",kind:"analysis",group:"measure"},
    {id:"occupied-bandwidth",title:"Occupied Bandwidth",colorVar:"tr0",kind:"analysis",group:"measure"},
    {id:"channel-power",title:"Channel Power",colorVar:"accent",kind:"analysis",group:"measure"}
  ];

  function getDefaultAnalysisOpenState(){
    var state={};
    ANALYSIS_ITEMS.forEach(function(item){state[item.id]=false;});
    return state;
  }

  function normalizeAnalysisOpenState(state){
    var next=getDefaultAnalysisOpenState();
    Object.assign(next,state||{});
    return next;
  }

  function setAnalysisOpenState(prev,id,nextValue){
    var next=normalizeAnalysisOpenState(prev);
    if(id==null)return next;
    next[id]=(nextValue===undefined)?!next[id]:!!nextValue;
    return next;
  }

  function clearAllAnalysisOpenState(prev){
    var next=normalizeAnalysisOpenState(prev);
    Object.keys(next).forEach(function(key){next[key]=false;});
    return next;
  }

  function makeAnalysisRegistry(openState,counts){
    var state=normalizeAnalysisOpenState(openState);
    var resultCounts=counts||{};
    return ANALYSIS_ITEMS.map(function(item){
      return {
        id:item.id,
        title:item.title,
        kind:item.kind,
        group:item.group,
        colorVar:item.colorVar,
        isOpen:!!state[item.id],
        resultCount:resultCounts[item.id]||0
      };
    });
  }

  function getAnalysisItem(id){
    for(var i=0;i<ANALYSIS_ITEMS.length;i++){
      if(ANALYSIS_ITEMS[i].id===id)return ANALYSIS_ITEMS[i];
    }
    return null;
  }

  function getAnalysisColor(item,C){
    if(!item||!C)return "var(--accent)";
    if(item.colorVar==="noiseTr")return C.noiseTr;
    if(item.colorVar==="ip3C")return C.ip3C;
    if(item.colorVar==="refH")return C.refH;
    if(item.colorVar==="accent")return C.accent;
    if(/^tr\d$/.test(item.colorVar)){
      var idx=Number(item.colorVar.slice(2));
      return C.tr&&C.tr[idx]?C.tr[idx]:C.accent;
    }
    return C[item.colorVar]||C.accent;
  }

  function isPowerLikeAbsoluteUnit(unit){
    var norm=normalizeUnitName(unit);
    return norm==="dbm"||norm==="dbw";
  }

  function isSpectralPowerDensityUnit(unit){
    var norm=normalizeUnitName(unit);
    return norm==="dbm/hz"||norm==="dbmperhz"||norm==="dbw/hz"||norm==="dbwperhz";
  }

  function resolveAnalysisTarget(opts){
    opts=opts||{};
    var model=opts.activePaneModel||null;
    var paneId=(model&&model.pane&&model.pane.id)||opts.activePaneId||"pane-1";
    var paneTraces=(model&&Array.isArray(model.traces)?model.traces:[]).filter(function(tr){
      return tr&&(!opts.vis||opts.vis[tr.name]);
    });
    var selectedTrace=null;
    if(opts.selectedTraceName){
      selectedTrace=paneTraces.find(function(tr){return tr.name===opts.selectedTraceName;})||null;
    }
    var paneActiveTrace=null;
    if(model&&model.paneActiveTraceName){
      paneActiveTrace=paneTraces.find(function(tr){return tr.name===model.paneActiveTraceName;})||null;
    }
    var trace=selectedTrace||paneActiveTrace||paneTraces[0]||null;
    var data=trace?getVisibleTraceData(trace,opts.zoom).filter(function(point){
      return point&&isFinite(point.freq)&&isFinite(point.amp);
    }):[];
    var rangeHz=null;
    if(data.length){
      rangeHz={left:data[0].freq,right:data[data.length-1].freq};
    } else if(opts.zoom&&isFinite(opts.zoom.left)&&isFinite(opts.zoom.right)){
      rangeHz={left:opts.zoom.left,right:opts.zoom.right};
    }
    if(!trace){
      return {
        paneId:paneId,
        trace:null,
        traceLabel:"",
        data:[],
        rangeHz:rangeHz,
        xUnit:(model&&model.fUnit)||"Hz",
        yUnit:"",
        supported:false,
        reason:paneTraces.length?"Select a trace in the active pane.":"No visible trace is available in the active pane."
      };
    }
    if(!data.length){
      return {
        paneId:paneId,
        trace:trace,
        traceLabel:getTraceLabel(trace),
        data:[],
        rangeHz:rangeHz,
        xUnit:(model&&model.fUnit)||"Hz",
        yUnit:getEffectiveTraceYUnit(trace),
        supported:false,
        reason:"The selected trace has no visible samples in the current pane range."
      };
    }
    return {
      paneId:paneId,
      trace:trace,
      traceLabel:getTraceLabel(trace),
      data:data,
      rangeHz:rangeHz,
      xUnit:(model&&model.fUnit)||"Hz",
      yUnit:getEffectiveTraceYUnit(trace),
      supported:true,
      reason:""
    };
  }

  function resolveSelectedHorizontalLine(refLines,selectedRefLineId,activePaneId){
    if(selectedRefLineId===null||selectedRefLineId===undefined)return null;
    var selected=(refLines||[]).find(function(line){return line&&line.id===selectedRefLineId&&line.type==="h";})||null;
    if(!selected)return null;
    if(selected.groupId)return selected;
    if(selected.paneId&&activePaneId&&selected.paneId!==activePaneId)return null;
    return selected;
  }

  global.AnalysisTargetHelpers={
    ANALYSIS_ITEMS:ANALYSIS_ITEMS,
    getDefaultAnalysisOpenState:getDefaultAnalysisOpenState,
    normalizeAnalysisOpenState:normalizeAnalysisOpenState,
    setAnalysisOpenState:setAnalysisOpenState,
    clearAllAnalysisOpenState:clearAllAnalysisOpenState,
    makeAnalysisRegistry:makeAnalysisRegistry,
    getAnalysisItem:getAnalysisItem,
    getAnalysisColor:getAnalysisColor,
    isPowerLikeAbsoluteUnit:isPowerLikeAbsoluteUnit,
    isSpectralPowerDensityUnit:isSpectralPowerDensityUnit,
    resolveAnalysisTarget:resolveAnalysisTarget,
    resolveSelectedHorizontalLine:resolveSelectedHorizontalLine
  };
})(window);
