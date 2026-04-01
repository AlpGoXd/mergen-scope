(function(global){
  var _tid=0;

  function resetTraceIdCounter(){
    _tid=0;
  }

  function makeTraceId(){
    _tid++;
    return "trace-"+_tid;
  }

  function syncTraceIdCounter(traces){
    var maxId=0;
    (traces||[]).forEach(function(trace){
      var id=trace&&trace.id?String(trace.id):"";
      var match=id.match(/^trace-(\d+)$/);
      if(match){
        var value=Number(match[1]);
        if(isFinite(value)&&value>maxId)maxId=value;
      }
    });
    if(maxId>_tid)_tid=maxId;
  }

  function makeTrace(prefix,fileName,traceLabel,fileCounter){
    var id=makeTraceId();
    return {
      id:id,
      kind:"raw",
      sourceTraceIds:[id],
      operationType:null,
      parameters:null,
      units:{x:null,y:null},
      paneId:null,
      name:prefix+traceLabel+"_"+fileCounter,
      mode:"",
      detector:"",
      data:[],
      file:fileName,
      dn:prefix+traceLabel
    };
  }

  function isRawTrace(tr){ return !!tr&&(tr.kind||"raw")==="raw"; }
  function isDerivedTrace(tr){ return !!tr&&tr.kind==="derived"; }
  function getTraceId(tr){ return tr?(tr.id||tr.name||null):null; }
  function getTraceLabel(tr){ return tr?(tr.dn||tr.name||tr.id||""):""; }
  function getTraceData(tr){ return tr&&Array.isArray(tr.data)?tr.data:[]; }

  function getTraceSourceIds(tr){
    if(!tr)return [];
    if(isRawTrace(tr))return getTraceId(tr)?[getTraceId(tr)]:[];
    return Array.isArray(tr.sourceTraceIds)?tr.sourceTraceIds.filter(Boolean):[];
  }

  function createDerivedTrace(sourceTrace, operationType, parameters, data, displayName){
    var id=makeTraceId();
    var sourceId=getTraceId(sourceTrace);
    return {
      id:id,
      kind:"derived",
      sourceTraceIds:sourceId?[sourceId]:getTraceSourceIds(sourceTrace),
      operationType:operationType||"derived",
      parameters:parameters||{},
      units:sourceTrace&&sourceTrace.units?Object.assign({},sourceTrace.units):{x:null,y:null},
      paneId:sourceTrace&&sourceTrace.paneId!=null?sourceTrace.paneId:null,
      name:"drv_"+operationType+"_"+id,
      mode:sourceTrace&&sourceTrace.mode?sourceTrace.mode:"",
      detector:sourceTrace&&sourceTrace.detector?sourceTrace.detector:"",
      data:Array.isArray(data)?data:[],
      file:sourceTrace&&sourceTrace.file?sourceTrace.file:null,
      dn:displayName||((getTraceLabel(sourceTrace)||"Trace")+" ["+(operationType||"derived")+"]")
    };
  }

  function setDerivedTraceYUnit(trace, unit){
    if(!trace)return trace;
    var nextUnits=trace.units?Object.assign({},trace.units):{x:null,y:null};
    nextUnits.y=unit;
    trace.units=nextUnits;
    return trace;
  }

  function normalizeUnitName(unit){
    return String(unit||"").trim().toLowerCase().replace(/\s+/g,"");
  }

  function isDbRatioUnit(unit){
    return normalizeUnitName(unit)==="db";
  }

  function isLogLevelUnit(unit){
    var u=normalizeUnitName(unit);
    return ["dbm","dbw","dbuv","db\u00b5v","db\u03bcv","dbmv"].indexOf(u)!==-1;
  }

  function isLogUnit(unit){
    return isDbRatioUnit(unit)||isLogLevelUnit(unit);
  }

  function resolveTraceMathResultUnit(aUnit, bUnit, op){
    var aNorm=normalizeUnitName(aUnit);
    var bNorm=normalizeUnitName(bUnit);
    if(!aNorm||!bNorm)return aUnit||bUnit||"";
    if(op==="subtract"&&aNorm===bNorm){
      if(isDbRatioUnit(aNorm))return "dB";
      if(isLogLevelUnit(aNorm))return "dB";
    }
    return aUnit||bUnit||"";
  }

  function getTraceYUnit(tr){
    return (tr&&tr.units&&typeof tr.units.y==="string"&&tr.units.y.trim())?tr.units.y.trim():"";
  }

  function getEffectiveTraceYUnit(tr){
    var unit=getTraceYUnit(tr);
    if(unit)return unit;
    if(tr&&isDerivedTrace(tr)&&tr.operationType==="subtract")return "dB";
    return "";
  }

  function getYAxisTextForUnit(unit, tr){
    var u=(unit||"").trim();
    var norm=normalizeUnitName(u);
    if(!u)return "Amplitude";
    if(norm==="dbm"||norm==="dbw")return "Power ("+u+")";
    if(norm==="dbuv"||norm==="db\u00b5v"||norm==="db\u03bcv"||norm==="dbmv")return "Level ("+u+")";
    if(norm==="db"){
      if(tr&&tr.operationType==="subtract")return "Level Difference (dB)";
      return "Magnitude (dB)";
    }
    return "Amplitude ("+u+")";
  }

  function deriveAxisInfo(allTr, vis, selectedTraceName, fUnit, hasData){
    var xName=hasData?"Frequency":"";
    var visible=(allTr||[]).filter(function(tr){return vis&&vis[tr.name]&&getTraceData(tr).length;});
    var active=(selectedTraceName?((allTr||[]).find(function(tr){return tr.name===selectedTraceName;})||null):null);
    var target=(active&&visible.some(function(tr){return tr.name===active.name;}))?active:(visible[0]||null);
    var unitsSeen={};
    visible.forEach(function(tr){ var u=getEffectiveTraceYUnit(tr); if(u)unitsSeen[normalizeUnitName(u)]=u; });
    var unitKeys=Object.keys(unitsSeen);
    var yUnit=target?getEffectiveTraceYUnit(target):"";
    var yLabel="Amplitude";
    if(yUnit){
      yLabel=getYAxisTextForUnit(yUnit,target);
    } else if(unitKeys.length===1){
      yUnit=unitsSeen[unitKeys[0]];
      yLabel=getYAxisTextForUnit(yUnit,target);
    } else if(unitKeys.length>1){
      yUnit="";
      yLabel="Amplitude";
    }
    return {
      xLabel:hasData?(xName+" ("+(fUnit||"Hz")+")"):"",
      yLabel:hasData?yLabel:"",
      yUnit:yUnit||"",
      hasMixedYUnits:unitKeys.length>1
    };
  }

  global.TraceModel={
    resetTraceIdCounter:resetTraceIdCounter,
    makeTraceId:makeTraceId,
    syncTraceIdCounter:syncTraceIdCounter,
    makeTrace:makeTrace,
    isRawTrace:isRawTrace,
    isDerivedTrace:isDerivedTrace,
    getTraceId:getTraceId,
    getTraceLabel:getTraceLabel,
    getTraceSourceIds:getTraceSourceIds,
    getTraceData:getTraceData,
    createDerivedTrace:createDerivedTrace,
    setDerivedTraceYUnit:setDerivedTraceYUnit,
    normalizeUnitName:normalizeUnitName,
    isDbRatioUnit:isDbRatioUnit,
    isLogLevelUnit:isLogLevelUnit,
    isLogUnit:isLogUnit,
    resolveTraceMathResultUnit:resolveTraceMathResultUnit,
    getTraceYUnit:getTraceYUnit,
    getEffectiveTraceYUnit:getEffectiveTraceYUnit,
    getYAxisTextForUnit:getYAxisTextForUnit,
    deriveAxisInfo:deriveAxisInfo
  };
})(window);
