(function(global){
  var TH=global.TraceHelpers||{};
  var TM=global.TraceModel||{};
  var getVisibleTraceData=TH.getVisibleTraceData||function(tr){return tr&&tr.data?tr.data:[];};
  var getEffectiveTraceYUnit=TM.getEffectiveTraceYUnit||function(){return "";};
  var getTraceLabel=TM.getTraceLabel||function(tr){return tr?(tr.dn||tr.name||""):"";};
  var normalizeUnitName=TM.normalizeUnitName||function(unit){return String(unit||"").trim().toLowerCase().replace(/\s+/g,"");};

  function normalizeTouchstoneFamily(value){
    var family=String(value||"S").trim().toUpperCase();
    if(!family)return "S";
    if(family==="S"||family==="Y"||family==="Z")return family;
    return family;
  }

  function normalizeTouchstoneMetric(value){
    var metric=String(value||"").trim();
    return metric||null;
  }

  function normalizeTouchstoneIndex(value){
    var n=Number(value);
    return isFinite(n)&&n>=0?Math.floor(n):null;
  }

  function normalizeTouchstonePortCount(value){
    var n=Number(value);
    return isFinite(n)&&n>0?Math.floor(n):null;
  }

  function getTraceTouchstoneNetwork(trace){
    return trace&&trace.touchstoneNetwork&&typeof trace.touchstoneNetwork==="object"?trace.touchstoneNetwork:null;
  }

  function getTraceNetworkSource(trace){
    return trace&&trace.networkSource&&typeof trace.networkSource==="object"?trace.networkSource:null;
  }

  function getTraceTouchstoneContext(trace, opts){
    opts=opts||{};
    if(!trace)return null;
    var file=null;
    if(typeof opts.getTraceFile==="function"){
      try{ file=opts.getTraceFile(trace.name||trace.id||null)||null; }catch(_){}
    }
    var network=getTraceTouchstoneNetwork(trace)||getTraceTouchstoneNetwork(file);
    var source=getTraceNetworkSource(trace)||getTraceNetworkSource(file);
    var isTouchstone=!!(network||source||(file&&file.format==="touchstone")||trace.format==="touchstone");
    if(!isTouchstone)return null;
    var family=normalizeTouchstoneFamily(source&&source.family!=null?source.family:trace.touchstoneFamily);
    var view=String(source&&source.view!=null?source.view:(trace.touchstoneView!=null?trace.touchstoneView:"")).trim()||"dB";
    var row=normalizeTouchstoneIndex(source&&source.row!=null?source.row:trace.touchstoneRow);
    var col=normalizeTouchstoneIndex(source&&source.col!=null?source.col:trace.touchstoneCol);
    var metric=normalizeTouchstoneMetric(source&&source.metric!=null?source.metric:trace.touchstoneMetric);
    var referenceOhms=source&&source.referenceOhms!=null?source.referenceOhms:(network&&network.referenceOhms!=null?network.referenceOhms:null);
    var portCount=normalizeTouchstonePortCount(source&&source.portCount!=null?source.portCount:(network&&network.portCount!=null?network.portCount:null));
    var parameterType=String(source&&source.parameterType!=null?source.parameterType:(network&&network.parameterType!=null?network.parameterType:"S")).trim().toUpperCase()||"S";
    var fileId=source&&source.parentFileId!=null?source.parentFileId:(trace.fileId!=null?trace.fileId:(file&&file.id!=null?file.id:null));
    var fileName=source&&source.fileName!=null?source.fileName:(trace.fileName!=null?trace.fileName:(trace.file!=null?trace.file:(file&&file.fileName!=null?file.fileName:null)));
    var freqUnit=network&&network.freqUnit!=null?network.freqUnit:(source&&source.freqUnit!=null?source.freqUnit:null);
    var dataFormat=network&&network.dataFormat!=null?network.dataFormat:(source&&source.dataFormat!=null?source.dataFormat:null);
    var comments=network&&Array.isArray(network.comments)?network.comments.slice():[];
    var samples=network&&Array.isArray(network.samples)?network.samples:((trace&&Array.isArray(trace.touchstoneSamples))?trace.touchstoneSamples:null);
    return {
      isTouchstone:true,
      fileId:fileId,
      fileName:fileName,
      parameterType:parameterType,
      portCount:portCount,
      family:family,
      view:view,
      row:row,
      col:col,
      metric:metric,
      referenceOhms:referenceOhms,
      freqUnit:freqUnit||"Hz",
      dataFormat:dataFormat,
      comments:comments,
      samples:samples,
      network:network,
      source:source,
      traceLabel:getTraceLabel(trace)
    };
  }

  function getTouchstoneTraceKind(target){
    var touchstone=target&&target.touchstone||null;
    if(!touchstone||!touchstone.isTouchstone)return null;
    if(touchstone.metric!=null)return "scalar-metric";
    var family=normalizeTouchstoneFamily(touchstone.family);
    var row=normalizeTouchstoneIndex(touchstone.row);
    var col=normalizeTouchstoneIndex(touchstone.col);
    if(family!=="S")return "touchstone";
    if(row!=null&&col!=null&&row===col)return "reflection";
    if(row!=null&&col!=null&&row!==col)return "transmission";
    return "touchstone";
  }

  function isTouchstoneReflectionTarget(target){
    return getTouchstoneTraceKind(target)==="reflection";
  }

  function isTouchstoneTransmissionTarget(target){
    return getTouchstoneTraceKind(target)==="transmission";
  }

  function getAnalysisDisplayTitle(item,target){
    if(!item)return "";
    if(item.id==="peak-spur-table"&&isTouchstoneTarget(target))return "Peak Table";
    if(item.id==="bandwidth-helper"&&isTouchstoneTarget(target))return "Passband Metrics";
    return item.title;
  }

  var ANALYSIS_ITEMS=[
    {id:"noise-psd",title:"Noise PSD",colorVar:"noiseTr",kind:"analysis",group:"measure",scope:"spectrum"},
    {id:"ip3",title:"IP3 / TOI",colorVar:"ip3C",kind:"analysis",group:"measure",scope:"spectrum"},
    {id:"peak-spur-table",title:"Peak Table",colorVar:"tr3",kind:"analysis",group:"measure",scope:"shared"},
    {id:"range-stats",title:"Range Statistics",colorVar:"tr2",kind:"analysis",group:"measure",scope:"shared"},
    {id:"bandwidth-helper",title:"3 dB / 10 dB BW",colorVar:"tr1",kind:"analysis",group:"measure",scope:"shared"},
    {id:"threshold-crossings",title:"Threshold Crossings",colorVar:"refH",kind:"analysis",group:"measure",scope:"shared"},
    {id:"ripple-flatness",title:"Ripple / Flatness",colorVar:"tr5",kind:"analysis",group:"measure",scope:"shared"},
    {id:"occupied-bandwidth",title:"Occupied Bandwidth",colorVar:"tr0",kind:"analysis",group:"measure",scope:"spectrum"},
    {id:"channel-power",title:"Channel Power",colorVar:"accent",kind:"analysis",group:"measure",scope:"spectrum"},
    {id:"vswr",title:"VSWR",colorVar:"tr6",kind:"analysis",group:"touchstone",scope:"touchstone"},
    {id:"return-loss",title:"Return Loss",colorVar:"tr7",kind:"analysis",group:"touchstone",scope:"touchstone"},
    {id:"group-delay",title:"Group Delay",colorVar:"tr8",kind:"analysis",group:"touchstone",scope:"touchstone"},
    {id:"reciprocity-isolation",title:"Reciprocity / Isolation",colorVar:"tr9",kind:"analysis",group:"touchstone",scope:"touchstone"},
    {id:"touchstone-stability",title:"Touchstone Stability",colorVar:"accent",kind:"analysis",group:"touchstone",scope:"touchstone"}
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

  function getAnalysisScope(item){
    return item&&item.scope?String(item.scope):"shared";
  }

  function isTouchstoneTarget(target){
    return !!(target&&target.touchstone&&target.touchstone.isTouchstone);
  }

  function isAnalysisItemVisible(item,target){
    if(!item)return false;
    
    // Explicitly hide all analysis tools if the target is a time-domain trace
    // as per user request: "the analysises are for spectrum analyses i dont have any tim domain analyses yet"
    var isTimeDomain = target && target.trace && target.trace.domain === "time";
    if(isTimeDomain) return false;

    var scope=getAnalysisScope(item);
    if(scope==="touchstone"){
      if(!isTouchstoneTarget(target))return false;
      if(item.id==="bandwidth-helper"){
        return isTouchstoneTransmissionTarget(target);
      }
      if(item.id==="vswr"||item.id==="return-loss"){
        return isTouchstoneReflectionTarget(target);
      }
      if(item.id==="reciprocity-isolation"){
        return isTouchstoneTransmissionTarget(target);
      }
      return true;
    }
    if(scope==="spectrum")return !isTouchstoneTarget(target);
    return true;
  }

  function makeAnalysisRegistry(openState,counts,opts){
    var state=normalizeAnalysisOpenState(openState);
    var resultCounts=counts||{};
    var items=ANALYSIS_ITEMS.slice();
    if(opts&&Array.isArray(opts.extraItems))items=items.concat(opts.extraItems);
    var target=opts&&opts.target||null;
    items=items.filter(function(item){ return isAnalysisItemVisible(item,target); });
    return items.map(function(item){
      return {
        id:item.id,
        title:getAnalysisDisplayTitle(item,target),
        kind:item.kind,
        group:item.group,
        scope:getAnalysisScope(item),
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

  function isTouchstoneTrace(trace,opts){
    return !!getTraceTouchstoneContext(trace,opts);
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
    var touchstone=trace?getTraceTouchstoneContext(trace,opts):null;
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
        touchstone:null,
        touchstoneSupported:false,
        touchstoneReason:"No visible trace is available in the active pane.",
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
        touchstone:touchstone,
        touchstoneSupported:!!touchstone,
        touchstoneReason:touchstone?(touchstone.portCount===2?"":"Touchstone stability in v1 is 2-port only."):"",
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
      touchstone:touchstone,
      touchstoneSupported:!!touchstone,
      touchstoneReason:touchstone?(touchstone.portCount===2?"":"Touchstone stability in v1 is 2-port only."):"",
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
    getAnalysisScope:getAnalysisScope,
    isAnalysisItemVisible:isAnalysisItemVisible,
    isPowerLikeAbsoluteUnit:isPowerLikeAbsoluteUnit,
    isSpectralPowerDensityUnit:isSpectralPowerDensityUnit,
    isTouchstoneTrace:isTouchstoneTrace,
    getTouchstoneTraceKind:getTouchstoneTraceKind,
    isTouchstoneReflectionTarget:isTouchstoneReflectionTarget,
    isTouchstoneTransmissionTarget:isTouchstoneTransmissionTarget,
    getAnalysisDisplayTitle:getAnalysisDisplayTitle,
    normalizeTouchstoneFamily:normalizeTouchstoneFamily,
    normalizeTouchstoneMetric:normalizeTouchstoneMetric,
    normalizeTouchstoneIndex:normalizeTouchstoneIndex,
    normalizeTouchstonePortCount:normalizeTouchstonePortCount,
    getTraceTouchstoneContext:getTraceTouchstoneContext,
    resolveAnalysisTarget:resolveAnalysisTarget,
    resolveSelectedHorizontalLine:resolveSelectedHorizontalLine
  };
})(window);
