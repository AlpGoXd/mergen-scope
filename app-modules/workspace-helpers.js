(function(global){
  var TH=global.TraceHelpers||{};
  var AH=global.AnalysisHelpers||{};
  var ATH=global.AnalysisTargetHelpers||{};
  var PH=global.ParserHelpers||{};
  var MH=global.MarkerHelpers||{};
  var PAH=global.PaneHelpers||{};
  var FSH=global.FileStoreHelpers||{};
  var sanitizeYDomain=TH.sanitizeYDomain||function(z){
    if(!z||!isFinite(z.min)||!isFinite(z.max)||z.max<=z.min)return null;
    return {min:Number(z.min),max:Number(z.max)};
  };
  var savedResultHasValidTraceRefs=AH.savedResultHasValidTraceRefs||function(){return true;};
  var makeSavedNoiseResult=AH.makeSavedNoiseResult||function(){return null;};
  var makeSavedIP3Result=AH.makeSavedIP3Result||function(){return null;};
  var buildIP3RoleRefs=AH.buildIP3RoleRefs||function(){return {};};
  var calcIP3FromPoints=AH.calcIP3FromPoints||function(){return null;};
  var noisePSD=AH.noisePSD||function(data){return data||[];};
  var normalizeAnalysisOpenState=ATH.normalizeAnalysisOpenState||function(state){return Object.assign({},state||{});};
  var getDefaultAnalysisOpenState=ATH.getDefaultAnalysisOpenState||function(){return {};};
  var WORKSPACE_FILE_VERSION=1;
  var nearestPoint=PH.nearestPoint||function(){return null;};
  var getIP3PointsFromMarkers=MH.getIP3PointsFromMarkers||function(){return {f1:null,f2:null,im3l:null,im3u:null};};
  var clampPaneCount=PAH.clampPaneCount||function(count){
    var n=Number(count);
    if(!isFinite(n))n=1;
    n=Math.round(n);
    if(n<1)n=1;
    if(n>4)n=4;
    return n;
  };
  var buildPanes=PAH.buildPanes||function(mode){
    var count=clampPaneCount(mode);
    var panes=[];
    for(var i=1;i<=count;i++)panes.push({id:"pane-"+i,title:"Pane "+i});
    return panes;
  };
  var normalizeTraceData=FSH.normalizeTraceData||function(data){return Array.isArray(data)?data:[];};

  function cloneDataPoints(data){
    return (Array.isArray(data)?data:[]).map(function(point){
      return {freq:Number(point.freq),amp:Number(point.amp)};
    }).filter(function(point){
      return isFinite(point.freq)&&isFinite(point.amp);
    });
  }

  function cloneTrace(trace, fallbackFileId, fallbackFileName){
    if(!trace||!Array.isArray(trace.data))return null;
    var next=Object.assign({},trace);
    next.data=cloneDataPoints(normalizeTraceData(trace.data));
    if(!next.data.length)return null;
    next.units=trace&&trace.units?Object.assign({},trace.units):{x:null,y:null};
    next.sourceTraceIds=Array.isArray(trace&&trace.sourceTraceIds)?trace.sourceTraceIds.slice().filter(Boolean):[];
    if(fallbackFileId!==undefined)next.fileId=fallbackFileId;
    if(fallbackFileName!==undefined){
      next.fileName=fallbackFileName;
      next.file=fallbackFileName;
    }
    return next;
  }

  function cloneFile(file){
    if(!file||!Array.isArray(file.traces))return null;
    var nextMeta=file&&file.meta&&typeof file.meta==="object"?Object.assign({},file.meta):{};
    var next={
      id:file.id,
      fileName:file.fileName||"",
      meta:nextMeta,
      traces:[]
    };
    next.traces=(file.traces||[]).map(function(trace){
      return cloneTrace(trace,next.id,next.fileName);
    }).filter(Boolean);
    return next.traces.length?next:null;
  }

  function cloneResult(result){
    if(!result||typeof result!=="object")return null;
    var next=Object.assign({},result);
    next.parameters=result.parameters&&typeof result.parameters==="object"?Object.assign({},result.parameters):{};
    if(next.parameters.roles&&typeof next.parameters.roles==="object"){
      next.parameters.roles=Object.assign({},next.parameters.roles);
    }
    next.values=result.values&&typeof result.values==="object"?Object.assign({},result.values):{};
    return next;
  }

  function cloneZoomWindow(zoom){
    if(!zoom||!isFinite(zoom.left)||!isFinite(zoom.right)||zoom.right<=zoom.left)return null;
    return {left:Number(zoom.left),right:Number(zoom.right)};
  }

  function cloneZoomMap(map, paneIds){
    var out={};
    var allowed={};
    (paneIds||[]).forEach(function(id){allowed[id]=true;});
    Object.keys(map||{}).forEach(function(key){
      if(!allowed[key])return;
      var zoom=cloneZoomWindow(map[key]);
      if(zoom)out[key]=zoom;
    });
    return out;
  }

  function buildTraceIndex(files, derivedTraces){
    var byName={};
    var byId={};
    var all=[];
    (files||[]).forEach(function(file){
      (file.traces||[]).forEach(function(trace){
        all.push(trace);
        if(trace.name)byName[trace.name]=trace;
        if(trace.id)byId[trace.id]=trace;
      });
    });
    (derivedTraces||[]).forEach(function(trace){
      all.push(trace);
      if(trace.name)byName[trace.name]=trace;
      if(trace.id)byId[trace.id]=trace;
    });
    return {all:all,byName:byName,byId:byId};
  }

  function normalizeTraceAssignments(assignments, validNames, paneIds){
    var validPaneIds={};
    var next={};
    (paneIds||[]).forEach(function(id){validPaneIds[id]=true;});
    Object.keys(assignments||{}).forEach(function(traceName){
      if(!validNames[traceName])return;
      var paneId=assignments[traceName];
      next[traceName]=validPaneIds[paneId]?paneId:"pane-1";
    });
    Object.keys(validNames||{}).forEach(function(traceName){
      if(!next[traceName])next[traceName]="pane-1";
    });
    return next;
  }

  function normalizePaneActiveTraceMap(map, validNames, paneIds){
    var next={};
    (paneIds||[]).forEach(function(pane){
      var traceName=map&&map[pane]?map[pane]:null;
      next[pane]=(traceName&&validNames[traceName])?traceName:null;
    });
    return next;
  }

  function normalizeRefLines(refLines, selectedRefLineId){
    var next=[];
    var idMap={};
    (refLines||[]).forEach(function(line){
      if(!line||!isFinite(line.value)||(line.type!=="h"&&line.type!=="v"))return;
      var nextId=next.length+1;
      var oldId=line.id;
      if(oldId!==undefined&&oldId!==null)idMap[oldId]=nextId;
      next.push({
        id:nextId,
        type:line.type,
        paneId:line.paneId||null,
        groupId:line.groupId||null,
        value:Number(line.value),
        label:line.label||null
      });
    });
    return {
      refLines:next,
      selectedRefLineId:(selectedRefLineId!==null&&selectedRefLineId!==undefined&&idMap[selectedRefLineId]!==undefined)?idMap[selectedRefLineId]:null
    };
  }

  function normalizeMarkers(markers, validNames, selectedMkrIdx, dRef){
    var next=(markers||[]).map(function(marker){
      if(!marker||!marker.trace||!validNames[marker.trace])return null;
      if(!isFinite(marker.freq)||!isFinite(marker.amp))return null;
      var normalized=Object.assign({},marker,{
        freq:Number(marker.freq),
        amp:Number(marker.amp),
        trace:marker.trace
      });
      if(normalized.refIdx!==undefined&&normalized.refIdx!==null){
        normalized.refIdx=Math.round(Number(normalized.refIdx));
      }
      return normalized;
    }).filter(Boolean);
    next=next.map(function(marker){
      if(marker.refIdx===undefined||marker.refIdx===null)return marker;
      if(marker.refIdx<0||marker.refIdx>=next.length)return Object.assign({},marker,{refIdx:null});
      return marker;
    });
    var selected=(selectedMkrIdx!==null&&selectedMkrIdx!==undefined&&selectedMkrIdx>=0&&selectedMkrIdx<next.length)?selectedMkrIdx:null;
    var nextDRef=(dRef!==null&&dRef!==undefined&&dRef>=0&&dRef<next.length)?dRef:null;
    return {markers:next,selectedMkrIdx:selected,dRef:nextDRef};
  }

  function buildDefaultUiState(){
    return {
      showSidebar:true,
      showMeta:true,
      showMarkers:true,
      showMarkerTools:true,
      showPaneTools:true,
      showSearchTools:true,
      showLineTools:false,
      showViewTools:true,
      showDots:false,
      showDT:false,
      lockLinesAcrossPanes:false,
      searchDirection:"right",
      newMarkerArmed:false,
      markerTrace:"__auto__",
      selectedMkrIdx:null,
      dRef:null,
      refMode:null,
      selectedRefLineId:null,
      showTraceOps:false,
      traceOpsOpenSections:{offset:false,scale:false,smoothing:false,subtract:false},
      showAnalysisPanel:false,
      noiseFilter:"gaussian",
      noiseSource:null,
      ip3Gain:"",
      dtTrace:null
    };
  }

  function normalizeUiState(ui){
    var next=buildDefaultUiState();
    if(ui&&typeof ui==="object")Object.assign(next,ui);
    next.traceOpsOpenSections=Object.assign({},buildDefaultUiState().traceOpsOpenSections,ui&&ui.traceOpsOpenSections||{});
    next.showSidebar=!!next.showSidebar;
    next.showMeta=!!next.showMeta;
    next.showMarkers=!!next.showMarkers;
    next.showMarkerTools=!!next.showMarkerTools;
    next.showPaneTools=!!next.showPaneTools;
    next.showSearchTools=!!next.showSearchTools;
    next.showLineTools=!!next.showLineTools;
    next.showViewTools=!!next.showViewTools;
    next.showDots=!!next.showDots;
    next.showDT=!!next.showDT;
    next.lockLinesAcrossPanes=!!next.lockLinesAcrossPanes;
    next.newMarkerArmed=!!next.newMarkerArmed;
    next.showTraceOps=!!next.showTraceOps;
    next.showAnalysisPanel=!!next.showAnalysisPanel;
    next.searchDirection=next.searchDirection==="left"?"left":"right";
    next.markerTrace=typeof next.markerTrace==="string"&&next.markerTrace?next.markerTrace:"__auto__";
    next.refMode=next.refMode==="h"||next.refMode==="v"?next.refMode:null;
    next.noiseFilter=typeof next.noiseFilter==="string"&&next.noiseFilter?next.noiseFilter:"gaussian";
    next.noiseSource=next.noiseSource||null;
    next.ip3Gain=next.ip3Gain!=null?String(next.ip3Gain):"";
    next.dtTrace=next.dtTrace||null;
    return next;
  }

  function buildSavedNoiseResultFromTrace(trace, fileMeta, filter){
    if(!trace||!trace.data||!trace.data.length)return null;
    var meta=fileMeta&&typeof fileMeta==="object"?fileMeta:{};
    var rawRbw=meta["RBW"]&&meta["RBW"].value!=null?Number(meta["RBW"].value):3000;
    var rbwValue=isFinite(rawRbw)&&rawRbw>0?rawRbw:3000;
    var psd=noisePSD(trace.data,rbwValue,filter||"gaussian");
    if(!psd.length)return null;
    var peak=psd.reduce(function(a,b){return a.amp>b.amp?a:b;});
    var min=psd.reduce(function(a,b){return a.amp<b.amp?a:b;});
    var avg=psd.reduce(function(sum,item){return sum+item.amp;},0)/psd.length;
    return makeSavedNoiseResult({src:trace,rbw:rbwValue,data:psd,peak:peak,min:min,avg:avg},filter||"gaussian",trace);
  }

  function normalizeWorkspaceSnapshot(snapshot){
    snapshot=snapshot&&typeof snapshot==="object"?snapshot:{};
    var next={};
    var panes;
    var paneIds;
    var index;
    var validIds={};
    var validNames={};
    var markerState;
    var refState;
    next.version=1;
    next.files=(snapshot.files||[]).map(cloneFile).filter(Boolean);
    next.derivedTraces=(snapshot.derivedTraces||[]).map(function(trace){
      return cloneTrace(trace);
    }).filter(Boolean);
    index=buildTraceIndex(next.files,next.derivedTraces);
    index.all.forEach(function(trace){
      if(trace.id)validIds[trace.id]=true;
      if(trace.name)validNames[trace.name]=true;
    });
    next.paneMode=clampPaneCount(snapshot.paneMode||1);
    panes=buildPanes(next.paneMode);
    paneIds=panes.map(function(pane){return pane.id;});
    next.traceAssignments=normalizeTraceAssignments(snapshot.traceAssignments,validNames,paneIds);
    next.paneActiveTraceMap=normalizePaneActiveTraceMap(snapshot.paneActiveTraceMap||snapshot.paneActiveTraceKeys,validNames,paneIds);
    next.activePaneId=paneIds.indexOf(snapshot.activePaneId)!==-1?snapshot.activePaneId:"pane-1";
    next.xZoomState={
      zoomAll:!snapshot.xZoomState||snapshot.xZoomState.zoomAll!==false,
      sharedZoom:cloneZoomWindow(snapshot.xZoomState&&snapshot.xZoomState.sharedZoom),
      paneXZooms:cloneZoomMap(snapshot.xZoomState&&snapshot.xZoomState.paneXZooms,paneIds)
    };
    next.yZoomState={paneYZooms:{}};
    Object.keys(snapshot.yZoomState&&snapshot.yZoomState.paneYZooms||{}).forEach(function(paneId){
      if(paneIds.indexOf(paneId)===-1)return;
      var zoom=sanitizeYDomain(snapshot.yZoomState.paneYZooms[paneId]);
      if(zoom)next.yZoomState.paneYZooms[paneId]=zoom;
    });
    next.ui=normalizeUiState(snapshot.ui);
    markerState=normalizeMarkers(snapshot.markers,validNames,next.ui.selectedMkrIdx,next.ui.dRef);
    next.markers=markerState.markers;
    next.ui.selectedMkrIdx=markerState.selectedMkrIdx;
    next.ui.dRef=markerState.dRef;
    refState=normalizeRefLines(snapshot.refLines,next.ui.selectedRefLineId);
    next.refLines=refState.refLines;
    next.ui.selectedRefLineId=refState.selectedRefLineId;
    next.savedNoise=(snapshot.savedNoise||[]).map(cloneResult).filter(function(result){
      return savedResultHasValidTraceRefs(result,validIds,validNames);
    });
    next.savedIP3=(snapshot.savedIP3||[]).map(cloneResult).filter(function(result){
      return savedResultHasValidTraceRefs(result,validIds,validNames);
    });
    next.analysisOpenState=normalizeAnalysisOpenState(snapshot.analysisOpenState||getDefaultAnalysisOpenState());
    next.vis={};
    Object.keys(validNames).forEach(function(name){
      next.vis[name]=true;
    });
    Object.keys(snapshot.vis||{}).forEach(function(name){
      if(validNames[name])next.vis[name]=!!snapshot.vis[name];
    });
    next.selectedTraceName=(snapshot.selectedTraceName&&validNames[snapshot.selectedTraceName])?snapshot.selectedTraceName:(index.all[0]?index.all[0].name:null);
    if(!(next.ui.noiseSource&&validNames[next.ui.noiseSource]))next.ui.noiseSource=next.selectedTraceName;
    if(!(next.ui.dtTrace&&validNames[next.ui.dtTrace]))next.ui.dtTrace=next.selectedTraceName;
    if(next.ui.markerTrace!=="__auto__"&&!validNames[next.ui.markerTrace])next.ui.markerTrace="__auto__";
    return next;
  }

  function buildWorkspaceSnapshot(stateDeps){
    stateDeps=stateDeps&&typeof stateDeps==="object"?stateDeps:{};
    return normalizeWorkspaceSnapshot({
      version:1,
      files:(stateDeps.files||[]).map(cloneFile).filter(Boolean),
      derivedTraces:(stateDeps.derivedTraces||[]).map(function(trace){return cloneTrace(trace);}).filter(Boolean),
      vis:Object.assign({},stateDeps.vis||{}),
      paneMode:stateDeps.paneMode,
      activePaneId:stateDeps.activePaneId,
      traceAssignments:Object.assign({},stateDeps.traceAssignments||{}),
      paneActiveTraceMap:Object.assign({},stateDeps.paneActiveTraceMap||{}),
      xZoomState:{
        zoomAll:stateDeps.xZoomState&&stateDeps.xZoomState.zoomAll!==false,
        sharedZoom:cloneZoomWindow(stateDeps.xZoomState&&stateDeps.xZoomState.sharedZoom),
        paneXZooms:Object.assign({},stateDeps.xZoomState&&stateDeps.xZoomState.paneXZooms||{})
      },
      yZoomState:{paneYZooms:Object.assign({},stateDeps.yZoomState&&stateDeps.yZoomState.paneYZooms||{})},
      markers:(stateDeps.markers||[]).map(function(marker){return marker?Object.assign({},marker):marker;}).filter(Boolean),
      refLines:(stateDeps.refLines||[]).map(function(line){return line?Object.assign({},line):line;}).filter(Boolean),
      savedNoise:(stateDeps.savedNoise||[]).map(cloneResult).filter(Boolean),
      savedIP3:(stateDeps.savedIP3||[]).map(cloneResult).filter(Boolean),
      selectedTraceName:stateDeps.selectedTraceName||null,
      ui:Object.assign(buildDefaultUiState(),stateDeps.ui||{}),
      analysisOpenState:Object.assign({},stateDeps.analysisOpenState||{})
    });
  }

  function looksLikeWorkspaceSnapshot(payload){
    return !!(payload&&typeof payload==="object"&&(
      Array.isArray(payload.files)||
      Array.isArray(payload.derivedTraces)||
      payload.traceAssignments||
      payload.paneActiveTraceMap||
      payload.ui||
      payload.paneMode
    ));
  }

  function buildWorkspaceExportPackage(snapshot,options){
    var normalized=normalizeWorkspaceSnapshot(snapshot);
    var fileCount=(normalized.files||[]).length;
    var rawTraceCount=(normalized.files||[]).reduce(function(sum,file){
      return sum+((file&&file.traces&&file.traces.length)||0);
    },0);
    var derivedTraceCount=(normalized.derivedTraces||[]).length;
    options=options&&typeof options==="object"?options:{};
    return {
      kind:"mergen-scope-workspace",
      version:WORKSPACE_FILE_VERSION,
      app:"Mergen Scope",
      exportedAt:options.exportedAt||new Date().toISOString(),
      summary:{
        fileCount:fileCount,
        rawTraceCount:rawTraceCount,
        derivedTraceCount:derivedTraceCount
      },
      snapshot:normalized
    };
  }

  function extractWorkspaceSnapshotFromPackage(payload){
    var source=payload&&typeof payload==="object"?payload:null;
    var version;
    if(!source)throw new Error("Workspace file is empty or invalid.");
    if(source.kind==="mergen-scope-workspace"||source.format==="workspace"){
      version=Number(source.version||1);
      if(isFinite(version)&&version>WORKSPACE_FILE_VERSION){
        throw new Error("Workspace file version "+version+" is newer than this viewer supports.");
      }
      if(!source.snapshot||typeof source.snapshot!=="object"){
        throw new Error("Workspace file is missing its snapshot payload.");
      }
      source=source.snapshot;
    } else if(!looksLikeWorkspaceSnapshot(source)){
      throw new Error("File does not contain a valid Mergen Scope workspace.");
    }
    return normalizeWorkspaceSnapshot(source);
  }

  function buildWorkspaceSnapshotFromDemoPreset(preset,demoFiles){
    var files=(demoFiles||[]).map(function(file){
      return {id:file.id,fileName:file.fileName,meta:file.meta,traces:file.traces};
    }).map(cloneFile).filter(Boolean);
    var traceByKey={};
    var traceByName={};
    var visibleMap={};
    var selectedTrace;
    var noiseTrace;
    var markerList;
    var ip3Points;
    var ip3Result;
    var savedNoiseResults;
    var savedIP3Results;
    var refLines;
    var paneActiveTraceMap={};
    var traceAssignments={};
    if(!preset||!files.length)return null;
    (demoFiles||[]).forEach(function(file){
      var trace=(file.traces&&file.traces[0])||null;
      if(trace)traceByKey[file.key]=trace;
      (file.traces||[]).forEach(function(item){
        traceByName[item.name]=item;
        visibleMap[item.name]=true;
      });
    });
    selectedTrace=traceByKey[preset.selectedTraceKey]||files[0].traces[0]||null;
    noiseTrace=traceByKey[preset.noiseSourceKey]||selectedTrace||null;
    markerList=(preset.markers||[]).map(function(item){
      var trace=traceByKey[item.traceKey];
      var point;
      if(!trace)return null;
      point=nearestPoint(trace,item.freq,null,null);
      if(!point)return null;
      return {
        freq:point.freq,
        amp:point.amp,
        trace:trace.name,
        type:item.type||"peak",
        label:item.label||null
      };
    }).filter(Boolean);
    ip3Points=getIP3PointsFromMarkers(markerList);
    ip3Result=calcIP3FromPoints(ip3Points);
    savedNoiseResults=(preset.savedNoise||[]).map(function(item){
      var trace=traceByKey[item.traceKey];
      var file=(demoFiles||[]).find(function(entry){return entry.key===item.traceKey;})||null;
      return buildSavedNoiseResultFromTrace(trace,file?file.meta:null,item.filter||"gaussian");
    }).filter(Boolean);
    savedIP3Results=(preset.savedIP3||[]).map(function(item){
      var trace=traceByKey[item.traceKey]||selectedTrace;
      if(!trace||!ip3Result)return null;
      return makeSavedIP3Result(ip3Result,ip3Points,item&&item.gain!=null?item.gain:null,{
        traceLabel:trace.dn||trace.name,
        sourceTraceId:trace.id||null,
        sourceTraceName:trace.name,
        roles:buildIP3RoleRefs(ip3Points,function(name){return traceByName[name]||null;})
      });
    }).filter(Boolean);
    refLines=(preset.refLines||[]).map(function(line){
      if(!line||!isFinite(line.value))return null;
      return {
        type:line.type,
        paneId:line.paneId||null,
        groupId:null,
        value:Number(line.value),
        label:line.label||null
      };
    }).filter(Boolean);
    Object.keys(preset.traceAssignments||{}).forEach(function(key){
      var trace=traceByKey[key];
      if(trace)traceAssignments[trace.name]=preset.traceAssignments[key]||"pane-1";
    });
    Object.keys(preset.paneActiveTraceKeys||{}).forEach(function(paneId){
      var trace=traceByKey[preset.paneActiveTraceKeys[paneId]];
      paneActiveTraceMap[paneId]=trace?trace.name:null;
    });
    return normalizeWorkspaceSnapshot({
      version:1,
      files:files,
      derivedTraces:[],
      vis:visibleMap,
      paneMode:preset.paneMode||1,
      activePaneId:preset.activePaneId||"pane-1",
      traceAssignments:traceAssignments,
      paneActiveTraceMap:paneActiveTraceMap,
      xZoomState:{zoomAll:true,sharedZoom:null,paneXZooms:{}},
      yZoomState:{paneYZooms:{}},
      markers:markerList,
      refLines:refLines,
      savedNoise:savedNoiseResults,
      savedIP3:savedIP3Results,
      selectedTraceName:selectedTrace?selectedTrace.name:null,
      ui:{
        showSidebar:preset.showSidebar!==false,
        showMeta:!!preset.showMeta,
        showMarkers:preset.showMarkers!==false,
        showMarkerTools:preset.showMarkerTools!==false,
        showPaneTools:preset.showPaneTools!==false,
        showSearchTools:preset.showSearchTools!==false,
        showLineTools:!!preset.showLineTools,
        showViewTools:preset.showViewTools!==false,
        showDots:false,
        showDT:false,
        lockLinesAcrossPanes:false,
        searchDirection:"right",
        newMarkerArmed:false,
        markerTrace:traceByKey[preset.markerTraceKey]?traceByKey[preset.markerTraceKey].name:(selectedTrace?selectedTrace.name:"__auto__"),
        selectedMkrIdx:markerList.length?0:null,
        dRef:null,
        refMode:null,
        selectedRefLineId:null,
        showTraceOps:false,
        traceOpsOpenSections:{offset:false,scale:false,smoothing:false,subtract:false},
        showAnalysisPanel:!!preset.showAnalysisPanel,
        noiseFilter:(preset.savedNoise&&preset.savedNoise[0]&&preset.savedNoise[0].filter)||"gaussian",
        noiseSource:noiseTrace?noiseTrace.name:null,
        ip3Gain:"",
        dtTrace:selectedTrace?selectedTrace.name:null
      },
      analysisOpenState:preset.analysisOpenState||getDefaultAnalysisOpenState()
    });
  }

  function restoreWorkspaceSnapshot(snapshot,deps){
    var next=normalizeWorkspaceSnapshot(snapshot);
    var activeYZoom;
    var ip3Points;
    var ip3Result;
    deps=deps&&typeof deps==="object"?deps:{};
    if(!next)return null;
    ip3Points=getIP3PointsFromMarkers(next.markers);
    ip3Result=calcIP3FromPoints(ip3Points);
    if(deps.setError)deps.setError(null);
    if(deps.setFiles)deps.setFiles(next.files);
    if(deps.setVis)deps.setVis(next.vis);
    if(deps.setDerivedTraces)deps.setDerivedTraces(next.derivedTraces);
    if(deps.setPaneMode)deps.setPaneMode(next.paneMode);
    if(deps.setActivePaneId)deps.setActivePaneId(next.activePaneId);
    if(deps.setTracePaneMap)deps.setTracePaneMap(next.traceAssignments);
    if(deps.setPaneActiveTrace){
      if(deps.setPaneActiveTraceMap)deps.setPaneActiveTraceMap({});
      Object.keys(next.paneActiveTraceMap||{}).forEach(function(paneId){
        deps.setPaneActiveTrace(paneId,next.paneActiveTraceMap[paneId]);
      });
    } else if(deps.setPaneActiveTraceMap){
      deps.setPaneActiveTraceMap(next.paneActiveTraceMap);
    }
    if(deps.setZoomAllRaw)deps.setZoomAllRaw(!!next.xZoomState.zoomAll);
    if(deps.setSharedZoom)deps.setSharedZoom(next.xZoomState.sharedZoom);
    if(deps.setPaneXZooms)deps.setPaneXZooms(next.xZoomState.paneXZooms);
    if(deps.setPaneYZooms)deps.setPaneYZooms(next.yZoomState.paneYZooms);
    activeYZoom=next.yZoomState.paneYZooms[next.activePaneId]||null;
    if(deps.setYMnI)deps.setYMnI(activeYZoom?activeYZoom.min.toFixed(3):"");
    if(deps.setYMxI)deps.setYMxI(activeYZoom?activeYZoom.max.toFixed(3):"");
    if(deps.setShowSidebar)deps.setShowSidebar(next.ui.showSidebar);
    if(deps.setShowMeta)deps.setShowMeta(next.ui.showMeta);
    if(deps.setShowMarkers)deps.setShowMarkers(next.ui.showMarkers);
    if(deps.setShowMarkerTools)deps.setShowMarkerTools(next.ui.showMarkerTools);
    if(deps.setShowPaneTools)deps.setShowPaneTools(next.ui.showPaneTools);
    if(deps.setShowSearchTools)deps.setShowSearchTools(next.ui.showSearchTools);
    if(deps.setShowLineTools)deps.setShowLineTools(next.ui.showLineTools);
    if(deps.setShowViewTools)deps.setShowViewTools(next.ui.showViewTools);
    if(deps.setShowDots)deps.setShowDots(next.ui.showDots);
    if(deps.setShowDT)deps.setShowDT(next.ui.showDT);
    if(deps.setLockLinesAcrossPanes)deps.setLockLinesAcrossPanes(next.ui.lockLinesAcrossPanes);
    if(deps.setSearchDirection)deps.setSearchDirection(next.ui.searchDirection);
    if(deps.setNewMarkerArmed)deps.setNewMarkerArmed(next.ui.newMarkerArmed);
    if(deps.setMarkerTrace)deps.setMarkerTrace(next.ui.markerTrace);
    if(deps.setSelectedTraceName)deps.setSelectedTraceName(next.selectedTraceName);
    if(deps.setDtTrace)deps.setDtTrace(next.ui.dtTrace);
    if(deps.setDragTraceName)deps.setDragTraceName(null);
    if(deps.setMarkers)deps.setMarkers(next.markers);
    if(deps.setSelectedMkrIdx)deps.setSelectedMkrIdx(next.ui.selectedMkrIdx);
    if(deps.setDRef)deps.setDRef(next.ui.dRef);
    if(deps.setRefMode)deps.setRefMode(next.ui.refMode);
    if(deps.setRefLines)deps.setRefLines(next.refLines);
    if(deps.setSelectedRefLineId)deps.setSelectedRefLineId(next.ui.selectedRefLineId);
    if(deps.setNoiseFilter)deps.setNoiseFilter(next.ui.noiseFilter);
    if(deps.setNoiseSource)deps.setNoiseSource(next.ui.noiseSource);
    if(deps.setNoiseResults)deps.setNoiseResults(next.savedNoise);
    if(deps.resetIP3)deps.resetIP3();
    if(deps.setIP3Pts)deps.setIP3Pts(ip3Points);
    if(deps.setIP3Res)deps.setIP3Res(ip3Result);
    else if(deps.syncIP3FromMarkers)deps.syncIP3FromMarkers(next.markers);
    if(deps.setIP3Gain)deps.setIP3Gain(next.ui.ip3Gain);
    if(deps.setIP3Results)deps.setIP3Results(next.savedIP3);
    if(deps.setShowTraceOps)deps.setShowTraceOps(next.ui.showTraceOps);
    if(deps.setTraceOpsOpenSections)deps.setTraceOpsOpenSections(next.ui.traceOpsOpenSections);
    if(deps.setShowAnalysisPanel)deps.setShowAnalysisPanel(next.ui.showAnalysisPanel);
    if(deps.setAnalysisOpenStateRaw)deps.setAnalysisOpenStateRaw(function(){return next.analysisOpenState;});
    if(deps.syncTraceIdCounter)deps.syncTraceIdCounter(next);
    if(deps.syncParserFileCounter)deps.syncParserFileCounter(next);
    if(deps.syncFileIdCounter)deps.syncFileIdCounter(next);
    return next;
  }

  global.WorkspaceHelpers={
    buildWorkspaceSnapshot:buildWorkspaceSnapshot,
    buildWorkspaceExportPackage:buildWorkspaceExportPackage,
    normalizeWorkspaceSnapshot:normalizeWorkspaceSnapshot,
    restoreWorkspaceSnapshot:restoreWorkspaceSnapshot,
    extractWorkspaceSnapshotFromPackage:extractWorkspaceSnapshotFromPackage,
    buildWorkspaceSnapshotFromDemoPreset:buildWorkspaceSnapshotFromDemoPreset
  };
})(window);
