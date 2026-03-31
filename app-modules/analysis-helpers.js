(function(global){
  var TM=global.TraceModel||{};
  var getTraceId=TM.getTraceId||function(tr){return tr?(tr.id||tr.name||null):null;};
  var getTraceLabel=TM.getTraceLabel||function(tr){return tr?(tr.dn||tr.name||tr.id||""):"";};

  var ENBW={
    gaussian:{k:1.128,label:"Gaussian"},
    flattop:{k:1.0,label:"Flat-top"},
    fivepole:{k:1.047,label:"5-pole Sync"}
  };

  function noisePSD(data,rbw,ftype){
    var kf=ENBW[ftype]||ENBW.gaussian;
    var c=10*Math.log10(kf.k*rbw);
    return data.map(function(d){return{freq:d.freq,amp:d.amp-c};});
  }

  function calcIP3(f1,p1,f2,p2,pil,piu){
    var ol=p1+(p1-pil)/2,ou=p2+(p2-piu)/2;
    return{
      f1:f1,f2:f2,p1:p1,p2:p2,pim3l:pil,pim3u:piu,fim3l:2*f1-f2,fim3u:2*f2-f1,
      oip3_l:ol,oip3_u:ou,oip3_avg:(ol+ou)/2,deltaL:p1-pil,deltaU:p2-piu
    };
  }

  function calcIP3FromPoints(points){
    if(!points||!points.f1||!points.f2||!points.im3l||!points.im3u)return null;
    var low=points.f1.freq<=points.f2.freq?points.f1:points.f2;
    var high=points.f1.freq<=points.f2.freq?points.f2:points.f1;
    return calcIP3(low.freq,low.amp,high.freq,high.amp,points.im3l.amp,points.im3u.amp);
  }

  function buildIP3RoleRefs(ip3Pts, roleKeys, resolveTraceByName){
    if(typeof roleKeys==="function"&&resolveTraceByName===undefined){
      resolveTraceByName=roleKeys;
      roleKeys=["f1","f2","im3l","im3u"];
    }
    var roles={};
    (roleKeys||[]).forEach(function(key){
      var pt=ip3Pts&&ip3Pts[key]?ip3Pts[key]:null;
      var traceName=pt&&pt.trace?pt.trace:null;
      var trace=traceName&&resolveTraceByName?resolveTraceByName(traceName):null;
      roles[key+"TraceId"]=trace?getTraceId(trace):null;
      roles[key+"TraceName"]=traceName||null;
    });
    return roles;
  }

  function savedResultReferencesTrace(result, traceId, traceName){
    if(!result)return false;
    if(traceId&&result.sourceTraceId===traceId)return true;
    if(traceName&&result.sourceTraceName===traceName)return true;
    var roles=result.parameters&&result.parameters.roles?result.parameters.roles:{};
    var roleIdKeys=["f1TraceId","f2TraceId","im3lTraceId","im3uTraceId"];
    for(var i=0;i<roleIdKeys.length;i++){
      if(traceId&&roles[roleIdKeys[i]]===traceId)return true;
    }
    var roleNameKeys=["f1TraceName","f2TraceName","im3lTraceName","im3uTraceName","f1Trace","f2Trace","im3lTrace","im3uTrace"];
    for(var j=0;j<roleNameKeys.length;j++){
      if(traceName&&roles[roleNameKeys[j]]===traceName)return true;
    }
    return false;
  }

  function savedResultReferencesAnyTrace(result, traceIds, traceNames){
    traceIds=(traceIds||[]).filter(Boolean);
    traceNames=(traceNames||[]).filter(Boolean);
    for(var i=0;i<traceIds.length;i++){
      if(savedResultReferencesTrace(result,traceIds[i],null))return true;
    }
    for(var j=0;j<traceNames.length;j++){
      if(savedResultReferencesTrace(result,null,traceNames[j]))return true;
    }
    return false;
  }

  function savedResultHasValidTraceRefs(result, validIds, validNames){
    if(!result)return true;
    if(result.sourceTraceId){
      if(!validIds[result.sourceTraceId])return false;
    } else if(result.sourceTraceName){
      if(!validNames[result.sourceTraceName])return false;
    }
    var roles=result.parameters&&result.parameters.roles?result.parameters.roles:{};
    var rolePairs=[
      ["f1TraceId","f1TraceName","f1Trace"],
      ["f2TraceId","f2TraceName","f2Trace"],
      ["im3lTraceId","im3lTraceName","im3lTrace"],
      ["im3uTraceId","im3uTraceName","im3uTrace"]
    ];
    for(var i=0;i<rolePairs.length;i++){
      var idKey=rolePairs[i][0],nameKey=rolePairs[i][1],legacyKey=rolePairs[i][2];
      if(roles[idKey]){
        if(!validIds[roles[idKey]])return false;
        continue;
      }
      var roleName=roles[nameKey]||roles[legacyKey];
      if(roleName&&!validNames[roleName])return false;
    }
    return true;
  }

  function makeSavedNoiseResult(npsdStats,noiseFilter,trace){
    if(!npsdStats||!trace)return null;
    var kf=ENBW[noiseFilter]||ENBW.gaussian;
    return {
      id:Date.now()+Math.random(),
      functionType:"noise-psd",
      traceLabel:getTraceLabel(trace),
      sourceTraceId:getTraceId(trace),
      sourceTraceName:trace.name,
      parameters:{
        filter:noiseFilter,
        filterLabel:kf.label,
        rbw:npsdStats.rbw,
        enbw:kf.k*npsdStats.rbw,
        correction:10*Math.log10(kf.k*npsdStats.rbw)
      },
      values:{
        peak:npsdStats.peak.amp,
        peakFreq:npsdStats.peak.freq,
        min:npsdStats.min.amp,
        minFreq:npsdStats.min.freq,
        avg:npsdStats.avg
      }
    };
  }

  function makeSavedIP3Result(ip3Res,ip3Pts,ip3Gain,traceInfo){
    if(!ip3Res||!ip3Pts)return null;
    traceInfo=traceInfo||{};
    return {
      id:Date.now()+Math.random(),
      functionType:"ip3",
      traceLabel:traceInfo.traceLabel||ip3Pts.f1?.trace||ip3Pts.f2?.trace||"-",
      sourceTraceId:traceInfo.sourceTraceId||null,
      sourceTraceName:traceInfo.sourceTraceName||ip3Pts.f1?.trace||ip3Pts.f2?.trace||ip3Pts.im3l?.trace||ip3Pts.im3u?.trace||null,
      parameters:{
        gain:ip3Gain!==''&&!isNaN(parseFloat(ip3Gain))?parseFloat(ip3Gain):null,
        roles:Object.assign({
          f1Trace:ip3Pts.f1&&ip3Pts.f1.trace,
          f2Trace:ip3Pts.f2&&ip3Pts.f2.trace,
          im3lTrace:ip3Pts.im3l&&ip3Pts.im3l.trace,
          im3uTrace:ip3Pts.im3u&&ip3Pts.im3u.trace
        },traceInfo.roles||{})
      },
      values:{
        oip3_l:ip3Res.oip3_l,
        oip3_u:ip3Res.oip3_u,
        oip3_avg:ip3Res.oip3_avg,
        deltaL:ip3Res.deltaL,
        deltaU:ip3Res.deltaU,
        f1:ip3Res.f1,
        f2:ip3Res.f2,
        fim3l:ip3Res.fim3l,
        fim3u:ip3Res.fim3u
      }
    };
  }

  global.AnalysisHelpers={
    ENBW:ENBW,
    noisePSD:noisePSD,
    calcIP3:calcIP3,
    calcIP3FromPoints:calcIP3FromPoints,
    buildIP3RoleRefs:buildIP3RoleRefs,
    savedResultReferencesTrace:savedResultReferencesTrace,
    savedResultReferencesAnyTrace:savedResultReferencesAnyTrace,
    savedResultHasValidTraceRefs:savedResultHasValidTraceRefs,
    makeSavedNoiseResult:makeSavedNoiseResult,
    makeSavedIP3Result:makeSavedIP3Result
  };
})(window);
