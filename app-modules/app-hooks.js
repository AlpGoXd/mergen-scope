(function(global){
  var React=global.React;
  var RC=global.Recharts;
  var TM=global.TraceModel||{};
  var TH=global.TraceHelpers||{};
  var TOH=global.TraceOpsHelpers||{};
  var AH=global.AnalysisHelpers||{};
  var FSH=global.FileStoreHelpers||{};
  var PH=global.ParserHelpers||{};
  var MH=global.MarkerHelpers||{};
  var DSH=global.DerivedStateHelpers||{};
  var UH=global.UIHelpers||{};
  var PAH=global.PaneHelpers||{};
  var DW=global.DemoWorkspaces||{};
  var WH=global.WorkspaceHelpers||{};
  var EH=global.ExportHelpers||{};
  var resetTraceIdCounter=TM.resetTraceIdCounter;
  var makeTraceId=TM.makeTraceId;
  var syncTraceIdCounter=TM.syncTraceIdCounter;
  var makeTrace=TM.makeTrace;
  var isRawTrace=TM.isRawTrace;
  var isDerivedTrace=TM.isDerivedTrace;
  var getTraceId=TM.getTraceId;
  var getTraceLabel=TM.getTraceLabel;
  var getTraceSourceIds=TM.getTraceSourceIds;
  var getTraceData=TM.getTraceData;
  var createDerivedTrace=TM.createDerivedTrace;
  var setDerivedTraceYUnit=TM.setDerivedTraceYUnit;
  var normalizeUnitName=TM.normalizeUnitName;
  var isDbRatioUnit=TM.isDbRatioUnit;
  var isLogLevelUnit=TM.isLogLevelUnit;
  var isLogUnit=TM.isLogUnit;
  var resolveTraceMathResultUnit=TM.resolveTraceMathResultUnit;
  var getTraceYUnit=TM.getTraceYUnit;
  var getEffectiveTraceYUnit=TM.getEffectiveTraceYUnit;
  var getYAxisTextForUnit=TM.getYAxisTextForUnit;
  var deriveAxisInfo=TM.deriveAxisInfo;
  var clampYValue=TH.clampYValue;
  var interpolatePointAtX=TH.interpolatePointAtX;
  var getVisibleTraceData=TH.getVisibleTraceData;
  var findHorizontalCrossings=TH.findHorizontalCrossings;
  var getSafeYRangeFromData=TH.getSafeYRangeFromData;
  var sanitizeYDomain=TH.sanitizeYDomain;
  var makeYTicksFromDomain=TH.makeYTicksFromDomain;
  var getPrimaryTickStep=TH.getPrimaryTickStep;
  var makeNiceTicks=TH.makeNiceTicks;
  var computeYWheelZoom=TH.computeYWheelZoom;
  var ampsFromExactMatch=TOH.ampsFromExactMatch;
  var cubicInterpolateSegment=TOH.cubicInterpolateSegment;
  var interpolateAmpAtFreq=TOH.interpolateAmpAtFreq;
  var getOverlapWindow=TOH.getOverlapWindow;
  var getDataInWindow=TOH.getDataInWindow;
  var overlapArraysMatchExactly=TOH.overlapArraysMatchExactly;
  var normalizeOddWindowSize=TOH.normalizeOddWindowSize;
  var medianOfNumbers=TOH.medianOfNumbers;
  var solveLinearSystem=TOH.solveLinearSystem;
  var savitzkyGolayValue=TOH.savitzkyGolayValue;
  var smoothTraceData=TOH.smoothTraceData;
  var applyBinaryTraceMathOp=TOH.applyBinaryTraceMathOp;
  var computeBinaryTraceMathData=TOH.computeBinaryTraceMathData;
  var ENBW=AH.ENBW;
  var noisePSD=AH.noisePSD;
  var calcIP3=AH.calcIP3;
  var calcIP3FromPoints=AH.calcIP3FromPoints;
  var buildIP3RoleRefs=AH.buildIP3RoleRefs;
  var savedResultReferencesTrace=AH.savedResultReferencesTrace;
  var savedResultReferencesAnyTrace=AH.savedResultReferencesAnyTrace;
  var savedResultHasValidTraceRefs=AH.savedResultHasValidTraceRefs;
  var makeSavedNoiseResult=AH.makeSavedNoiseResult;
  var makeSavedIP3Result=AH.makeSavedIP3Result;
  var ATH=global.AnalysisTargetHelpers||{};
  var getDefaultAnalysisOpenState=ATH.getDefaultAnalysisOpenState;
  var normalizeAnalysisOpenState=ATH.normalizeAnalysisOpenState;
  var setAnalysisOpenState=ATH.setAnalysisOpenState;
  var clearAllAnalysisOpenState=ATH.clearAllAnalysisOpenState;
  var makeAnalysisRegistry=ATH.makeAnalysisRegistry;
  var getAnalysisItem=ATH.getAnalysisItem;
  var getAnalysisColor=ATH.getAnalysisColor;
  var isPowerLikeAbsoluteUnit=ATH.isPowerLikeAbsoluteUnit;
  var isSpectralPowerDensityUnit=ATH.isSpectralPowerDensityUnit;
  var resolveAnalysisTarget=ATH.resolveAnalysisTarget;
  var resolveSelectedHorizontalLine=ATH.resolveSelectedHorizontalLine;
  var traceSig=FSH.traceSig;
  var dedupeParsedTraces=FSH.dedupeParsedTraces;
  var fileSig=FSH.fileSig;
  var dedupeFiles=FSH.dedupeFiles;
  var mergeFileLists=FSH.mergeFileLists;
  var normalizeTraceData=FSH.normalizeTraceData;
  var resetParserFileCounter=PH.resetParserFileCounter;
  var syncParserFileCounter=PH.syncParserFileCounter;
  var nearestPoint=PH.nearestPoint;
  var parseRSDat=PH.parseRSDat;
  var IP3_ROLE_KEYS=MH.IP3_ROLE_KEYS;
  var IP3_ROLE_LABELS=MH.IP3_ROLE_LABELS;
  var isIP3Label=MH.isIP3Label;
  var cloneMarkerWithoutIP3Label=MH.cloneMarkerWithoutIP3Label;
  var getIP3PointsFromMarkers=MH.getIP3PointsFromMarkers;
  var getVisibleDataForTrace=MH.getVisibleDataForTrace;
  var buildExtrema=MH.buildExtrema;
  var isLocalExtremum=MH.isLocalExtremum;
  var nearestIndexByFreq=MH.nearestIndexByFreq;
  var findHighestPeakExcluding=MH.findHighestPeakExcluding;
  var findPeakNearFreq=MH.findPeakNearFreq;
  var reconcileDerivedTraceGraph=DSH.reconcileDerivedTraceGraph;
  var fmtF=UH.fmtF;
  var clampPaneCount=PAH.clampPaneCount;
  var buildPanes=PAH.buildPanes;
  var normalizeTracePaneMap=PAH.normalizeTracePaneMap;
  var getTracePaneId=PAH.getTracePaneId;
  var getPaneTraces=PAH.getPaneTraces;
  var normalizePaneActiveTraceMap=PAH.normalizePaneActiveTraceMap;
  var clearPaneAssignments=PAH.clearPaneAssignments;
  var getAlternatePaneId=PAH.getAlternatePaneId;
  var getPaneAutoYDomain=PAH.getPaneAutoYDomain;
  var h=React.createElement;
  var useState=React.useState,useCallback=React.useCallback,useRef=React.useRef,
      useMemo=React.useMemo,useEffect=React.useEffect;
  var CHART_MARGIN_TOP=8,CHART_MARGIN_RIGHT=12,CHART_MARGIN_BOTTOM=24,CHART_MARGIN_LEFT=0,CHART_Y_AXIS_WIDTH=56;
  var CHART_PLOT_LEFT=CHART_MARGIN_LEFT+CHART_Y_AXIS_WIDTH;
  var _fid=0;function getDemoWorkspacePresetById(id){
  var presets=DW.presets||{};
  return id&&presets[id]?presets[id]:null;
}

function getDemoLaunchPresetId(){
  try{
    var params=new URLSearchParams(window.location.search||"");
    return params.get("demo")||null;
  }catch(e){
    return null;
  }
}

function clearDemoLaunchQueryParam(){
  try{
    if(!window.history||!window.history.replaceState||!window.location)return false;
    var url=new URL(window.location.href);
    if(!url.searchParams.has("demo"))return false;
    url.searchParams.delete("demo");
    var search=url.search?url.search:"";
    var next=url.pathname+search+(url.hash||"");
    window.history.replaceState(null,"",next||window.location.pathname||"");
    return true;
  }catch(e){
    return false;
  }
}

function buildBundledDemoFiles(preset){
  var filesByKey=DW.files||{};
  var order=preset&&Array.isArray(preset.fileOrder)?preset.fileOrder:[];
  return order.map(function(key,idx){
    var def=filesByKey[key];
    if(!def||!def.text)return null;
    var sourceFileName=def.sourceFileName||def.fileName||("demo-"+(idx+1)+".DAT");
    var parsed=parseRSDat(def.text,sourceFileName);
    var traces=(parsed.traces||[]).map(function(trace,traceIdx){
      var next=Object.assign({},trace);
      next.file=def.fileName||sourceFileName;
      if(traceIdx===0&&def.traceLabel)next.dn=def.traceLabel;
      return next;
    });
    return {
      id:"demo-file-"+(idx+1),
      key:key,
      fileName:def.fileName||sourceFileName,
      meta:parsed.meta||{},
      traces:traces
    };
  }).filter(Boolean);
}

function useYControls(activePaneId){
  var _yz=useState({}),paneYZooms=_yz[0],setPaneYZooms=_yz[1];
  var _yMn=useState(""),yMnI=_yMn[0],setYMnI=_yMn[1];
  var _yMx=useState(""),yMxI=_yMx[0],setYMxI=_yMx[1];
  var paneYZoomsRef=useRef({});
  var suppressInputCommitRef=useRef(false);
  var paneId=activePaneId||"pane-1";
  var yZoom=paneYZooms[paneId]||null;
  useEffect(function(){
    paneYZoomsRef.current=paneYZooms||{};
  },[paneYZooms]);
  var setYZoom=useCallback(function(next,forPaneId){
    var target=forPaneId||activePaneId||"pane-1";
    setPaneYZooms(function(prev){
      var nextMap=Object.assign({},prev||{});
      if(!next)delete nextMap[target];
      else nextMap[target]=next;
      paneYZoomsRef.current=nextMap;
      return nextMap;
    });
  },[activePaneId]);
  var getPaneYZoom=useCallback(function(forPaneId){
    var target=forPaneId||activePaneId||"pane-1";
    return sanitizeYDomain((paneYZoomsRef.current||{})[target])||null;
  },[activePaneId]);
  var applyYZ=useCallback(function(){
    var mn=parseFloat(yMnI),mx=parseFloat(yMxI);
    var next=sanitizeYDomain({min:mn,max:mx});
    if(next)setYZoom(next);
  },[yMnI,yMxI,setYZoom]);
  useEffect(function(){
    if(suppressInputCommitRef.current){
      suppressInputCommitRef.current=false;
      return;
    }
    var mn=parseFloat(yMnI),mx=parseFloat(yMxI);
    if(!isNaN(mn)&&!isNaN(mx)&&mn<mx){
      var next=sanitizeYDomain({min:mn,max:mx});
      if(next)setYZoom(next);
    }
  },[yMnI,yMxI]);
  var resetYZ=useCallback(function(forPaneId){
    setYZoom(null,forPaneId);
    if(!forPaneId||forPaneId===paneId){setYMnI("");setYMxI("");}
  },[setYZoom,paneId]);
  var syncYInputs=useCallback(function(next){
    if(!next||!isFinite(next.min)||!isFinite(next.max))return;
    setYZoom(next);
    suppressInputCommitRef.current=true;
    setYMnI(next.min.toFixed(3));
    setYMxI(next.max.toFixed(3));
  },[setYZoom]);
  var syncYInputsForPane=useCallback(function(next,forPaneId){
    if(!next||!isFinite(next.min)||!isFinite(next.max))return;
    setYZoom(next,forPaneId);
    if(!forPaneId||forPaneId===paneId){
      suppressInputCommitRef.current=true;
      setYMnI(next.min.toFixed(3));
      setYMxI(next.max.toFixed(3));
    }
  },[setYZoom,paneId]);
  var clearAllPaneYZooms=useCallback(function(){
    paneYZoomsRef.current={};
    setPaneYZooms({});
    setYMnI("");
    setYMxI("");
  },[]);
  useEffect(function(){
    if(yZoom&&isFinite(yZoom.min)&&isFinite(yZoom.max)){
      suppressInputCommitRef.current=true;
      setYMnI(yZoom.min.toFixed(3));
      setYMxI(yZoom.max.toFixed(3));
    } else {
      suppressInputCommitRef.current=true;
      setYMnI("");
      setYMxI("");
    }
  },[paneId,yZoom]);
  useEffect(function(){
    var next=yZoom;
    if(!next||!isFinite(next.min)||!isFinite(next.max)){
      suppressInputCommitRef.current=true;
      setYMnI("");
      setYMxI("");
      return;
    }
    suppressInputCommitRef.current=true;
    setYMnI(next.min.toFixed(3));
    setYMxI(next.max.toFixed(3));
  },[paneId,yZoom]);
  return {yZoom:yZoom,setYZoom:setYZoom,getPaneYZoom:getPaneYZoom,paneYZooms:paneYZooms,setPaneYZooms:setPaneYZooms,clearAllPaneYZooms:clearAllPaneYZooms,yMnI:yMnI,setYMnI:setYMnI,yMxI:yMxI,setYMxI:setYMxI,applyYZ:applyYZ,resetYZ:resetYZ,syncYInputs:syncYInputs,syncYInputsForPane:syncYInputsForPane};
}

function useXControls(activePaneId, panes){
  var _za=useState(true),zoomAll=_za[0],setZoomAllRaw=_za[1];
  var _sz=useState(null),sharedZoom=_sz[0],setSharedZoom=_sz[1];
  var _pz=useState({}),paneXZooms=_pz[0],setPaneXZooms=_pz[1];
  useEffect(function(){
    var paneIds=(panes||[]).map(function(pane){return pane.id;});
    setPaneXZooms(function(prev){
      var next={},changed=false;
      Object.keys(prev||{}).forEach(function(key){
        if(paneIds.indexOf(key)!==-1)next[key]=prev[key];
        else changed=true;
      });
      return changed?next:prev;
    });
  },[panes]);
  var zoom=zoomAll?sharedZoom:(paneXZooms[activePaneId]||null);
  var setZoom=useCallback(function(nextOrUpdater,forPaneId){
    if(zoomAll){
      setSharedZoom(function(prev){return typeof nextOrUpdater==="function"?nextOrUpdater(prev):nextOrUpdater;});
      return;
    }
    var paneId=forPaneId||activePaneId||"pane-1";
    setPaneXZooms(function(prev){
      var current=(prev&&prev[paneId])||null;
      var nextValue=typeof nextOrUpdater==="function"?nextOrUpdater(current):nextOrUpdater;
      var next=Object.assign({},prev||{});
      if(nextValue&&isFinite(nextValue.left)&&isFinite(nextValue.right)&&nextValue.right>nextValue.left)next[paneId]=nextValue;
      else delete next[paneId];
      return next;
    });
  },[zoomAll,activePaneId]);
  var getPaneZoom=useCallback(function(paneId){
    return zoomAll?sharedZoom:((paneXZooms&&paneXZooms[paneId])||null);
  },[zoomAll,sharedZoom,paneXZooms]);
  var clearAllXZooms=useCallback(function(){
    setSharedZoom(null);
    setPaneXZooms({});
  },[]);
  var setZoomAll=useCallback(function(nextValue){
    var target=typeof nextValue==="function"?nextValue(zoomAll):!!nextValue;
    if(target===zoomAll)return;
    if(target){
      var activeZoom=(paneXZooms&&paneXZooms[activePaneId])||sharedZoom||null;
      setSharedZoom(activeZoom);
    } else {
      var base=sharedZoom;
      setPaneXZooms(function(prev){
        var next=Object.assign({},prev||{});
        (panes||[]).forEach(function(pane){
          if(base&&isFinite(base.left)&&isFinite(base.right)&&base.right>base.left)next[pane.id]=base;
          else delete next[pane.id];
        });
        return next;
      });
    }
    setZoomAllRaw(target);
  },[zoomAll,paneXZooms,activePaneId,sharedZoom,panes]);
  return {zoomAll:zoomAll,setZoomAll:setZoomAll,setZoomAllRaw:setZoomAllRaw,zoom:zoom,setZoom:setZoom,sharedZoom:sharedZoom,setSharedZoom:setSharedZoom,paneXZooms:paneXZooms,setPaneXZooms:setPaneXZooms,getPaneZoom:getPaneZoom,clearAllXZooms:clearAllXZooms};
}

function useFileStore(dep){
  var _f=useState([]),files=_f[0],setFiles=_f[1];
  var _e=useState(null),error=_e[0],setError=_e[1];
  var _v=useState({}),vis=_v[0],setVis=_v[1];

  var allTr=useMemo(function(){return files.flatMap(function(f){return f.traces;});},[files]);
  var fileMap=useMemo(function(){
    var m={};
    files.forEach(function(f){m[f.id]=f;});
    return m;
  },[files]);
  var m0=files.length>0?files[0].meta:{};

  var loadFiles=useCallback(function(fl,append){
    var arr=Array.from(fl).filter(function(f){return/\.(dat|csv|txt)$/i.test(f.name);});
    if(!arr.length)return;
    var pending=arr.length,results=[];
    arr.forEach(function(file){
      var reader=new FileReader();
      reader.onload=function(ev){
        try{
          var parsed=parseRSDat(ev.target.result,file.name);
          if(parsed.traces.length===0)setError(function(p){return(p?p+" | ":"")+file.name+": no data";});
          else{
            var fileId=++_fid;
            parsed.traces.forEach(function(tr){tr.fileId=fileId;tr.fileName=file.name;});
            results.push({id:fileId,fileName:file.name,meta:parsed.meta,traces:parsed.traces});
          }
        }catch(e){setError(function(p){return(p?p+" | ":"")+file.name+": "+e.message;});}
        pending--;
        if(pending===0){
          results=dedupeFiles(results);
          var existingSigs=new Set((append?files:[]).map(fileSig));
          var existingNames=new Set((append?files:[]).map(function(f){return String(f.fileName||"").toLowerCase()+"|"+((f.traces||[]).length||0);}));
          var newResults=results.filter(function(r){
            var sig=fileSig(r);
            var nk=String(r.fileName||"").toLowerCase()+"|"+((r.traces||[]).length||0);
            if(!sig||existingSigs.has(sig))return false;
            if(existingNames.has(nk) && append)return false;
            existingSigs.add(sig);
            existingNames.add(nk);
            return true;
          });
          var nv={};newResults.forEach(function(r){r.traces.forEach(function(t){nv[t.name]=true;});});
          if(append){
            if(!newResults.length){
              setError(function(p){return(p?p+" | ":"")+"No new unique files were added.";});
              return;
            }
            setFiles(function(p){return mergeFileLists(p,newResults);});
            setVis(function(p){return Object.assign({},p,nv);});
          }
          else{
            setFiles(newResults);setVis(nv);dep.clearMarkers();dep.setZoom(null);dep.setYZoom(null);dep.setDRef(null);setError(null);
            dep.setRefLines([]);dep.setRefMode(null);dep.resetIP3();
            dep.setNoiseResults([]);dep.setIP3Results([]);dep.setYMnI("");dep.setYMxI("");
          }
          var fn=newResults[0]?.traces?.[0]?.name;
          if(!append||!dep.dtTrace)dep.setDtTrace(fn||null);
          if(!append||!dep.noiseSource)dep.setNoiseSource(fn||null);
        }
      };reader.readAsText(file);
    });
  },[dep.dtTrace,dep.noiseSource,files,dep]);

  var onDrop=useCallback(function(ev){ev.preventDefault();dep.setIsDrag(false);
    if(!isFileDragEvent(ev))return;
    if(ev.dataTransfer.files.length)loadFiles(ev.dataTransfer.files,files.length>0);
  },[loadFiles,files.length,dep]);

  var removeFile=useCallback(function(fileId){
    setFiles(function(p){
      var rm=p.find(function(f){return f.id===fileId;});if(!rm)return p;
      var rmN=rm.traces.map(function(t){return t.name;});
      var rmIds=rm.traces.map(function(t){return getTraceId(t);}).filter(Boolean);
      setVis(function(v){var nv=Object.assign({},v);rmN.forEach(function(n){delete nv[n];});return nv;});
      dep.setMarkers(function(m){return m.filter(function(mk){return rmN.indexOf(mk.trace)===-1;});});
      if(dep.dRef!=null&&rmN.indexOf(dep.markers[dep.dRef]?.trace)!==-1)dep.setDRef(null);
      dep.setNoiseResults(function(lst){return lst.filter(function(r){return !savedResultReferencesAnyTrace(r,rmIds,rmN);});});
      dep.setIP3Results(function(lst){return lst.filter(function(r){return !savedResultReferencesAnyTrace(r,rmIds,rmN);});});
      var next=p.filter(function(f){return f.id!==fileId;});
      if(rmN.indexOf(dep.dtTrace)!==-1){var rem=next.flatMap(function(f){return f.traces;});dep.setDtTrace(rem[0]?.name||null);}
      if(rmN.indexOf(dep.noiseSource)!==-1){var rem2=next.flatMap(function(f){return f.traces;});dep.setNoiseSource(rem2[0]?.name||null);}
      return next;
    });
  },[dep]);

  var removeTrace=useCallback(function(traceName){
    var doomed=null;
    files.some(function(f){
      doomed=(f.traces||[]).find(function(t){return t.name===traceName;})||null;
      return !!doomed;
    });
    var doomedId=doomed?getTraceId(doomed):null;
    setFiles(function(prev){
      var next=[];
      prev.forEach(function(f){
        var kept=f.traces.filter(function(t){return t.name!==traceName;});
        if(kept.length)next.push(Object.assign({},f,{traces:kept}));
      });
      return next;
    });
    setVis(function(v){var nv=Object.assign({},v);delete nv[traceName];return nv;});
    dep.setMarkers(function(m){return m.filter(function(mk){return mk.trace!==traceName;});});
    dep.setNoiseResults(function(lst){return lst.filter(function(r){return !savedResultReferencesTrace(r,doomedId,traceName);});});
    dep.setIP3Results(function(lst){return lst.filter(function(r){return !savedResultReferencesTrace(r,doomedId,traceName);});});
    if(dep.dtTrace===traceName)dep.setDtTrace(null);
    if(dep.noiseSource===traceName)dep.setNoiseSource(null);
    if(dep.dRef!=null&&dep.markers[dep.dRef]&&dep.markers[dep.dRef].trace===traceName)dep.setDRef(null);
  },[dep,files]);

  var clearAllFiles=useCallback(function(){
    resetParserFileCounter();_fid=0;resetTraceIdCounter();
    dep.panRef.current=null;
    dep.suppressClickRef.current=false;
    setFiles([]);dep.clearMarkers();dep.setZoom(null);dep.setYZoom(null);dep.setShowDT(false);setError(null);setVis({});
    dep.setShowSidebar(true);dep.setShowMeta(true);dep.setShowMarkers(true);
    dep.setShowNoise(false);dep.setShowIP3(false);dep.resetIP3();dep.setRefLines([]);dep.setRefMode(null);dep.setYMnI("");dep.setYMxI("");dep.setNoiseResults([]);dep.setIP3Results([]);
  },[dep]);

  return {files:files,setFiles:setFiles,error:error,setError:setError,vis:vis,setVis:setVis,allTr:allTr,fileMap:fileMap,m0:m0,loadFiles:loadFiles,onDrop:onDrop,removeFile:removeFile,removeTrace:removeTrace,clearAllFiles:clearAllFiles};
}

function useChartNav(dep){
  var zoom=dep.zoom||null,setZoom=dep.setZoom;
  var _sA=useState(null),selA=_sA[0],setSelA=_sA[1];
  var _sB=useState(null),selB=_sB[0],setSelB=_sB[1];
  var hoverX=dep.crosshair.hoverX,setHoverX=dep.crosshair.setHoverX;
  var hoverData=dep.crosshair.hoverData,setHoverData=dep.crosshair.setHoverData;
  var getActivePaneModel=useCallback(function(){
    return dep.getActivePaneModel?dep.getActivePaneModel():null;
  },[dep.getActivePaneModel]);
  var getActivePaneYZoom=useCallback(function(){
    return dep.getActivePaneYZoom?dep.getActivePaneYZoom():null;
  },[dep.getActivePaneYZoom]);
  var getActivePaneTraces=useCallback(function(){
    var model=getActivePaneModel();
    return model&&Array.isArray(model.traces)?model.traces:[];
  },[getActivePaneModel]);
  var getActivePaneData=useCallback(function(){
    var model=getActivePaneModel();
    return model&&Array.isArray(model.cData)?model.cData:[];
  },[getActivePaneModel]);
  var getActivePaneFDiv=useCallback(function(){
    var model=getActivePaneModel();
    return model&&isFinite(model.fDiv)&&model.fDiv>0?model.fDiv:1;
  },[getActivePaneModel]);
  var getPaneEventFreq=useCallback(function(ev){
    var paneFDiv=getActivePaneFDiv();
    if(ev&&ev.activePayload&&ev.activePayload[0]&&ev.activePayload[0].payload&&isFinite(ev.activePayload[0].payload.freq))return ev.activePayload[0].payload.freq;
    if(ev&&isFinite(ev.activeLabel))return ev.activeLabel*paneFDiv;
    return null;
  },[getActivePaneFDiv]);

  var getXDomain=useCallback(function(){
    var mn=Infinity,mx=-Infinity;
    (dep.xAllTr||dep.allTr).forEach(function(tr){
      if(!tr||!tr.data||!tr.data.length)return;
      var first=tr.data[0],last=tr.data[tr.data.length-1];
      if(isFinite(first.freq)&&first.freq<mn)mn=first.freq;
      if(isFinite(last.freq)&&last.freq>mx)mx=last.freq;
    });
    return (isFinite(mn)&&isFinite(mx)&&mx>mn)?{min:mn,max:mx}:null;
  },[dep.xAllTr,dep.allTr]);

  var panXWindow=useCallback(function(dxHz){
    if(!zoom)return;
    var dom=getXDomain(); if(!dom)return;
    var span=zoom.right-zoom.left; if(!(isFinite(span)&&span>0))return;
    var nextLeft=zoom.left-dxHz, nextRight=zoom.right-dxHz;
    if(nextLeft<dom.min){ nextLeft=dom.min; nextRight=dom.min+span; }
    if(nextRight>dom.max){ nextRight=dom.max; nextLeft=dom.max-span; }
    if(nextLeft<dom.min)nextLeft=dom.min;
    if(nextRight>dom.max)nextRight=dom.max;
    if(!(isFinite(nextLeft)&&isFinite(nextRight)&&nextRight>nextLeft))return;
    setZoom({left:nextLeft,right:nextRight});
  },[zoom,getXDomain]);

  var getMouseBtn=useCallback(function(ev){
    if(ev&&typeof ev.button==="number")return ev.button;
    if(ev&&ev.nativeEvent&&typeof ev.nativeEvent.button==="number")return ev.nativeEvent.button;
    return dep.mouseBtnRef.current||0;
  },[dep.mouseBtnRef]);

  var getXDomainHz=useCallback(function(){
    if(zoom&&isFinite(zoom.left)&&isFinite(zoom.right)&&zoom.right>zoom.left)return {left:zoom.left,right:zoom.right};
    var paneData=getActivePaneData();
    if(paneData&&paneData.length){
      var a=paneData[0]?.freq,b=paneData[paneData.length-1]?.freq;
      if(isFinite(a)&&isFinite(b)&&b>a)return {left:a,right:b};
    }
    var act=getActivePaneTraces().filter(function(t){return dep.vis[t.name]&&t.data&&t.data.length;});
    if(!act.length)return null;
    var mn=Infinity,mx=-Infinity;
    act.forEach(function(tr){mn=Math.min(mn,tr.data[0].freq);mx=Math.max(mx,tr.data[tr.data.length-1].freq);});
    return (isFinite(mn)&&isFinite(mx)&&mx>mn)?{left:mn,right:mx}:null;
  },[zoom,getActivePaneData,getActivePaneTraces,dep.vis]);

  var freqFromClientX=useCallback(function(clientX){
    var el=dep.chartRef.current;if(!el)return null;
    var rect=el.getBoundingClientRect();
    var marginLeft=CHART_PLOT_LEFT, marginRight=CHART_MARGIN_RIGHT;
    var w=rect.width-marginLeft-marginRight;
    if(!(isFinite(w)&&w>20))return null;
    var x=clientX-rect.left-marginLeft;
    if(x<0)x=0; if(x>w)x=w;
    var dom=getXDomainHz(); if(!dom)return null;
    var frac=x/w;
    return dom.left + frac*(dom.right-dom.left);
  },[dep.chartRef,getXDomainHz]);

  var chartMM=useCallback(function(ev){
    var pan=dep.panRef.current;
    if(pan&&pan.mode==="x-pan")return;
    if(!ev){
      if(!(pan&&pan.mode==="x-zoom")){setHoverX(null);setHoverData(null);}
      return;
    }
    var f=getPaneEventFreq(ev);
    if(!isFinite(f)&&ev&&ev.nativeEvent&&isFinite(ev.nativeEvent.clientX))f=freqFromClientX(ev.nativeEvent.clientX);
    if(!isFinite(f)){
      if(!(pan&&pan.mode==="x-zoom")){setHoverX(null);setHoverData(null);}
      return;
    }

    if(pan&&ev.activeLabel!=null&&pan.mode==="x-zoom"){
      if(Math.abs(ev.activeLabel-pan.startLabel)>=2)pan.didMove=true;
      return;
    }

    setHoverX(f);
    var vals=[];
    getActivePaneTraces().forEach(function(tr,i){
      if(!dep.vis[tr.name])return;
      var np=nearestPoint(tr,f,zoom?zoom.left:null,zoom?zoom.right:null);
      if(np&&isFinite(np.amp))vals.push({name:tr.dn||tr.name,value:np.amp,color:dep.colors[i%dep.colors.length],freq:np.freq});
    });
    vals.sort(function(a,b){return a.name.localeCompare(b.name);});
    setHoverData(vals);
  },[dep.panRef,getPaneEventFreq,freqFromClientX,getActivePaneTraces,dep.vis,dep.colors,zoom]);

  var chartML=useCallback(function(){
    var pan=dep.panRef.current;
    if(pan&&pan.mode==="x-pan")return;
    setHoverX(null);setHoverData(null);
  },[dep.panRef]);

  useEffect(function(){
    var onMove=function(ev){
      var pan=dep.panRef.current;
      if(!pan|| (pan.mode!=="x-pan" && pan.mode!=="x-zoom"))return;
      var f=freqFromClientX(ev.clientX);
      if(f==null)return;
      if(pan.mode==="x-pan"){
        var span=pan.startZoom.right-pan.startZoom.left;
        if(!(isFinite(span)&&span>0))return;
        if(pan.lockY)dep.syncYInputs(pan.lockY);
        var el=dep.chartRef.current;if(!el)return;
        var rect=el.getBoundingClientRect();
        var plotW=rect.width-CHART_PLOT_LEFT-CHART_MARGIN_RIGHT;
        if(!(isFinite(plotW)&&plotW>20))return;
        var dxPx=ev.clientX-pan.startClientX;
        var dxHz=-(dxPx/plotW)*span;
        if(Math.abs(dxPx)>=2)pan.didMove=true;
        var dom=getXDomain(); if(!dom)return;
        var left=pan.startZoom.left+dxHz, right=pan.startZoom.right+dxHz;
        if(left<dom.min){right+=dom.min-left;left=dom.min;}
        if(right>dom.max){left-=right-dom.max;right=dom.max;}
        if(isFinite(left)&&isFinite(right)&&right>left)setZoom({left:left,right:right});
        } else {
          var el=dep.chartRef.current;if(!el)return;
          var rect=el.getBoundingClientRect();
          var plotW=rect.width-CHART_PLOT_LEFT-CHART_MARGIN_RIGHT;
          if(!(isFinite(plotW)&&plotW>20))return;
        var x=ev.clientX-rect.left-CHART_PLOT_LEFT;
        if(x<0)x=0; if(x>plotW)x=plotW;
        var domHz=getXDomainHz(); if(!domHz)return;
        var frac=x/plotW;
          var nextFreq=domHz.left + frac*(domHz.right-domHz.left);
          if(!isFinite(nextFreq))return;
          if(Math.abs(ev.clientX-pan.startClientX)>=2)pan.didMove=true;
          pan.currentLabel=nextFreq/(pan.fDiv||1);
          setSelB(pan.currentLabel);
        }
      };
      var onUp=function(){
        var pan=dep.panRef.current;
        if(!pan)return;
        if(pan.mode==="x-pan"){
          if(pan.didMove)dep.suppressClickRef.current=true;
        } else if(pan.mode==="x-zoom"){
          var finalSelA=pan.startLabel;
          var finalSelB=pan.currentLabel;
          if(pan.didMove&&finalSelA!=null&&finalSelB!=null&&finalSelA!==finalSelB){
            dep.suppressClickRef.current=true;
            setZoom({left:Math.min(finalSelA,finalSelB)*(pan.fDiv||1),right:Math.max(finalSelA,finalSelB)*(pan.fDiv||1)});
          }
          setSelA(null); setSelB(null);
        }
        dep.panRef.current=null;
        dep.mouseBtnRef.current=0;
    };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return function(){window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[dep.panRef,dep.suppressClickRef,dep.mouseBtnRef,freqFromClientX,getXDomain,getXDomainHz,selA,selB,dep.syncYInputs]);

  useEffect(function(){
    var el=dep.chartRef.current;if(!el)return;
    var isInteractiveTarget=function(target){
      if(!target||!target.closest)return false;
      return !!target.closest('input,button,select,textarea,label,[role="button"],.crosshair-readout');
    };
    var handler=function(ev){
      if(isInteractiveTarget(ev.target))return;
      var rect=el.getBoundingClientRect();
      if(!rect||rect.width<=0||rect.height<=0)return;
      var plotTop=CHART_MARGIN_TOP;
      var plotBottom=Math.max(plotTop+20,rect.height-CHART_MARGIN_BOTTOM);
      var plotHeight=plotBottom-plotTop;
      var yPx=ev.clientY-rect.top;
      if(yPx<plotTop||yPx>plotBottom)return;
      var autoRange=getSafeYRangeFromData(getActivePaneTraces(),dep.vis,zoom);
      if(!autoRange)return;
      var base=getActivePaneYZoom()||autoRange;
      if(!base)return;
      ev.preventDefault();
      if(ev.shiftKey){
        var span=base.max-base.min;
        if(!(isFinite(span)&&span>0))return;
        var step=getPrimaryTickStep(makeYTicksFromDomain(base),span);
        if(!(isFinite(step)&&step>0))return;
        var delta=ev.deltaY>0 ? -step : step;
        var next=sanitizeYDomain({min:base.min+delta,max:base.max+delta});
        if(!next)return;
        dep.syncYInputs(next);
        return;
      }
      var frac=1-((yPx-plotTop)/plotHeight);
      var next=computeYWheelZoom(base,ev.deltaY,frac,autoRange);
      if(!next)return;
      dep.syncYInputs(next);
    };
    el.addEventListener("wheel",handler,{passive:false});
    return function(){el.removeEventListener("wheel",handler);};
  },[dep.chartRef,getActivePaneTraces,getActivePaneYZoom,dep.vis,dep.syncYInputs,zoom]);

  var onChartContainerMouseDownCapture=useCallback(function(ev){
    dep.mouseBtnRef.current=ev.button;
    if(ev.button===1){ev.preventDefault();setZoom(null);if(dep.resetY)dep.resetY();return;}
    if(ev.button===2){
      ev.preventDefault();
      var f=freqFromClientX(ev.clientX);
      if(f==null)return;
      var paneFDiv=getActivePaneFDiv();
      if(zoom){
        var freezeY=getActivePaneYZoom()||getSafeYRangeFromData(getActivePaneTraces(),dep.vis,zoom);
        if(freezeY)dep.syncYInputs(freezeY);
        dep.panRef.current={mode:"x-pan",startFreq:f,startLabel:f/paneFDiv,startClientX:ev.clientX,startZoom:zoom,didMove:false,lockY:freezeY||null,fDiv:paneFDiv};
        }else{
          setSelA(f/paneFDiv); setSelB(f/paneFDiv);
          dep.panRef.current={mode:"x-zoom",startFreq:f,startLabel:f/paneFDiv,currentLabel:f/paneFDiv,startClientX:ev.clientX,didMove:false,fDiv:paneFDiv};
        }
      }
  },[dep.mouseBtnRef,dep.panRef,freqFromClientX,zoom,getActivePaneFDiv,getActivePaneYZoom,getActivePaneTraces,dep.vis,dep.syncYInputs,dep.resetY]);

  var onChartContainerMouseUpCapture=useCallback(function(){dep.mouseBtnRef.current=0;},[dep.mouseBtnRef]);

  return {zoom:zoom,setZoom:setZoom,selA:selA,setSelA:setSelA,selB:selB,setSelB:setSelB,hoverX:hoverX,hoverData:hoverData,getMouseBtn:getMouseBtn,getXDomain:getXDomain,getXDomainHz:getXDomainHz,freqFromClientX:freqFromClientX,panXWindow:panXWindow,chartMM:chartMM,chartML:chartML,onChartContainerMouseDownCapture:onChartContainerMouseDownCapture,onChartContainerMouseUpCapture:onChartContainerMouseUpCapture,mDown:function(){},mUp:function(){}};
}


function useCrosshair(){
  var _hx=useState(null),hoverX=_hx[0],setHoverX=_hx[1];
  var _hd=useState(null),hoverData=_hd[0],setHoverData=_hd[1];
  var clear=useCallback(function(){setHoverX(null);setHoverData(null);},[]);
  return {hoverX:hoverX,setHoverX:setHoverX,hoverData:hoverData,setHoverData:setHoverData,clear:clear};
}

function useSharedCursor(){
  var base=useCrosshair();
  var setSharedCursor=useCallback(function(freq,rows){
    base.setHoverX(isFinite(freq)?freq:null);
    base.setHoverData(Array.isArray(rows)?rows:null);
  },[base.setHoverX,base.setHoverData]);
  var clearSharedCursor=useCallback(function(){base.clear();},[base.clear]);
  return {hoverX:base.hoverX,hoverData:base.hoverData,setHoverX:base.setHoverX,setHoverData:base.setHoverData,setSharedCursor:setSharedCursor,clearSharedCursor:clearSharedCursor,clear:base.clear};
}

function isFileDragEvent(ev){
  var dt=ev&&ev.dataTransfer;
  if(!dt||!dt.types)return false;
  var types=Array.from(dt.types);
  return types.indexOf("Files")!==-1 && types.indexOf("text/trace-name")===-1;
}

function usePaneLayout(allTr){
  var _pc=useState(1),paneCount=_pc[0],setPaneCount=_pc[1];
  var panes=useMemo(function(){return buildPanes(paneCount);},[paneCount]);
  var _ap=useState("pane-1"),activePaneId=_ap[0],setActivePaneId=_ap[1];
  var _tm=useState({}),tracePaneMap=_tm[0],setTracePaneMap=_tm[1];
  var _pat=useState({}),paneActiveTraceMap=_pat[0],setPaneActiveTraceMap=_pat[1];
  function sameMap(a,b){
    var aKeys=Object.keys(a||{});
    var bKeys=Object.keys(b||{});
    if(aKeys.length!==bKeys.length)return false;
    for(var i=0;i<aKeys.length;i++){
      var key=aKeys[i];
      if(!Object.prototype.hasOwnProperty.call(b||{},key))return false;
      if((a||{})[key]!==((b||{})[key]))return false;
    }
    return true;
  }
  useEffect(function(){
    setTracePaneMap(function(prev){
      var next=normalizeTracePaneMap(allTr,prev,panes);
      return sameMap(prev,next)?prev:next;
    });
  },[allTr,panes]);
  useEffect(function(){
    setPaneActiveTraceMap(function(prev){
      var next=normalizePaneActiveTraceMap(allTr,tracePaneMap,panes,prev);
      return sameMap(prev,next)?prev:next;
    });
  },[allTr,tracePaneMap,panes]);
  useEffect(function(){
    var valid=panes.some(function(pane){return pane.id===activePaneId;});
    if(!valid)setActivePaneId("pane-1");
  },[panes,activePaneId]);
  var setPaneMode=useCallback(function(next){
    setPaneCount(clampPaneCount(next));
  },[]);
  var assignTraceToPane=useCallback(function(traceName,paneId){
    if(!traceName||!paneId)return;
    setTracePaneMap(function(prev){
      var next=Object.assign({},prev||{});
      next[traceName]=paneId;
      return next;
    });
    setPaneActiveTraceMap(function(prev){
      var next=Object.assign({},prev||{});
      next[paneId]=traceName;
      return next;
    });
  },[]);
  var clearPane=useCallback(function(paneId){
    if(panes.length<2)return;
    var target=getAlternatePaneId(panes,paneId);
    setTracePaneMap(function(prev){return clearPaneAssignments(prev,paneId,target);});
    setPaneActiveTraceMap(function(prev){
      var next=Object.assign({},prev||{});
      next[paneId]=null;
      return next;
    });
    if(activePaneId===paneId)setActivePaneId(target);
  },[panes,activePaneId]);
  var getPaneTracesForId=useCallback(function(paneId){
    return getPaneTraces(allTr,tracePaneMap,paneId);
  },[allTr,tracePaneMap]);
  var getPaneActiveTraceName=useCallback(function(paneId){
    return (paneActiveTraceMap&&paneActiveTraceMap[paneId])||null;
  },[paneActiveTraceMap]);
  var setPaneActiveTrace=useCallback(function(paneId,traceName){
    if(!paneId)return;
    setPaneActiveTraceMap(function(prev){
      var next=Object.assign({},prev||{});
      next[paneId]=traceName||null;
      return next;
    });
  },[]);
  return {paneMode:paneCount,setPaneMode:setPaneMode,panes:panes,activePaneId:activePaneId,setActivePaneId:setActivePaneId,tracePaneMap:tracePaneMap,setTracePaneMap:setTracePaneMap,paneActiveTraceMap:paneActiveTraceMap,setPaneActiveTraceMap:setPaneActiveTraceMap,assignTraceToPane:assignTraceToPane,clearPane:clearPane,getPaneTraces:getPaneTracesForId,getPaneActiveTraceName:getPaneActiveTraceName,setPaneActiveTrace:setPaneActiveTrace};
}

function useAnalysisRegistry(dep){
  return useMemo(function(){
    return makeAnalysisRegistry(dep.analysisOpenState,{
      "noise-psd":(dep.noiseResults||[]).length,
      "ip3":(dep.ip3Results||[]).length
    });
  },[dep.analysisOpenState,dep.noiseResults,dep.ip3Results]);
}

  function useRefLines(){
    var _rl=useState([]),refLines=_rl[0],setRefLines=_rl[1];
    var _rm=useState(null),refMode=_rm[0],setRefMode=_rm[1];
    var _sr=useState(null),selectedRefLineId=_sr[0],setSelectedRefLineId=_sr[1];
    useEffect(function(){
      if(selectedRefLineId===null||selectedRefLineId===undefined)return;
      if(!(refLines||[]).some(function(line){return line&&line.id===selectedRefLineId;}))setSelectedRefLineId(null);
    },[refLines,selectedRefLineId]);
    var rc=useRef(0);
    var gc=useRef(0);
    useEffect(function(){
      var maxId=(refLines||[]).reduce(function(max,line){
        return line&&typeof line.id==="number"&&line.id>max?line.id:max;
      },0);
      if(maxId>rc.current)rc.current=maxId;
    },[refLines]);
    var addVLine=useCallback(function(freq,paneIds,selectedPaneId){
    if(!isFinite(freq))return;
    var targets=(Array.isArray(paneIds)&&paneIds.length?paneIds:[null]).filter(Boolean);
    if(!targets.length)targets=[null];
    var createdIds=[];
    var selectedId=null;
    var groupId=targets.length>1?("line-group-"+(++gc.current)):null;
    setRefLines(function(p){
      var next=p.slice();
      targets.forEach(function(paneId){
        rc.current++;
        createdIds.push(rc.current);
        if(selectedPaneId&&paneId===selectedPaneId)selectedId=rc.current;
        next.push({id:rc.current,type:"v",paneId:paneId,groupId:groupId,value:freq,label:fmtF(freq,true)});
      });
      return next;
    });
      var nextSelectedId=selectedId||(createdIds.length?createdIds[createdIds.length-1]:null);
      setSelectedRefLineId(nextSelectedId);
      setRefMode(null);
    },[]);
  var addHLine=useCallback(function(amp,yUnit,paneIds,selectedPaneId){
    if(!isFinite(amp))return;
    var targets=(Array.isArray(paneIds)&&paneIds.length?paneIds:[null]).filter(Boolean);
    if(!targets.length)targets=[null];
    var unitLabel=yUnit||"dBm";
    var createdIds=[];
    var selectedId=null;
    var groupId=targets.length>1?("line-group-"+(++gc.current)):null;
    setRefLines(function(p){
      var next=p.slice();
      targets.forEach(function(paneId){
        rc.current++;
        createdIds.push(rc.current);
        if(selectedPaneId&&paneId===selectedPaneId)selectedId=rc.current;
        next.push({id:rc.current,type:"h",paneId:paneId,groupId:groupId,value:amp,label:amp.toFixed(2)+" "+unitLabel});
      });
      return next;
    });
      var nextSelectedId=selectedId||(createdIds.length?createdIds[createdIds.length-1]:null);
      setSelectedRefLineId(nextSelectedId);
      setRefMode(null);
    },[]);
    var removeRefLine=useCallback(function(id){
      setRefLines(function(p){return p.filter(function(r){return r.id!==id;});});
      setSelectedRefLineId(function(prev){return prev===id?null:prev;});
    },[]);
    var clearRefLines=useCallback(function(){setRefLines([]);setRefMode(null);setSelectedRefLineId(null);},[]);
    return {refLines:refLines,setRefLines:setRefLines,refMode:refMode,setRefMode:setRefMode,selectedRefLineId:selectedRefLineId,setSelectedRefLineId:setSelectedRefLineId,addVLine:addVLine,addHLine:addHLine,removeRefLine:removeRefLine,clearRefLines:clearRefLines};
  }

function useNoisePSD(){
  var _nF=useState("gaussian"),noiseFilter=_nF[0],setNoiseFilter=_nF[1];
  var _nS=useState(null),noiseSource=_nS[0],setNoiseSource=_nS[1];
  var _nR=useState([]),noiseResults=_nR[0],setNoiseResults=_nR[1];
  var addSavedNoise=useCallback(function(npsdStats){
    var saved=makeSavedNoiseResult(npsdStats,noiseFilter,npsdStats&&npsdStats.src);
    if(!saved)return;
    setNoiseResults(function(lst){return lst.concat([saved]);});
  },[noiseFilter]);
  return {noiseFilter:noiseFilter,setNoiseFilter:setNoiseFilter,noiseSource:noiseSource,setNoiseSource:setNoiseSource,noiseResults:noiseResults,setNoiseResults:setNoiseResults,addSavedNoise:addSavedNoise};
}

function useIP3(){
  var _iP=useState({f1:null,f2:null,im3l:null,im3u:null}),ip3Pts=_iP[0],setIP3Pts=_iP[1];
  var _iR=useState(null),ip3Res=_iR[0],setIP3Res=_iR[1];
  var _iG=useState(""),ip3Gain=_iG[0],setIP3Gain=_iG[1];
  var _iL=useState([]),ip3Results=_iL[0],setIP3Results=_iL[1];
  var stripIP3Markers=useCallback(function(lst){
    return (lst||[]).map(function(marker){return cloneMarkerWithoutIP3Label(marker);});
  },[]);
  var resetIP3=useCallback(function(setMarkers){
    setIP3Pts({f1:null,f2:null,im3l:null,im3u:null});
    setIP3Res(null);
    if(setMarkers)setMarkers(function(prev){return prev.map(function(marker){return cloneMarkerWithoutIP3Label(marker);});});
  },[]);
  var syncFromMarkers=useCallback(function(markers){
    var pts=getIP3PointsFromMarkers(markers);
    setIP3Pts(pts);
    setIP3Res(calcIP3FromPoints(pts));
  },[]);
  var saveIP3=useCallback(function(traceInfo){
    var saved=makeSavedIP3Result(ip3Res,ip3Pts,ip3Gain,traceInfo);
    if(!saved)return;
    setIP3Results(function(lst){return lst.concat([saved]);});
  },[ip3Res,ip3Pts,ip3Gain]);
  return {ip3Pts:ip3Pts,setIP3Pts:setIP3Pts,ip3Res:ip3Res,setIP3Res:setIP3Res,ip3Gain:ip3Gain,setIP3Gain:setIP3Gain,ip3Results:ip3Results,setIP3Results:setIP3Results,stripIP3Markers:stripIP3Markers,resetIP3:resetIP3,syncFromMarkers:syncFromMarkers,saveIP3:saveIP3};
}

function useMarkers(){
  var _sMk=useState(true),showMarkers=_sMk[0],setShowMarkers=_sMk[1];
  var _mk=useState([]),markers=_mk[0],rawSetMarkers=_mk[1];
  var _mm=useState("normal"),mkrMode=_mm[0],setMkrMode=_mm[1];
  var _mt=useState("__auto__"),markerTrace=_mt[0],setMarkerTrace=_mt[1];
  var _dR=useState(null),dRef=_dR[0],setDRef=_dR[1];
  var _sel=useState(null),selectedMkrIdx=_sel[0],setSelectedMkrIdx=_sel[1];
  var setMarkers=useCallback(function(nextOrUpdater){
    rawSetMarkers(function(prev){
      var next=typeof nextOrUpdater==="function"?nextOrUpdater(prev):nextOrUpdater;
      next=Array.isArray(next)?next:[];
      var indexMap=new Map();
      next.forEach(function(marker,idx){if(marker)indexMap.set(marker,idx);});
      setSelectedMkrIdx(function(sel){
        if(sel===null||sel===undefined)return null;
        var prevMarker=prev[sel];
        if(prevMarker&&indexMap.has(prevMarker))return indexMap.get(prevMarker);
        return next[sel]?sel:null;
      });
      setDRef(function(ref){
        if(ref===null||ref===undefined)return null;
        var prevMarker=prev[ref];
        if(prevMarker&&indexMap.has(prevMarker))return indexMap.get(prevMarker);
        return next[ref]?ref:null;
      });
      return next.map(function(marker){
        if(!marker||marker.refIdx===undefined||marker.refIdx===null)return marker;
        var refMarker=prev[marker.refIdx];
        if(refMarker&&indexMap.has(refMarker)){
          return Object.assign({},marker,{refIdx:indexMap.get(refMarker)});
        }
        return Object.assign({},marker,{refIdx:null});
      });
    });
  },[]);
  var clearMarkers=useCallback(function(onClear){setMarkers([]);setDRef(null);setSelectedMkrIdx(null);if(onClear)onClear();},[setMarkers]);
  var rmMkr=useCallback(function(i){
    setSelectedMkrIdx(function(s){return s===null?null:s===i?null:s>i?s-1:s;});
    setMarkers(function(p){return p.filter(function(_,j){return j!==i;});});
  },[setMarkers]);
  var addMarker=useCallback(function(mk,selectNew){
    setMarkers(function(p){
      var next=p.concat([mk]);
      if(selectNew)setSelectedMkrIdx(next.length-1);
      return next;
    });
  },[setMarkers]);
  return {showMarkers:showMarkers,setShowMarkers:setShowMarkers,markers:markers,setMarkers:setMarkers,mkrMode:mkrMode,setMkrMode:setMkrMode,markerTrace:markerTrace,setMarkerTrace:setMarkerTrace,dRef:dRef,setDRef:setDRef,clearMarkers:clearMarkers,rmMkr:rmMkr,addMarker:addMarker,selectedMkrIdx:selectedMkrIdx,setSelectedMkrIdx:setSelectedMkrIdx};
}

function useInteractionMode(dep){
  var selectNormal=useCallback(function(){
    dep.setRefMode(null);
    dep.setMkrMode("normal");
  },[dep.setRefMode,dep.setMkrMode]);
  var selectDelta=useCallback(function(){
    dep.setRefMode(null);
    dep.setMkrMode("delta");
    if(dep.markers.length>0&&dep.dRef===null)dep.setDRef(0);
  },[dep.setRefMode,dep.setMkrMode,dep.markers,dep.dRef,dep.setDRef]);
  var clearRefPlacement=useCallback(function(){dep.setRefMode(null);},[dep.setRefMode]);
  var toggleRefPlacement=useCallback(function(kind){
    dep.setRefMode(function(prev){return prev===kind?null:kind;});
  },[dep.setRefMode]);
  var action=useMemo(function(){
    if(dep.refMode==="h")return "place-hline";
    if(dep.refMode==="v")return "place-vline";
    return dep.mkrMode==="delta"?"place-delta-marker":"place-marker";
  },[dep.refMode,dep.mkrMode]);
  var hint=useMemo(function(){
    if(action==="place-hline")return "Click to place H-line";
    if(action==="place-vline")return "Click to place V-line";
    if(dep.mkrMode==="delta"&&dep.markers.length>0)return "Delta reference: M"+(dep.dRef===null?1:(dep.dRef+1));
    return null;
  },[action,dep.mkrMode,dep.markers,dep.dRef]);
  return {selectNormal:selectNormal,selectDelta:selectDelta,clearRefPlacement:clearRefPlacement,toggleRefPlacement:toggleRefPlacement,action:action,hint:hint};
}


function useNoisePSDModel(dep){
  return useMemo(function(){
    var srcName=dep.noiseSource;
    var src=srcName?dep.allTr.find(function(t){return t.name===srcName;}):null;
    if(!src)src=dep.allTr.find(function(t){return t&&t.data&&t.data.length;})||null;
    if(!src||!src.data||!src.data.length)return null;
    var srcMeta=dep.getTraceMeta(src.name)||{};
    var rawRbw=(srcMeta["RBW"]&&srcMeta["RBW"].value!=null)?srcMeta["RBW"].value:dep.rbw;
    var srcRbw=Number(rawRbw);
    if(!isFinite(srcRbw)||srcRbw<=0)srcRbw=Number(dep.rbw)||3000;
    var psd=noisePSD(src.data,srcRbw,dep.noiseFilter);
    if(!psd.length)return null;
    var nPk=psd.reduce(function(a,b){return a.amp>b.amp?a:b;});
    var nMn=psd.reduce(function(a,b){return a.amp<b.amp?a:b;});
    var sum=psd.reduce(function(a,b){return a+b.amp;},0);
    return {src:src,rbw:srcRbw,data:psd,peak:nPk,min:nMn,avg:sum/psd.length};
  },[dep.noiseSource,dep.noiseFilter,dep.allTr,dep.rbw,dep.files,dep.getTraceMeta]);
}

function useMarkerActions(dep){
  var resolveMarkerTarget=useCallback(function(pt,targetAmp){
    var act=(dep.paneTraces&&dep.paneTraces.length?dep.paneTraces:dep.allTr).filter(function(t){return dep.vis[t.name];});
    if(!act.length)return null;
    if(dep.markerTrace&&dep.markerTrace!=="__auto__"){
      var forced=act.find(function(t){return t.name===dep.markerTrace;});
      if(forced){
        if(pt[forced.name]!==undefined&&isFinite(pt[forced.name]))return {trace:forced.name,amp:pt[forced.name],freq:pt.freq};
        var fp=nearestPoint(forced,pt.freq,dep.zoom?dep.zoom.left:null,dep.zoom?dep.zoom.right:null);
        if(fp&&isFinite(fp.amp))return {trace:forced.name,amp:fp.amp,freq:fp.freq};
      }
    }
    if(isFinite(targetAmp)){
      var best=null,bestErr=Infinity;
      for(var i=0;i<act.length;i++){
        if(pt[act[i].name]!==undefined&&isFinite(pt[act[i].name])){
          var err=Math.abs(pt[act[i].name]-targetAmp);
          if(err<bestErr){bestErr=err;best={trace:act[i].name,amp:pt[act[i].name],freq:pt.freq};}
        }
      }
      if(best)return best;
    }
    for(var i=0;i<act.length;i++){
      if(pt[act[i].name]!==undefined&&isFinite(pt[act[i].name]))return {trace:act[i].name,amp:pt[act[i].name],freq:pt.freq};
    }
    if(isFinite(targetAmp)){
      var nearBest=null,nearErr=Infinity;
      for(var j=0;j<act.length;j++){
        var np1=nearestPoint(act[j],pt.freq,dep.zoom?dep.zoom.left:null,dep.zoom?dep.zoom.right:null);
        if(np1&&isFinite(np1.amp)){
          var nErr=Math.abs(np1.amp-targetAmp);
          if(nErr<nearErr){nearErr=nErr;nearBest={trace:act[j].name,amp:np1.amp,freq:np1.freq};}
        }
      }
      if(nearBest)return nearBest;
    }
    for(var j=0;j<act.length;j++){
      var np2=nearestPoint(act[j],pt.freq,dep.zoom?dep.zoom.left:null,dep.zoom?dep.zoom.right:null);
      if(np2&&isFinite(np2.amp))return {trace:act[j].name,amp:np2.amp,freq:np2.freq};
    }
    return null;
  },[dep.allTr,dep.paneTraces,dep.vis,dep.markerTrace,dep.zoom]);

  function getPreferredTraces(){
    var visible=(dep.paneTraces&&dep.paneTraces.length?dep.paneTraces:dep.allTr).filter(function(t){return dep.vis[t.name];});
    if(dep.selectedMkrIdx!==null&&dep.selectedMkrIdx!==undefined&&dep.markers[dep.selectedMkrIdx]){
      var selectedTrace=dep.markers[dep.selectedMkrIdx].trace;
      var selectedOnly=visible.filter(function(t){return t.name===selectedTrace;});
      if(selectedOnly.length)return selectedOnly;
    }
    if(dep.activeTraceName){
      var activeOnly=visible.filter(function(t){return t.name===dep.activeTraceName;});
      if(activeOnly.length)return activeOnly;
    }
    if(dep.markerTrace&&dep.markerTrace!=="__auto__"){
      var forced=visible.filter(function(t){return t.name===dep.markerTrace;});
      if(forced.length)return forced;
    }
    return visible;
  }
  function replaceOrAddMarker(point,type){
    if(!point)return;
    var sel=dep.selectedMkrIdx;
    if(sel!==null&&sel!==undefined&&dep.markers[sel]){
      dep.setMarkers(function(prev){
        var next=prev.slice();
        var current=next[sel]||{};
        next[sel]=Object.assign({},current,{freq:point.freq,amp:point.amp,trace:point.trace,type:type||current.type||"normal"});
        if(next[sel].type!=="delta")delete next[sel].refIdx;
        return next;
      });
      return;
    }
    dep.addMarker({freq:point.freq,amp:point.amp,trace:point.trace,type:type||"normal"},true);
  }
  function findBestAcrossTraces(kind){
    var best=null;
    getPreferredTraces().forEach(function(tr){
      buildExtrema(tr,dep.zoom,kind).forEach(function(point){
        if(!best)best={trace:tr.name,freq:point.freq,amp:point.amp};
        else if(kind==="max"&&point.amp>best.amp)best={trace:tr.name,freq:point.freq,amp:point.amp};
        else if(kind==="min"&&point.amp<best.amp)best={trace:tr.name,freq:point.freq,amp:point.amp};
      });
    });
    return best;
  }
  function findNextOnSelected(kind){
    var sel=dep.selectedMkrIdx;
    if(sel===null||sel===undefined||!dep.markers[sel])return null;
    var marker=dep.markers[sel];
    if(dep.paneTraces&&dep.paneTraces.length&&!dep.paneTraces.some(function(item){return item.name===marker.trace;}))return null;
    var tr=dep.allTr.find(function(item){return item.name===marker.trace&&dep.vis[item.name];});
    if(!tr)return null;
    var data=getVisibleDataForTrace(tr,dep.zoom).filter(function(point){return isFinite(point.freq)&&isFinite(point.amp);});
    var startIdx=nearestIndexByFreq(data,marker.freq);
    var localStep=Infinity;
    if(data.length>=2&&startIdx!==-1){
      if(startIdx>0)localStep=Math.min(localStep,Math.abs(data[startIdx].freq-data[startIdx-1].freq));
      if(startIdx<data.length-1)localStep=Math.min(localStep,Math.abs(data[startIdx+1].freq-data[startIdx].freq));
    }
    if(!isFinite(localStep)||localStep<=0){
      localStep=Math.max((dep.nextPeakExclusion||0)/32,1e-9);
    }
    var samePointTol=Math.max(localStep*0.75,1e-9);
    var otherMarkerTol=Math.max(localStep*0.75,1e-9);
    var traceOrder={};
    dep.allTr.forEach(function(item,idx){traceOrder[item.name]=idx;});
    function occupiedByOther(point){
      return dep.markers.some(function(other,idx){
        return idx!==sel&&other&&other.trace===point.trace&&isFinite(other.freq)&&Math.abs(other.freq-point.freq)<=otherMarkerTol;
      });
    }
    var seqBase=(dep.paneTraces&&dep.paneTraces.length?dep.paneTraces:dep.allTr).filter(function(item){return dep.vis[item.name];});
    var seqTraces=(dep.markerTrace&&dep.markerTrace!=="__auto__")?[tr]:seqBase;
    var extrema=[];
    seqTraces.forEach(function(item){
      buildExtrema(item,dep.zoom,kind).forEach(function(point){
        extrema.push({trace:item.name,freq:point.freq,amp:point.amp});
      });
    });
    extrema.sort(function(a,b){
      if(Math.abs(a.freq-b.freq)>samePointTol)return a.freq-b.freq;
      return (traceOrder[a.trace]||0)-(traceOrder[b.trace]||0);
    });
    var freeExtrema=extrema.filter(function(point){return !occupiedByOther(point);});
    var markerTraceOrder=traceOrder[marker.trace]||0;
    function pickFrom(list){
      if(!list.length)return null;
      if(dep.searchDirection==="left"){
        for(var j=list.length-1;j>=0;j--){
          if(list[j].freq<marker.freq-samePointTol)return {trace:list[j].trace,freq:list[j].freq,amp:list[j].amp};
          if(Math.abs(list[j].freq-marker.freq)<=samePointTol&&(traceOrder[list[j].trace]||0)<markerTraceOrder)return {trace:list[j].trace,freq:list[j].freq,amp:list[j].amp};
        }
        return {trace:list[list.length-1].trace,freq:list[list.length-1].freq,amp:list[list.length-1].amp};
      }
      for(var i=0;i<list.length;i++){
        if(list[i].freq>marker.freq+samePointTol)return {trace:list[i].trace,freq:list[i].freq,amp:list[i].amp};
        if(Math.abs(list[i].freq-marker.freq)<=samePointTol&&(traceOrder[list[i].trace]||0)>markerTraceOrder)return {trace:list[i].trace,freq:list[i].freq,amp:list[i].amp};
      }
      return {trace:list[0].trace,freq:list[0].freq,amp:list[0].amp};
    }
    var nextFree=pickFrom(freeExtrema);
    if(nextFree)return nextFree;
    if(!extrema.length)return null;
    return pickFrom(extrema);
  }
  var peakSrch=useCallback(function(){
    replaceOrAddMarker(findBestAcrossTraces("max"),"peak");
  },[dep.allTr,dep.paneTraces,dep.activeTraceName,dep.vis,dep.zoom,dep.markers,dep.selectedMkrIdx,dep.markerTrace,dep.nextPeakExclusion,dep.searchDirection]);

  var nxtPeak=useCallback(function(){
    replaceOrAddMarker(findNextOnSelected("max")||findBestAcrossTraces("max"),"peak");
  },[dep.allTr,dep.paneTraces,dep.activeTraceName,dep.vis,dep.zoom,dep.markers,dep.selectedMkrIdx,dep.markerTrace,dep.nextPeakExclusion,dep.searchDirection]);

  var minSrch=useCallback(function(){
    replaceOrAddMarker(findBestAcrossTraces("min"),"normal");
  },[dep.allTr,dep.paneTraces,dep.activeTraceName,dep.vis,dep.zoom,dep.markers,dep.selectedMkrIdx,dep.markerTrace,dep.nextPeakExclusion]);

  var nxtMin=useCallback(function(){
    replaceOrAddMarker(findNextOnSelected("min")||findBestAcrossTraces("min"),"normal");
  },[dep.allTr,dep.paneTraces,dep.activeTraceName,dep.vis,dep.zoom,dep.markers,dep.selectedMkrIdx,dep.markerTrace,dep.nextPeakExclusion,dep.searchDirection]);

  return {resolveMarkerTarget:resolveMarkerTarget,peakSrch:peakSrch,nxtPeak:nxtPeak,minSrch:minSrch,nxtMin:nxtMin};
}

function useIP3Workflow(dep){
  function getTraceViewData(tr){
    return getVisibleDataForTrace(tr,dep.zoom);
  }
  function upsertRoleMarker(prev,point,role){
    var label=IP3_ROLE_LABELS[role];
    var existingIdx=prev.findIndex(function(marker){return marker&&marker.label===label;});
    if(existingIdx!==-1){
      var next=prev.slice();
      next[existingIdx]=Object.assign({},next[existingIdx],{freq:point.freq,amp:point.amp,trace:point.trace,type:"peak",label:label});
      return next;
    }
    return prev.concat([{freq:point.freq,amp:point.amp,trace:point.trace,type:"peak",label:label}]);
  }
  var tryAutoCompleteIP3=useCallback(function(seed,selectedIdx){
    if(!seed||!seed.trace)return false;
    var tr=dep.allTr.find(function(t){return t.name===seed.trace;});
    var data=getTraceViewData(tr);
    if(!data.length)return false;
    var ex=dep.nextPeakExclusion;
    var other=findHighestPeakExcluding(data,[seed.freq],ex);
    if(!other)return false;
    var low=seed.freq<=other.freq?seed:other;
    var high=seed.freq<=other.freq?other:seed;
    var sep=Math.abs(high.freq-low.freq);
    if(!(sep>0))return false;
    var searchHz=Math.max(ex*2,sep*0.35);
    var fim3l=2*low.freq-high.freq;
    var fim3u=2*high.freq-low.freq;
    var im3l=findPeakNearFreq(data,fim3l,searchHz);
    var im3u=findPeakNearFreq(data,fim3u,searchHz);
    if(!im3l||!im3u)return false;
    var pts={
      f1:{freq:low.freq,amp:low.amp,trace:seed.trace},
      f2:{freq:high.freq,amp:high.amp,trace:seed.trace},
      im3l:{freq:im3l.freq,amp:im3l.amp,trace:seed.trace},
      im3u:{freq:im3u.freq,amp:im3u.amp,trace:seed.trace}
    };
    dep.setMarkers(function(prev){
      var next=dep.stripIP3Markers(prev);
      if(selectedIdx!==null&&selectedIdx!==undefined&&next[selectedIdx]){
        next=next.slice();
        next[selectedIdx]=Object.assign({},next[selectedIdx],{freq:pts.f1.freq,amp:pts.f1.amp,trace:pts.f1.trace,type:"peak",label:"F1"});
      } else {
        next=upsertRoleMarker(next,pts.f1,"f1");
      }
      next=upsertRoleMarker(next,pts.f2,"f2");
      next=upsertRoleMarker(next,pts.im3l,"im3l");
      next=upsertRoleMarker(next,pts.im3u,"im3u");
      return next;
    });
    return true;
  },[dep.allTr,dep.zoom,dep.nextPeakExclusion,dep.setMarkers,dep.stripIP3Markers]);
  return {tryAutoCompleteIP3:tryAutoCompleteIP3};
}


  global.AppHooks={
    getDemoWorkspacePresetById:getDemoWorkspacePresetById,
    getDemoLaunchPresetId:getDemoLaunchPresetId,
    clearDemoLaunchQueryParam:clearDemoLaunchQueryParam,
    buildBundledDemoFiles:buildBundledDemoFiles,
    useYControls:useYControls,
    useXControls:useXControls,
    useFileStore:useFileStore,
    useChartNav:useChartNav,
    useCrosshair:useCrosshair,
    useSharedCursor:useSharedCursor,
    isFileDragEvent:isFileDragEvent,
    usePaneLayout:usePaneLayout,
    useAnalysisRegistry:useAnalysisRegistry,
    useNoisePSD:useNoisePSD,
    useIP3:useIP3,
    useMarkers:useMarkers,
    useInteractionMode:useInteractionMode,
    useNoisePSDModel:useNoisePSDModel,
    useMarkerActions:useMarkerActions,
    useIP3Workflow:useIP3Workflow
  };
})(window);

