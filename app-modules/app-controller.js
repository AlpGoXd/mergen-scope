(function(global){
var React=global.React;
var h=React.createElement;
var RC=global.Recharts||{};
var TM=global.TraceModel||{},TH=global.TraceHelpers||{},TOH=global.TraceOpsHelpers||{},AH=global.AnalysisHelpers||{},PH=global.ParserHelpers||{},MH=global.MarkerHelpers||{},DSH=global.DerivedStateHelpers||{},UH=global.UIHelpers||{},PAH=global.PaneHelpers||{},WH=global.WorkspaceHelpers||{},EH=global.ExportHelpers||{},ATH=global.AnalysisTargetHelpers||{},Hooks=global.AppHooks||{};
var useState=React.useState,useMemo=React.useMemo,useEffect=React.useEffect,useRef=React.useRef,useCallback=React.useCallback,ReactComponent=React.Component;
var useTheme=UH.useTheme,fmtF=UH.fmtF;
var LineChart=RC.LineChart,Line=RC.Line,XAxis=RC.XAxis,YAxis=RC.YAxis,CartesianGrid=RC.CartesianGrid,Tooltip=RC.Tooltip,ResponsiveContainer=RC.ResponsiveContainer,ReferenceArea=RC.ReferenceArea,ReferenceLine=RC.ReferenceLine,ReferenceDot=RC.ReferenceDot,Legend=RC.Legend;
var getTraceId=TM.getTraceId,getTraceLabel=TM.getTraceLabel,getTraceData=TM.getTraceData,isDerivedTrace=TM.isDerivedTrace,isTouchstoneTrace=TM.isTouchstoneTrace,getTouchstoneTraceFamily=TM.getTouchstoneTraceFamily,createDerivedTrace=TM.createDerivedTrace,setDerivedTraceYUnit=TM.setDerivedTraceYUnit,normalizeUnitName=TM.normalizeUnitName,isDbRatioUnit=TM.isDbRatioUnit,isLogLevelUnit=TM.isLogLevelUnit,isLogUnit=TM.isLogUnit,resolveTraceMathResultUnit=TM.resolveTraceMathResultUnit,getEffectiveTraceYUnit=TM.getEffectiveTraceYUnit,deriveAxisInfo=TM.deriveAxisInfo,resetTraceIdCounter=TM.resetTraceIdCounter,syncTraceIdCounter=TM.syncTraceIdCounter,getYAxisTextForUnit=TM.getYAxisTextForUnit;
var clampYValue=TH.clampYValue,interpolatePointAtX=TH.interpolatePointAtX,getVisibleTraceData=TH.getVisibleTraceData,findHorizontalCrossings=TH.findHorizontalCrossings,getSafeYRangeFromData=TH.getSafeYRangeFromData,sanitizeYDomain=TH.sanitizeYDomain,makeYTicksFromDomain=TH.makeYTicksFromDomain,getPrimaryTickStep=TH.getPrimaryTickStep,makeNiceTicks=TH.makeNiceTicks,computeYWheelZoom=TH.computeYWheelZoom;
var smoothTraceData=TOH.smoothTraceData,computeBinaryTraceMathData=TOH.computeBinaryTraceMathData;
var noisePSD=AH.noisePSD,calcIP3FromPoints=AH.calcIP3FromPoints,buildIP3RoleRefs=AH.buildIP3RoleRefs,savedResultReferencesAnyTrace=AH.savedResultReferencesAnyTrace,savedResultHasValidTraceRefs=AH.savedResultHasValidTraceRefs,makeSavedNoiseResult=AH.makeSavedNoiseResult,makeSavedIP3Result=AH.makeSavedIP3Result;
var syncParserFileCounter=PH.syncParserFileCounter,nearestPoint=PH.nearestPoint;
var IP3_ROLE_LABELS=MH.IP3_ROLE_LABELS,cloneMarkerWithoutIP3Label=MH.cloneMarkerWithoutIP3Label,getIP3PointsFromMarkers=MH.getIP3PointsFromMarkers;
var reconcileDerivedTraceGraph=DSH.reconcileDerivedTraceGraph;
var clampPaneCount=PAH.clampPaneCount,getTracePaneId=PAH.getTracePaneId,getPaneAutoYDomain=PAH.getPaneAutoYDomain;
var buildWorkspaceSnapshot=WH.buildWorkspaceSnapshot,buildWorkspaceExportPackage=WH.buildWorkspaceExportPackage,normalizeWorkspaceSnapshot=WH.normalizeWorkspaceSnapshot,restoreWorkspaceSnapshot=WH.restoreWorkspaceSnapshot,extractWorkspaceSnapshotFromPackage=WH.extractWorkspaceSnapshotFromPackage;
var buildTraceExportPackage=EH.buildTraceExportPackage,buildTimestampedDownloadName=EH.buildTimestampedDownloadName,downloadJsonFile=EH.downloadJsonFile,exportElementAsSvgFile=EH.exportElementAsSvgFile,exportElementAsPngFile=EH.exportElementAsPngFile;
var getDefaultAnalysisOpenState=ATH.getDefaultAnalysisOpenState,normalizeAnalysisOpenState=ATH.normalizeAnalysisOpenState,setAnalysisOpenState=ATH.setAnalysisOpenState,clearAllAnalysisOpenState=ATH.clearAllAnalysisOpenState,resolveAnalysisTarget=ATH.resolveAnalysisTarget,resolveSelectedHorizontalLine=ATH.resolveSelectedHorizontalLine;
var useYControls=Hooks.useYControls,useXControls=Hooks.useXControls,useFileStore=Hooks.useFileStore,useChartNav=Hooks.useChartNav,useSharedCursor=Hooks.useSharedCursor,useNoisePSD=Hooks.useNoisePSD,useIP3=Hooks.useIP3,useMarkers=Hooks.useMarkers,useInteractionMode=Hooks.useInteractionMode,useNoisePSDModel=Hooks.useNoisePSDModel,useMarkerActions=Hooks.useMarkerActions,useIP3Workflow=Hooks.useIP3Workflow,usePaneLayout=Hooks.usePaneLayout,useAnalysisRegistry=Hooks.useAnalysisRegistry,makeDefaultTouchstoneState=Hooks.makeDefaultTouchstoneState,cloneTouchstoneSelectionState=Hooks.cloneTouchstoneSelectionState,buildTouchstoneSelectionsFromTraces=Hooks.buildTouchstoneSelectionsFromTraces,reconcileTouchstoneFileSelections=Hooks.reconcileTouchstoneFileSelections,buildTouchstoneStabilityTrace=Hooks.buildTouchstoneStabilityTrace,isFileDragEvent=Hooks.isFileDragEvent,getDemoWorkspacePresetById=Hooks.getDemoWorkspacePresetById,getDemoLaunchPresetId=Hooks.getDemoLaunchPresetId,clearDemoLaunchQueryParam=Hooks.clearDemoLaunchQueryParam,buildBundledDemoFiles=Hooks.buildBundledDemoFiles;
var Shell=global.AppShell||{},Analysis=global.AppAnalysis||{},Chart=global.AppChart||{};
var SidebarPane=Shell.SidebarPane||function(props){return props&&props.render?props.render():props.children||null;};
var RightPanelStack=Shell.RightPanelStack||function(props){return h("div",null,props.children);};
var ChartPane=Shell.ChartPane||function(props){return props&&props.render?props.render():props.children||null;};
var MarkerItem=Shell.MarkerItem;
var RefLineItem=Shell.RefLineItem;
var TraceRow=Shell.TraceRow;
var Btn=Shell.Btn;
var TopBar=Shell.TopBar||function(){return null;};
var FooterHintItem=Shell.FooterHintItem;
var FooterBar=Shell.FooterBar||function(){return null;};
var SidebarPanel=Shell.SidebarPanel||function(){return null;};
var ToolbarStrip=Shell.ToolbarStrip||function(){return null;};
var ImportExportPanel=Shell.ImportExportPanel||function(){return null;};
var DataTablePanel=Shell.DataTablePanel||function(){return null;};
var AnalysisFeatureCard=Analysis.AnalysisFeatureCard;
var NoisePSDCard=Analysis.NoisePSDCard;
var TraceOpsCard=Analysis.TraceOpsCard;
var AnalysisMenuCard=Analysis.AnalysisMenuCard;
var PeakSpurTableCard=Analysis.PeakSpurTableCard;
var MarkerDeltaTableCard=Analysis.MarkerDeltaTableCard;
var RangeStatsCard=Analysis.RangeStatsCard;
var BandwidthHelperCard=Analysis.BandwidthHelperCard;
var ThresholdCrossingsCard=Analysis.ThresholdCrossingsCard;
var RippleFlatnessCard=Analysis.RippleFlatnessCard;
var OccupiedBandwidthCard=Analysis.OccupiedBandwidthCard;
var ChannelPowerCard=Analysis.ChannelPowerCard;
var IP3Card=Analysis.IP3Card;
var AnalysisPanelStack=Analysis.AnalysisPanelStack||function(){return null;};
var EmptyChartPane=Chart.EmptyChartPane;
var ChartWorkspace=Chart.ChartWorkspace||function(){return null;};
var CHART_MARGIN_TOP=8,CHART_MARGIN_RIGHT=12,CHART_MARGIN_BOTTOM=24,CHART_MARGIN_LEFT=0,CHART_Y_AXIS_WIDTH=56,CHART_PLOT_LEFT=CHART_MARGIN_LEFT+CHART_Y_AXIS_WIDTH;

function useRefLines(){
  var a=useState([]),refLines=a[0],setRefLines=a[1],b=useState(null),refMode=b[0],setRefMode=b[1],c=useState(null),selectedRefLineId=c[0],setSelectedRefLineId=c[1],rc=useRef(0),gc=useRef(0);
  useEffect(function(){ if(selectedRefLineId!=null&&!(refLines||[]).some(function(l){return l&&l.id===selectedRefLineId;}))setSelectedRefLineId(null); },[refLines,selectedRefLineId]);
  useEffect(function(){ var max=(refLines||[]).reduce(function(m,l){ return l&&l.id>m?l.id:m; },0); if(max>rc.current)rc.current=max; },[refLines]);
  function add(type,value,label,paneIds,selectedPaneId){
    if(!isFinite(value))return;
    var targets=(Array.isArray(paneIds)&&paneIds.length?paneIds:[null]).filter(Boolean); if(!targets.length)targets=[null];
    var ids=[],sel=null,groupId=targets.length>1?("line-group-"+(++gc.current)):null;
    setRefLines(function(prev){ var next=prev.slice(); targets.forEach(function(paneId){ rc.current++; ids.push(rc.current); if(selectedPaneId&&paneId===selectedPaneId)sel=rc.current; next.push({id:rc.current,type:type,paneId:paneId,groupId:groupId,value:value,label:label(value)}); }); return next; });
    setSelectedRefLineId(sel||(ids.length?ids[ids.length-1]:null)); setRefMode(null);
  }
  return {refLines:refLines,setRefLines:setRefLines,refMode:refMode,setRefMode:setRefMode,selectedRefLineId:selectedRefLineId,setSelectedRefLineId:setSelectedRefLineId,addVLine:function(freq,paneIds,selectedPaneId){add("v",freq,function(v){return fmtF(v,true);},paneIds,selectedPaneId);},addHLine:function(amp,yUnit,paneIds,selectedPaneId){add("h",amp,function(v){return v.toFixed(2)+" "+(yUnit||"dBm");},paneIds,selectedPaneId);},removeRefLine:function(id){setRefLines(function(prev){return prev.filter(function(l){return l.id!==id;});});setSelectedRefLineId(function(prev){return prev===id?null:prev;});},clearRefLines:function(){setRefLines([]);setRefMode(null);setSelectedRefLineId(null);}};
}

function useAppController(){
  var C=useTheme();
  var mcMap={normal:C.mn,delta:C.md,peak:C.mp};

  var _dr=useState(false),isDrag=_dr[0],setIsDrag=_dr[1];
  var _do=useState(false),showDots=_do[0],setShowDots=_do[1];
  var _sm=useState(false),showMeta=_sm[0],setShowMeta=_sm[1];
  var _stc=useState(true),showTouchstoneControls=_stc[0],setShowTouchstoneControls=_stc[1];
  var _ssb=useState(true),showSidebar=_ssb[0],setShowSidebar=_ssb[1];
  var _sto=useState(false),showTraceOps=_sto[0],setShowTraceOps=_sto[1];
  var _toos=useState({offset:false,scale:false,smoothing:false,subtract:false}),traceOpsOpenSections=_toos[0],setTraceOpsOpenSections=_toos[1];
  var _sap=useState(false),showAnalysisPanel=_sap[0],setShowAnalysisPanel=_sap[1];
  var _sie=useState(false),showImportExportPanel=_sie[0],setShowImportExportPanel=_sie[1];
  var _rpo=useState(["analysis","data"]),rightPanelOrder=_rpo[0],setRightPanelOrder=_rpo[1];
  var _aos=useState(getDefaultAnalysisOpenState?getDefaultAnalysisOpenState():{}),analysisOpenState=_aos[0],setAnalysisOpenStateRaw=_aos[1];
  var _smt=useState(true),showMarkerTools=_smt[0],setShowMarkerTools=_smt[1];
  var _spt=useState(true),showPaneTools=_spt[0],setShowPaneTools=_spt[1];
  var _sst=useState(true),showSearchTools=_sst[0],setShowSearchTools=_sst[1];
  var _slt=useState(false),showLineTools=_slt[0],setShowLineTools=_slt[1];
  var _svt=useState(true),showViewTools=_svt[0],setShowViewTools=_svt[1];
  var _lll=useState(false),lockLinesAcrossPanes=_lll[0],setLockLinesAcrossPanes=_lll[1];
  var _sd=useState("right"),searchDirection=_sd[0],setSearchDirection=_sd[1];
  var _nm=useState(false),newMarkerArmed=_nm[0],setNewMarkerArmed=_nm[1];
  var _drv=useState([]),derivedTraces=_drv[0],setDerivedTraces=_drv[1];
  var _ofsSrc=useState(""),offsetSource=_ofsSrc[0],setOffsetSource=_ofsSrc[1];
  var _ofsVal=useState("0"),offsetValue=_ofsVal[0],setOffsetValue=_ofsVal[1];
  var _sclSrc=useState(""),scaleSource=_sclSrc[0],setScaleSource=_sclSrc[1];
  var _sclVal=useState("1"),scaleValue=_sclVal[0],setScaleValue=_sclVal[1];
  var _smSrc=useState(""),smoothSource=_smSrc[0],setSmoothSource=_smSrc[1];
  var _smMeth=useState("moving-average"),smoothMethod=_smMeth[0],setSmoothMethod=_smMeth[1];
  var _smWin=useState("5"),smoothWindow=_smWin[0],setSmoothWindow=_smWin[1];
  var _smPoly=useState("2"),smoothPolyOrder=_smPoly[0],setSmoothPolyOrder=_smPoly[1];
  var _subA=useState(""),subtractA=_subA[0],setSubtractA=_subA[1];
  var _subB=useState(""),subtractB=_subB[0],setSubtractB=_subB[1];
  var _subOp=useState("subtract"),traceMathOperation=_subOp[0],setTraceMathOperation=_subOp[1];
  var _subI=useState("auto"),subtractInterpolation=_subI[0],setSubtractInterpolation=_subI[1];
  var _toe=useState(""),traceOpsError=_toe[0],setTraceOpsError=_toe[1];
  var _ptl=useState("10"),peakTableLimit=_ptl[0],setPeakTableLimit=_ptl[1];
  var _pts=useState("0"),peakTableMinSpacing=_pts[0],setPeakTableMinSpacing=_pts[1];
  var _pta=useState(""),peakTableMinAmp=_pta[0],setPeakTableMinAmp=_pta[1];
  var _bwd=useState("3"),bandwidthDrop=_bwd[0],setBandwidthDrop=_bwd[1];
  var _thm=useState(""),thresholdManual=_thm[0],setThresholdManual=_thm[1];
  var _obw=useState("99"),obwPercent=_obw[0],setObwPercent=_obw[1];
  var markerCtl=useMarkers(),showMarkers=markerCtl.showMarkers,setShowMarkers=markerCtl.setShowMarkers,markers=markerCtl.markers,setMarkers=markerCtl.setMarkers,mkrMode=markerCtl.mkrMode,setMkrMode=markerCtl.setMkrMode,markerTrace=markerCtl.markerTrace,setMarkerTrace=markerCtl.setMarkerTrace,dRef=markerCtl.dRef,setDRef=markerCtl.setDRef,rmMkr=markerCtl.rmMkr,selectedMkrIdx=markerCtl.selectedMkrIdx,setSelectedMkrIdx=markerCtl.setSelectedMkrIdx;
  var _dt=useState(false),showDT=_dt[0],setShowDT=_dt[1];
  var _dtT=useState(null),dtTrace=_dtT[0],setDtTrace=_dtT[1];
  var _stn=useState(null),selectedTraceName=_stn[0],setSelectedTraceName=_stn[1];
  var _dtn=useState(null),dragTraceName=_dtn[0],setDragTraceName=_dtn[1];
  var _tss=useState({}),touchstoneStateByFileId=_tss[0],setTouchstoneStateByFileId=_tss[1];
    var refCtl=useRefLines(),refLines=refCtl.refLines,setRefLines=refCtl.setRefLines,refMode=refCtl.refMode,setRefMode=refCtl.setRefMode,selectedRefLineId=refCtl.selectedRefLineId,setSelectedRefLineId=refCtl.setSelectedRefLineId;
  var ip3Ctl=useIP3(),ip3Pts=ip3Ctl.ip3Pts,setIP3Pts=ip3Ctl.setIP3Pts,ip3Res=ip3Ctl.ip3Res,setIP3Res=ip3Ctl.setIP3Res,ip3Gain=ip3Ctl.ip3Gain,setIP3Gain=ip3Ctl.setIP3Gain,ip3Results=ip3Ctl.ip3Results,setIP3Results=ip3Ctl.setIP3Results,saveIP3=ip3Ctl.saveIP3;
  var noiseCtl=useNoisePSD(),noiseFilter=noiseCtl.noiseFilter,setNoiseFilter=noiseCtl.setNoiseFilter,noiseSource=noiseCtl.noiseSource,setNoiseSource=noiseCtl.setNoiseSource,noiseResults=noiseCtl.noiseResults,setNoiseResults=noiseCtl.setNoiseResults,addSavedNoise=noiseCtl.addSavedNoise;
  var interactionCtl=useInteractionMode({mkrMode:mkrMode,setMkrMode:setMkrMode,refMode:refMode,setRefMode:setRefMode,markers:markers,dRef:dRef,setDRef:setDRef});
  var fRef=useRef(null),iRef=useRef(null),wRef=useRef(null),chartRef=useRef(null),chartExportRef=useRef(null);
  var crosshair=useSharedCursor();
  var activePaneModelRef=useRef(null);
  var demoBootRef=useRef(false);
    var panRef=useRef(null),suppressClickRef=useRef(false),mouseBtnRef=useRef(0);
    var dragSelectedMarkerRef=useRef(false);
    var dragRefLineRef=useRef(null);
    var didDragRefLineRef=useRef(false);
    var zoomSetterRef=useRef(null);
  var ySetterRefs=useRef({setYZoom:null,setYMnI:null,setYMxI:null});
  var pendingPaneImportRef=useRef(null);
  var prevRightPanelVisibilityRef=useRef({importExport:false,analysis:false,data:false});
  var promoteRightPanelSection=useCallback(function(id){
    if(!id)return;
    setRightPanelOrder(function(prev){
      var base=Array.isArray(prev)?prev.slice():["analysis","data"];
      var next=base.filter(function(item){return item!==id&&item!=="import-export";});
      next.unshift(id);
      ["analysis","data"].forEach(function(item){
        if(next.indexOf(item)===-1)next.push(item);
      });
      return next;
    });
  },[]);
  var toggleAnalysisOpen=useCallback(function(id,nextValue){
    setAnalysisOpenStateRaw(function(prev){return setAnalysisOpenState(prev,id,nextValue);});
  },[]);
  var closeAllAnalysisCards=useCallback(function(){
    setAnalysisOpenStateRaw(function(prev){return clearAllAnalysisOpenState(prev);});
  },[]);
  var showNoise=!!normalizeAnalysisOpenState(analysisOpenState)["noise-psd"];
  var showIP3=!!normalizeAnalysisOpenState(analysisOpenState)["ip3"];
  function setShowNoise(next){
    var current=!!normalizeAnalysisOpenState(analysisOpenState)["noise-psd"];
    toggleAnalysisOpen("noise-psd",typeof next==="function"?next(current):next);
  }
  function setShowIP3(next){
    var current=!!normalizeAnalysisOpenState(analysisOpenState)["ip3"];
    toggleAnalysisOpen("ip3",typeof next==="function"?next(current):next);
  }
  var pendingPaneImportTimerRef=useRef(null);
  var errorDismissTimerRef=useRef(null);
  var clearMarkers=function(){markerCtl.clearMarkers(function(){ip3Ctl.resetIP3();});};
  var chartDomainRef=useRef(null);
  var zoom,setZoom,selA,setSelA,selB,setSelB,hoverX,hoverData,getMouseBtn,getXDomain,getXDomainHz,freqFromClientX,panXWindow,chartMM,chartML,mDown,mUp,onChartContainerMouseDownCapture,onChartContainerMouseUpCapture;
  var fileCtl=useFileStore({
    dtTrace:dtTrace,noiseSource:noiseSource,dRef:dRef,markers:markers,
    setMarkers:setMarkers,setZoom:function(next){if(zoomSetterRef.current)zoomSetterRef.current(next);},setYZoom:function(next){if(ySetterRefs.current.setYZoom)ySetterRefs.current.setYZoom(next);},setDRef:setDRef,
    setRefLines:setRefLines,setRefMode:setRefMode,resetIP3:ip3Ctl.resetIP3,
    setNoiseResults:setNoiseResults,setIP3Results:setIP3Results,
    setYMnI:function(next){if(ySetterRefs.current.setYMnI)ySetterRefs.current.setYMnI(next);},
    setYMxI:function(next){if(ySetterRefs.current.setYMxI)ySetterRefs.current.setYMxI(next);},
    setDtTrace:setDtTrace,setNoiseSource:setNoiseSource,setIsDrag:setIsDrag,
    setShowDT:setShowDT,setShowSidebar:setShowSidebar,setShowMeta:setShowMeta,setShowMarkers:setShowMarkers,
    setShowNoise:setShowNoise,setShowIP3:setShowIP3,
    panRef:panRef,suppressClickRef:suppressClickRef,
    clearMarkers:clearMarkers,resetIP3:ip3Ctl.resetIP3
  });
  var files=fileCtl.files,setFiles=fileCtl.setFiles,error=fileCtl.error,setError=fileCtl.setError,vis=fileCtl.vis,setVis=fileCtl.setVis,rawTr=fileCtl.allTr,fileMap=fileCtl.fileMap,m0=fileCtl.m0;
  var loadFiles=fileCtl.loadFiles,onDrop=fileCtl.onDrop,removeFile=fileCtl.removeFile,removeRawTrace=fileCtl.removeTrace,baseClearAllFiles=fileCtl.clearAllFiles;
  var allTr=useMemo(function(){return rawTr.concat(derivedTraces);},[rawTr,derivedTraces]);
  var traceOptions=useMemo(function(){return allTr.filter(function(tr){return tr&&getTraceData(tr).length;});},[allTr]);
  useEffect(function(){
    setTouchstoneStateByFileId(function(prev){
      var next={};
      (files||[]).forEach(function(file){
        if(!file||!(file.format==="touchstone"||file.touchstoneNetwork))return;
        next[file.id]=cloneTouchstoneSelectionState((prev&&prev[file.id])||file.touchstoneUiState||buildTouchstoneSelectionsFromTraces(file)||makeDefaultTouchstoneState(file));
      });
      return next;
    });
  },[files]);
  var paneCtl=usePaneLayout(allTr);
  var paneMode=paneCtl.paneMode,setPaneMode=paneCtl.setPaneMode,panes=paneCtl.panes,activePaneId=paneCtl.activePaneId,setActivePaneId=paneCtl.setActivePaneId,tracePaneMap=paneCtl.tracePaneMap,setTracePaneMap=paneCtl.setTracePaneMap,paneActiveTraceMap=paneCtl.paneActiveTraceMap,setPaneActiveTraceMap=paneCtl.setPaneActiveTraceMap,assignTraceToPane=paneCtl.assignTraceToPane,clearPane=paneCtl.clearPane,getPaneTracesForId=paneCtl.getPaneTraces,getPaneActiveTraceName=paneCtl.getPaneActiveTraceName,setPaneActiveTrace=paneCtl.setPaneActiveTrace;
  var xCtl=useXControls(activePaneId,panes),zoomAll=xCtl.zoomAll,setZoomAll=xCtl.setZoomAll,setZoomAllRaw=xCtl.setZoomAllRaw,zoom=xCtl.zoom,setZoom=xCtl.setZoom,sharedZoom=xCtl.sharedZoom,setSharedZoom=xCtl.setSharedZoom,paneXZooms=xCtl.paneXZooms,setPaneXZooms=xCtl.setPaneXZooms,getPaneZoom=xCtl.getPaneZoom,clearAllXZooms=xCtl.clearAllXZooms;
  var yCtl=useYControls(activePaneId),yZoom=yCtl.yZoom,setYZoom=yCtl.setYZoom,getPaneYZoom=yCtl.getPaneYZoom,paneYZooms=yCtl.paneYZooms,setPaneYZooms=yCtl.setPaneYZooms,clearAllPaneYZooms=yCtl.clearAllPaneYZooms,yMnI=yCtl.yMnI,setYMnI=yCtl.setYMnI,yMxI=yCtl.yMxI,setYMxI=yCtl.setYMxI,resetYZ=yCtl.resetYZ,syncYInputs=yCtl.syncYInputs,syncYInputsForPane=yCtl.syncYInputsForPane;
  zoomSetterRef.current=function(next){ if(next===null)clearAllXZooms(); else setZoom(next); };
  ySetterRefs.current.setYZoom=setYZoom;
  ySetterRefs.current.setYMnI=setYMnI;
  ySetterRefs.current.setYMxI=setYMxI;
  useEffect(function(){
    if(errorDismissTimerRef.current){
      clearTimeout(errorDismissTimerRef.current);
      errorDismissTimerRef.current=null;
    }
    if(!error)return;
    errorDismissTimerRef.current=setTimeout(function(){
      setError(function(prev){return prev===error?null:prev;});
      errorDismissTimerRef.current=null;
    },5000);
    return function(){
      if(errorDismissTimerRef.current){
        clearTimeout(errorDismissTimerRef.current);
        errorDismissTimerRef.current=null;
      }
    };
  },[error,setError]);
  var buildCurrentWorkspaceSnapshot=useCallback(function(){
    return buildWorkspaceSnapshot({
      files:files,
      derivedTraces:derivedTraces,
      vis:vis,
      paneMode:paneMode,
      activePaneId:activePaneId,
      traceAssignments:tracePaneMap,
      paneActiveTraceMap:paneActiveTraceMap,
      xZoomState:{zoomAll:zoomAll,sharedZoom:sharedZoom,paneXZooms:paneXZooms},
      yZoomState:{paneYZooms:paneYZooms},
      markers:markers,
      refLines:refLines,
      savedNoise:noiseResults,
      savedIP3:ip3Results,
      selectedTraceName:selectedTraceName,
      ui:{
        showSidebar:showSidebar,
        showMeta:showMeta,
        showMarkers:showMarkers,
        showMarkerTools:showMarkerTools,
        showPaneTools:showPaneTools,
        showSearchTools:showSearchTools,
        showLineTools:showLineTools,
        showViewTools:showViewTools,
        showDots:showDots,
        showDT:showDT,
        lockLinesAcrossPanes:lockLinesAcrossPanes,
        searchDirection:searchDirection,
        newMarkerArmed:newMarkerArmed,
        markerTrace:markerTrace,
        selectedMkrIdx:selectedMkrIdx,
        dRef:dRef,
        refMode:refMode,
        selectedRefLineId:selectedRefLineId,
        showTraceOps:showTraceOps,
        traceOpsOpenSections:traceOpsOpenSections,
        showAnalysisPanel:showAnalysisPanel,
        noiseFilter:noiseFilter,
        noiseSource:noiseSource,
        ip3Gain:ip3Gain,
        dtTrace:dtTrace
      },
      analysisOpenState:analysisOpenState
    });
  },[files,derivedTraces,vis,paneMode,activePaneId,tracePaneMap,paneActiveTraceMap,zoomAll,sharedZoom,paneXZooms,paneYZooms,markers,refLines,noiseResults,ip3Results,selectedTraceName,showSidebar,showMeta,showMarkers,showMarkerTools,showPaneTools,showSearchTools,showLineTools,showViewTools,showDots,showDT,lockLinesAcrossPanes,searchDirection,newMarkerArmed,markerTrace,selectedMkrIdx,dRef,refMode,selectedRefLineId,showTraceOps,traceOpsOpenSections,showAnalysisPanel,noiseFilter,noiseSource,ip3Gain,dtTrace,analysisOpenState]);

  function getTraceByName(name){return allTr.find(function(t){return t.name===name;})||null;}
  function getTraceById(id){return allTr.find(function(t){return getTraceId(t)===id;})||null;}
  function getTraceFile(name){
    var tr=getTraceByName(name);
    return tr&&tr.fileId!=null?fileMap[tr.fileId]||null:null;
  }
  function getTraceMeta(name){
    var f=getTraceFile(name);
    return f?f.meta:{};
  }
  function getFileById(fileId){
    return (files||[]).find(function(file){return file&&file.id===fileId;})||null;
  }
  function cloneTouchstoneStateForFile(fileId){
    return cloneTouchstoneSelectionState((touchstoneStateByFileId&&touchstoneStateByFileId[fileId])||{});
  }
  function updateTouchstoneFileSelections(fileId,nextState,opts){
    opts=opts||{};
    var nextSelectedTraceName=opts.nextSelectedTraceName;
    var nextDtTraceName=opts.nextDtTraceName;
    setFiles(function(prev){
      var selectedName=nextSelectedTraceName;
      var dtName=nextDtTraceName;
      var nextFiles=(prev||[]).map(function(file){
        if(!file||file.id!==fileId)return file;
        var updated=reconcileTouchstoneFileSelections(file,nextState);
        var visibleNames={};
        (updated.traces||[]).forEach(function(trace){ if(trace&&trace.name)visibleNames[trace.name]=true; });
        setVis(function(current){
          var nextVis=Object.assign({},current||{});
          Object.keys(nextVis).forEach(function(traceName){
            var trace=(file.traces||[]).find(function(item){return item&&item.name===traceName;})||null;
            if(trace&&trace.networkSource&&trace.networkSource.parentFileId===fileId&&!visibleNames[traceName])delete nextVis[traceName];
          });
          Object.keys(visibleNames).forEach(function(name){nextVis[name]=true;});
          return nextVis;
        });
        if(!selectedName||!visibleNames[selectedName])selectedName=(updated.traces&&updated.traces[0]&&updated.traces[0].name)||selectedName||null;
        if(!dtName||!visibleNames[dtName])dtName=(updated.traces&&updated.traces[0]&&updated.traces[0].name)||dtName||null;
        return updated;
      });
      if(selectedName!==undefined&&selectedName!==selectedTraceName)setSelectedTraceName(selectedName||null);
      if(dtName!==undefined&&dtName!==dtTrace)setDtTrace(dtName||null);
      return nextFiles;
    });
  }
  function upsertTouchstoneMetricTrace(fileId, metric, payload){
    if(!payload)return;
    var nextTraceName=null;
    setFiles(function(prev){
      return (prev||[]).map(function(item){
        if(!item||item.id!==fileId)return item;
        var existing=(item.traces||[]).find(function(trace){
          return trace&&trace.networkSource&&trace.networkSource.parentFileId===fileId&&trace.networkSource.metric===metric;
        })||null;
        var built=buildTouchstoneStabilityTrace(item,metric,existing);
        if(!built)return item;
        var mergedTrace=Object.assign({},built,{
          dn:payload.traceLabel||built.dn,
          networkSource:Object.assign({},built.networkSource||{},payload.networkSource||{}),
          units:payload.units&&typeof payload.units==="object"?Object.assign({},payload.units):built.units,
          data:Array.isArray(payload.data)&&payload.data.length?payload.data:built.data
        });
        nextTraceName=mergedTrace.name;
        var keep=(item.traces||[]).filter(function(trace){
          if(!trace)return false;
          if(trace.name===mergedTrace.name)return false;
          return !(trace.networkSource&&trace.networkSource.parentFileId===fileId&&trace.networkSource.metric===metric);
        });
        keep.push(mergedTrace);
        return Object.assign({},item,{traces:keep});
      });
    });
    if(!nextTraceName)return;
    setVis(function(prev){
      var next=Object.assign({},prev||{});
      next[nextTraceName]=true;
      return next;
    });
    setSelectedTraceName(nextTraceName);
    setDtTrace(nextTraceName);
  }
  function buildDemoNoiseResult(trace,fileMeta,filter){
    if(!trace||!trace.data||!trace.data.length)return null;
    var rawRbw=fileMeta&&fileMeta["RBW"]&&fileMeta["RBW"].value!=null?Number(fileMeta["RBW"].value):3000;
    var rbwValue=isFinite(rawRbw)&&rawRbw>0?rawRbw:3000;
    var psd=noisePSD(trace.data,rbwValue,filter||"gaussian");
    if(!psd.length)return null;
    var peak=psd.reduce(function(a,b){return a.amp>b.amp?a:b;});
    var min=psd.reduce(function(a,b){return a.amp<b.amp?a:b;});
    var avg=psd.reduce(function(sum,item){return sum+item.amp;},0)/psd.length;
    return makeSavedNoiseResult({src:trace,rbw:rbwValue,data:psd,peak:peak,min:min,avg:avg},filter||"gaussian",trace);
  }
  function syncTraceCountersFromSnapshot(snapshot){
    var normalized=normalizeWorkspaceSnapshot(snapshot);
    var traces=(normalized.files||[]).flatMap(function(file){return file.traces||[];}).concat(normalized.derivedTraces||[]);
    syncTraceIdCounter(traces);
  }
  function syncParserCounterFromSnapshot(snapshot){
    var normalized=normalizeWorkspaceSnapshot(snapshot);
    syncParserFileCounter(normalized.files||[]);
  }
  function syncFileIdCounterFromSnapshot(snapshot){
    var normalized=normalizeWorkspaceSnapshot(snapshot);
    var maxId=(normalized.files||[]).reduce(function(max,file){
      return file&&isFinite(file.id)&&Number(file.id)>max?Number(file.id):max;
    },0);
    if(maxId>_fid)_fid=maxId;
  }
  function getPaneVisibleTraces(paneId){
    return getPaneTracesForId(paneId).filter(function(tr){return !!vis[tr.name];});
  }
  function getTargetLinePaneIds(){
    return lockLinesAcrossPanes?panes.map(function(pane){return pane.id;}):[activePaneId];
  }
  useEffect(function(){
    if(!panes.length)return;
    var paneIds=panes.map(function(pane){return pane.id;});
    setRefLines(function(prev){
      var lines=Array.isArray(prev)?prev:[];
      var groups={};
      var changed=false;
      var maxId=lines.reduce(function(max,line){
        return line&&typeof line.id==="number"&&line.id>max?line.id:max;
      },0);
      lines.forEach(function(line){
        if(!line||!line.groupId)return;
        if(!groups[line.groupId])groups[line.groupId]=[];
        groups[line.groupId].push(line);
      });
      var next=lines.slice();
      Object.keys(groups).forEach(function(groupId){
        var members=groups[groupId];
        if(!members||!members.length)return;
        var exemplar=members[0];
        paneIds.forEach(function(paneId){
          var hasPaneMember=members.some(function(line){return line&&line.paneId===paneId;});
          if(hasPaneMember)return;
          changed=true;
          maxId++;
          next.push({
            id:maxId,
            type:exemplar.type,
            paneId:paneId,
            groupId:groupId,
            value:exemplar.value,
            label:exemplar.label
          });
        });
      });
      return changed?next:prev;
    });
  },[panes,setRefLines]);
  function selectTrace(traceName){
    var tr=getTraceByName(traceName);
    if(!tr)return;
    var paneId=getTracePaneId(tracePaneMap,traceName);
    setSelectedTraceName(traceName);
    setDtTrace(traceName);
    setPaneActiveTrace(paneId,traceName);
    setActivePaneId(paneId);
  }
  function moveSelectedTraceToPane(paneId){
    if(!selectedTraceName||!paneId)return;
    assignTraceToPane(selectedTraceName,paneId);
    setPaneActiveTrace(paneId,selectedTraceName);
    setActivePaneId(paneId);
  }
  function moveTraceToPane(traceName,paneId){
    if(!traceName||!paneId)return;
    assignTraceToPane(traceName,paneId);
    setPaneActiveTrace(paneId,traceName);
    setActivePaneId(paneId);
    setSelectedTraceName(traceName);
  }
  function onTouchstoneSetActiveFamily(fileId,family){
    if(fileId==null)return;
    setTouchstoneStateByFileId(function(prev){
      var next=Object.assign({},prev||{});
      next[fileId]=cloneTouchstoneSelectionState(next[fileId]||{});
      next[fileId].activeFamily=family||"S";
      return next;
    });
  }
  function onTouchstoneSetFamilyView(fileId,family,view){
    if(fileId==null||!family)return;
    setTouchstoneStateByFileId(function(prev){
      var next=Object.assign({},prev||{});
      next[fileId]=cloneTouchstoneSelectionState(next[fileId]||{});
      next[fileId].activeViewByFamily[family]=view;
      return next;
    });
  }
  function onTouchstoneSetExpanded(fileId,isExpanded){
    if(fileId==null)return;
    setTouchstoneStateByFileId(function(prev){
      var next=Object.assign({},prev||{});
      next[fileId]=cloneTouchstoneSelectionState(next[fileId]||{});
      next[fileId].isExpanded=isExpanded!==false;
      return next;
    });
  }
  function onTouchstoneToggleCell(fileId,family,row,col,view){
    if(fileId==null||!family||!isFinite(row)||!isFinite(col)||!view)return;
    var nextState=cloneTouchstoneStateForFile(fileId);
    var key=row+":"+col;
    var familySelections=Object.assign({},nextState.selectedCellsByFamily[family]||{});
    var views=Array.isArray(familySelections[key])?familySelections[key].slice():(familySelections[key]?[String(familySelections[key])]:[]);
    var existingIndex=views.indexOf(view);
    if(existingIndex!==-1)views.splice(existingIndex,1);
    else views.push(view);
    if(views.length)familySelections[key]=views;
    else delete familySelections[key];
    nextState.selectedCellsByFamily[family]=familySelections;
    nextState.activeFamily=family;
    nextState.activeViewByFamily[family]=view;
    setTouchstoneStateByFileId(function(prev){
      var next=Object.assign({},prev||{});
      next[fileId]=cloneTouchstoneSelectionState(nextState);
      return next;
    });
    updateTouchstoneFileSelections(fileId,nextState);
  }
  function onTouchstoneApplyPreset(fileId,preset,payload){
    if(fileId==null)return;
    var nextState=cloneTouchstoneSelectionState((payload&&payload.selections)?{
      activeFamily:payload.activeFamily||"S",
      activeViewByFamily:Object.assign({S:"dB",Y:"Mag",Z:"Mag"},(touchstoneStateByFileId&&touchstoneStateByFileId[fileId]&&touchstoneStateByFileId[fileId].activeViewByFamily)||{}),
      selectedCellsByFamily:payload.selections
    }:cloneTouchstoneStateForFile(fileId));
    if(payload&&payload.activeFamily)nextState.activeFamily=payload.activeFamily;
    setTouchstoneStateByFileId(function(prev){
      var next=Object.assign({},prev||{});
      next[fileId]=cloneTouchstoneSelectionState(nextState);
      return next;
    });
    updateTouchstoneFileSelections(fileId,nextState);
  }
  function onTouchstoneClearFileViews(fileId){
    if(fileId==null)return;
    var nextState=cloneTouchstoneStateForFile(fileId);
    nextState.selectedCellsByFamily={S:{},Y:{},Z:{}};
    setTouchstoneStateByFileId(function(prev){
      var next=Object.assign({},prev||{});
      next[fileId]=cloneTouchstoneSelectionState(nextState);
      return next;
    });
    updateTouchstoneFileSelections(fileId,nextState,{nextSelectedTraceName:null,nextDtTraceName:null});
  }
  function onGenerateTouchstoneTrace(metric,payload){
    var source=payload&&payload.networkSource||{};
    var fileId=source.parentFileId;
    if(fileId==null)return;
    upsertTouchstoneMetricTrace(fileId,metric||source.metric||payload.metric,payload);
  }
  function onTraceDragStart(traceName,ev){
    setDragTraceName(traceName);
    if(ev&&ev.dataTransfer){
      ev.dataTransfer.effectAllowed="move";
      try{ev.dataTransfer.setData("text/plain",traceName);}catch(_){}
      try{ev.dataTransfer.setData("text/trace-name",traceName);}catch(_){}
    }
  }
  function onTraceDragEnd(){
    setDragTraceName(null);
  }
  function onPaneDrop(paneId,ev){
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(isFileDragEvent(ev)&&ev&&ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files.length){
      pendingPaneImportRef.current={paneId:paneId,knownIds:new Set(rawTr.map(function(tr){return getTraceId(tr)||tr.name;}))};
      if(pendingPaneImportTimerRef.current)clearTimeout(pendingPaneImportTimerRef.current);
      setActivePaneId(paneId);
      setIsDrag(false);
      loadFiles(ev.dataTransfer.files,files.length>0);
      return;
    }
    var traceName=dragTraceName;
    if(!traceName&&ev&&ev.dataTransfer){
      try{traceName=ev.dataTransfer.getData("text/trace-name")||ev.dataTransfer.getData("text/plain")||null;}catch(_){}
    }
    if(traceName)moveTraceToPane(traceName,paneId);
    setDragTraceName(null);
  }
  function fitPane(paneId){
    var next=getPaneAutoYDomain(allTr,tracePaneMap,paneId,vis,getPaneZoom(paneId));
    syncYInputsForPane(next||null,paneId);
  }
  function fitAllPanes(){
    panes.forEach(function(pane){
      var next=getPaneAutoYDomain(allTr,tracePaneMap,pane.id,vis,getPaneZoom(pane.id));
      syncYInputsForPane(next||null,pane.id);
    });
  }
  function getTraceMathUnitWarning(aName,bName,op){
    var a=getTraceByName(aName),b=getTraceByName(bName);
    var aUnit=getEffectiveTraceYUnit(a);
    var bUnit=getEffectiveTraceYUnit(b);
    var aNorm=normalizeUnitName(aUnit);
    var bNorm=normalizeUnitName(bUnit);
    if(!aNorm||!bNorm)return "";
    var sameUnit=aNorm===bNorm;
    var aRatio=isDbRatioUnit(aNorm), bRatio=isDbRatioUnit(bNorm);
    var aAbs=isLogLevelUnit(aNorm), bAbs=isLogLevelUnit(bNorm);
    if(!sameUnit){
      if((aAbs&&bRatio)||(aRatio&&bAbs)){
        if(op==="add"||op==="subtract")return "";
        return "Warning: direct multiply/divide on logarithmic units is usually not physically meaningful.";
      }
      if((isLogUnit(aNorm)||isLogUnit(bNorm))&&(op==="multiply"||op==="divide")){
        return "Warning: direct multiply/divide on logarithmic units is usually not physically meaningful.";
      }
      if((aAbs||bAbs)&&(op==="add"||op==="subtract"))return "Warning: direct math between mixed logarithmic units may not be physically meaningful.";
      return "";
    }
    if(isDbRatioUnit(aNorm)){
      if(op==="multiply"||op==="divide")return "Warning: direct math on dB values is usually not physically meaningful.";
      return "";
    }
    if(isLogLevelUnit(aNorm)){
      if(op==="add")return "Warning: adding absolute logarithmic levels directly is not true physical addition.";
      if(op==="subtract")return "Note: subtracting absolute logarithmic levels gives a level difference in dB.";
      if(op==="multiply"||op==="divide")return "Warning: direct multiply/divide on logarithmic units is usually not physically meaningful.";
    }
    return "";
  }
  function buildDerivedLabel(base){
    var idx=1;
    var candidate=base+" "+idx;
    var used={};
    allTr.forEach(function(tr){
      used[getTraceLabel(tr)]=true;
      used[tr.name]=true;
    });
    while(used[candidate]){
      idx++;
      candidate=base+" "+idx;
    }
    return candidate;
  }
  function addDerivedTrace(drv){
    setDerivedTraces(function(prev){return prev.concat([drv]);});
    setVis(function(v){var nv=Object.assign({},v);nv[drv.name]=true;return nv;});
  }
  function removeDerivedTrace(traceName){
    var doomed=getTraceByName(traceName);
    if(!doomed||!isDerivedTrace(doomed))return;
    var doomedId=getTraceId(doomed);
    var graph=reconcileDerivedTraceGraph(rawTr,derivedTraces,[doomedId]);
    var removedNames=graph.removed.map(function(tr){return tr.name;});
    var removedIds=graph.removed.map(function(tr){return getTraceId(tr);}).filter(Boolean);
    setDerivedTraces(graph.kept);
    setVis(function(v){
      var nv=Object.assign({},v);
      removedNames.forEach(function(name){delete nv[name];});
      return nv;
    });
    setMarkers(function(prev){return prev.filter(function(mk){return removedNames.indexOf(mk.trace)===-1;});});
    setNoiseResults(function(lst){return lst.filter(function(r){return !savedResultReferencesAnyTrace(r,removedIds,removedNames);});});
    setIP3Results(function(lst){return lst.filter(function(r){return !savedResultReferencesAnyTrace(r,removedIds,removedNames);});});
    if(dtTrace&&removedNames.indexOf(dtTrace)!==-1)setDtTrace(null);
    if(noiseSource&&removedNames.indexOf(noiseSource)!==-1)setNoiseSource(null);
    if(dRef!=null&&markers[dRef]&&removedNames.indexOf(markers[dRef].trace)!==-1)setDRef(null);
    if(selectedMkrIdx!==null&&selectedMkrIdx!==undefined&&markers[selectedMkrIdx]&&removedNames.indexOf(markers[selectedMkrIdx].trace)!==-1)setSelectedMkrIdx(null);
  }
  function removeTrace(traceName){
    var tr=getTraceByName(traceName);
    if(tr&&isDerivedTrace(tr))removeDerivedTrace(traceName);
    else removeRawTrace(traceName);
  }
  var clearWorkspaceToBaseline=useCallback(function(){
    baseClearAllFiles();
    setDerivedTraces([]);
    setPaneMode(1);
    setActivePaneId("pane-1");
    setTracePaneMap({});
    setPaneActiveTraceMap({"pane-1":null});
    setSelectedTraceName(null);
    setDragTraceName(null);
    pendingPaneImportRef.current=null;
    if(pendingPaneImportTimerRef.current){clearTimeout(pendingPaneImportTimerRef.current);pendingPaneImportTimerRef.current=null;}
    setPaneActiveTrace("pane-1",null);
    setOffsetSource("");
    setOffsetValue("0");
    setScaleSource("");
    setScaleValue("1");
    setSmoothSource("");
    setSmoothMethod("moving-average");
    setSmoothWindow("5");
    setSmoothPolyOrder("2");
    setSubtractA("");
    setSubtractB("");
    setTraceMathOperation("subtract");
    setSubtractInterpolation("auto");
    setTraceOpsError("");
    setPeakTableLimit("10");
    setPeakTableMinSpacing("0");
    setPeakTableMinAmp("");
    setBandwidthDrop("3");
    setThresholdManual("");
    setObwPercent("99");
    setAnalysisOpenStateRaw(function(prev){return clearAllAnalysisOpenState(prev);});
    setShowSidebar(true);
    setShowMeta(false);
    setShowTouchstoneControls(true);
    setShowMarkers(true);
    setShowImportExportPanel(false);
    setRightPanelOrder(["analysis","data"]);
    prevRightPanelVisibilityRef.current={importExport:false,analysis:false,data:false};
    setShowMarkerTools(true);
    setShowPaneTools(true);
    setShowSearchTools(true);
    setShowLineTools(false);
    setShowViewTools(true);
    setShowDots(false);
    setShowDT(false);
    setLockLinesAcrossPanes(false);
    setSearchDirection("right");
    setNewMarkerArmed(false);
    setMkrMode("normal");
    setMarkerTrace("__auto__");
    setSelectedMkrIdx(null);
    setSelectedRefLineId(null);
    setShowTraceOps(false);
    setTraceOpsOpenSections({offset:false,scale:false,smoothing:false,subtract:false});
    setShowAnalysisPanel(false);
    setNoiseFilter("gaussian");
    setNoiseSource(null);
    setIP3Gain("");
    setTouchstoneStateByFileId({});
    clearAllXZooms();
    clearAllPaneYZooms();
  },[baseClearAllFiles,setPaneMode,setActivePaneId,setTracePaneMap,setPaneActiveTraceMap,setSelectedTraceName,setDragTraceName,setPaneActiveTrace,setOffsetSource,setOffsetValue,setScaleSource,setScaleValue,setSmoothSource,setSmoothMethod,setSmoothWindow,setSmoothPolyOrder,setSubtractA,setSubtractB,setTraceMathOperation,setSubtractInterpolation,setTraceOpsError,setPeakTableLimit,setPeakTableMinSpacing,setPeakTableMinAmp,setBandwidthDrop,setThresholdManual,setObwPercent,setAnalysisOpenStateRaw,setShowSidebar,setShowMeta,setShowTouchstoneControls,setShowMarkers,setShowImportExportPanel,setRightPanelOrder,setShowMarkerTools,setShowPaneTools,setShowSearchTools,setShowLineTools,setShowViewTools,setShowDots,setShowDT,setLockLinesAcrossPanes,setSearchDirection,setNewMarkerArmed,setMkrMode,setMarkerTrace,setSelectedMkrIdx,setSelectedRefLineId,setShowTraceOps,setTraceOpsOpenSections,setShowAnalysisPanel,setNoiseFilter,setNoiseSource,setIP3Gain,setTouchstoneStateByFileId,clearAllXZooms,clearAllPaneYZooms]);
  function clearAllFiles(){
    clearWorkspaceToBaseline();
  }
  function restoreSnapshot(snapshot){
    setShowImportExportPanel(false);
    setRightPanelOrder(["analysis","data"]);
    prevRightPanelVisibilityRef.current={importExport:false,analysis:false,data:false};
    return restoreWorkspaceSnapshot(snapshot,{
      setError:setError,
      setFiles:setFiles,
      setVis:setVis,
      setDerivedTraces:setDerivedTraces,
      setPaneMode:setPaneMode,
      setActivePaneId:setActivePaneId,
      setTracePaneMap:setTracePaneMap,
      setPaneActiveTrace:setPaneActiveTrace,
      setPaneActiveTraceMap:setPaneActiveTraceMap,
      setZoomAllRaw:setZoomAllRaw,
      setSharedZoom:setSharedZoom,
      setPaneXZooms:setPaneXZooms,
      setPaneYZooms:setPaneYZooms,
      setYMnI:setYMnI,
      setYMxI:setYMxI,
      setShowSidebar:setShowSidebar,
      setShowMeta:setShowMeta,
      setShowMarkers:setShowMarkers,
      setShowMarkerTools:setShowMarkerTools,
      setShowPaneTools:setShowPaneTools,
      setShowSearchTools:setShowSearchTools,
      setShowLineTools:setShowLineTools,
      setShowViewTools:setShowViewTools,
      setShowDots:setShowDots,
      setShowDT:setShowDT,
      setLockLinesAcrossPanes:setLockLinesAcrossPanes,
      setSearchDirection:setSearchDirection,
      setNewMarkerArmed:setNewMarkerArmed,
      setMarkerTrace:setMarkerTrace,
      setSelectedTraceName:setSelectedTraceName,
      setDtTrace:setDtTrace,
      setDragTraceName:setDragTraceName,
      setMarkers:setMarkers,
      setSelectedMkrIdx:setSelectedMkrIdx,
      setDRef:setDRef,
      setRefMode:setRefMode,
      setRefLines:setRefLines,
      setSelectedRefLineId:setSelectedRefLineId,
      setNoiseFilter:setNoiseFilter,
      setNoiseSource:setNoiseSource,
      setNoiseResults:setNoiseResults,
      resetIP3:ip3Ctl.resetIP3,
      setIP3Pts:setIP3Pts,
      setIP3Res:setIP3Res,
      syncIP3FromMarkers:ip3Ctl.syncFromMarkers,
      setIP3Gain:setIP3Gain,
      setIP3Results:setIP3Results,
      setShowTraceOps:setShowTraceOps,
      setTraceOpsOpenSections:setTraceOpsOpenSections,
      setShowAnalysisPanel:setShowAnalysisPanel,
      setAnalysisOpenStateRaw:setAnalysisOpenStateRaw,
      syncTraceIdCounter:syncTraceCountersFromSnapshot,
      syncParserFileCounter:syncParserCounterFromSnapshot,
      syncFileIdCounter:syncFileIdCounterFromSnapshot
    });
  }
  function restoreDemoWorkspace(preset){
    if(!preset)return false;
    var demoFiles=buildBundledDemoFiles(preset);
    if(!demoFiles.length)return false;
    clearWorkspaceToBaseline();
    var demoStateFiles=demoFiles.map(function(file){
      return {id:file.id,fileName:file.fileName,meta:file.meta,traces:file.traces};
    });
    var traceByKey={};
    var traceByName={};
    var visibleMap={};
    demoFiles.forEach(function(file){
      var trace=(file.traces&&file.traces[0])||null;
      if(trace)traceByKey[file.key]=trace;
      (file.traces||[]).forEach(function(tr){
        traceByName[tr.name]=tr;
        visibleMap[tr.name]=true;
      });
    });
    var selectedTrace=traceByKey[preset.selectedTraceKey]||demoFiles[0]?.traces?.[0]||null;
    var noiseTrace=traceByKey[preset.noiseSourceKey]||selectedTrace||null;
    var markerList=(preset.markers||[]).map(function(item){
      var trace=traceByKey[item.traceKey];
      if(!trace)return null;
      var point=nearestPoint(trace,item.freq,null,null);
      if(!point)return null;
      return {
        freq:point.freq,
        amp:point.amp,
        trace:trace.name,
        type:item.type||"peak",
        label:item.label||null
      };
    }).filter(Boolean);
    var ip3Points=getIP3PointsFromMarkers(markerList);
    var ip3Result=calcIP3FromPoints(ip3Points);
    var savedNoiseResults=(preset.savedNoise||[]).map(function(item){
      var trace=traceByKey[item.traceKey];
      if(!trace)return null;
      var file=demoFiles.find(function(entry){return entry.key===item.traceKey;})||null;
      return buildDemoNoiseResult(trace,file?file.meta:null,item.filter||"gaussian");
    }).filter(Boolean);
    var savedIP3Results=(preset.savedIP3||[]).map(function(item){
      var trace=traceByKey[item.traceKey]||selectedTrace;
      if(!trace||!ip3Result)return null;
      return makeSavedIP3Result(ip3Result,ip3Points,item&&item.gain!=null?item.gain:null,{
        traceLabel:getTraceLabel(trace),
        sourceTraceId:getTraceId(trace),
        sourceTraceName:trace.name,
        roles:buildIP3RoleRefs(ip3Points,function(name){return traceByName[name]||null;})
      });
    }).filter(Boolean);
    var restoredRefLines=(preset.refLines||[]).map(function(line,idx){
      return {
        id:idx+1,
        type:line.type,
        paneId:line.paneId||null,
        groupId:null,
        value:line.value,
        label:line.label||(line.type==="h"?(line.value.toFixed(2)+" dBm"):fmtF(line.value,true))
      };
    });
    clearAllXZooms();
    clearAllPaneYZooms();
    setFiles(demoStateFiles);
    setVis(visibleMap);
    setError(null);
    setDerivedTraces([]);
    setShowSidebar(preset.showSidebar!==false);
    setShowMeta(!!preset.showMeta);
    setShowMarkers(preset.showMarkers!==false);
    setShowMarkerTools(preset.showMarkerTools!==false);
    setShowPaneTools(preset.showPaneTools!==false);
    setShowSearchTools(preset.showSearchTools!==false);
    setShowLineTools(!!preset.showLineTools);
    setShowViewTools(preset.showViewTools!==false);
    setShowDots(false);
    setShowDT(false);
    setLockLinesAcrossPanes(false);
    setNewMarkerArmed(false);
    setMarkerTrace(traceByKey[preset.markerTraceKey]?traceByKey[preset.markerTraceKey].name:(selectedTrace?selectedTrace.name:"__auto__"));
    setMarkers(markerList);
    setSelectedMkrIdx(markerList.length?0:null);
    setDRef(null);
    setRefMode(null);
    setRefLines(restoredRefLines);
    setSelectedRefLineId(null);
    setNoiseFilter((preset.savedNoise&&preset.savedNoise[0]&&preset.savedNoise[0].filter)||"gaussian");
    setNoiseSource(noiseTrace?noiseTrace.name:null);
    setNoiseResults(savedNoiseResults);
    setIP3Pts(ip3Points);
    setIP3Res(ip3Result);
    setIP3Gain("");
    setIP3Results(savedIP3Results);
    setShowTraceOps(false);
    setTraceOpsOpenSections({offset:false,scale:false,smoothing:false,subtract:false});
    setShowAnalysisPanel(!!preset.showAnalysisPanel);
    setAnalysisOpenStateRaw(function(){return normalizeAnalysisOpenState(preset.analysisOpenState||{});});
    setPaneMode(clampPaneCount(preset.paneMode||1));
    setActivePaneId(preset.activePaneId||"pane-1");
    setTracePaneMap(function(){
      var next={};
      Object.keys(preset.traceAssignments||{}).forEach(function(key){
        var trace=traceByKey[key];
        if(trace)next[trace.name]=preset.traceAssignments[key]||"pane-1";
      });
      return next;
    });
    Object.keys(preset.paneActiveTraceKeys||{}).forEach(function(paneId){
      var trace=traceByKey[preset.paneActiveTraceKeys[paneId]];
      setPaneActiveTrace(paneId,trace?trace.name:null);
    });
    setSelectedTraceName(selectedTrace?selectedTrace.name:null);
    setDtTrace(selectedTrace?selectedTrace.name:null);
    return true;
  }
  function makeWorkspaceExportFileName(){
    var now=new Date();
    function pad(value){
      return String(value).padStart(2,"0");
    }
    return "mergen-scope-workspace-"+now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"-"+pad(now.getHours())+pad(now.getMinutes())+pad(now.getSeconds())+".json";
  }
  function exportWorkspace(){
    try{
      var payload=buildWorkspaceExportPackage(buildCurrentWorkspaceSnapshot());
      var text=JSON.stringify(payload,null,2);
      var blob=new Blob([text],{type:"application/json"});
      var urlApi=window.URL||window.webkitURL;
      if(!urlApi||!urlApi.createObjectURL)throw new Error("This browser does not support file downloads.");
      var url=urlApi.createObjectURL(blob);
      var link=document.createElement("a");
      link.href=url;
      link.download=makeWorkspaceExportFileName();
      link.style.display="none";
      document.body.appendChild(link);
      link.click();
      setTimeout(function(){
        if(link.parentNode)link.parentNode.removeChild(link);
        urlApi.revokeObjectURL(url);
      },0);
      setError(null);
    }catch(err){
      setError("Unable to export workspace: "+(err&&err.message?err.message:"Unknown error."));
    }
  }
  function exportTraceData(){
    try{
      var payload=buildTraceExportPackage({
        allTr:allTr,
        vis:vis,
        panes:panes,
        activePaneId:activePaneId,
        selectedTraceName:selectedTraceName,
        tracePaneMap:tracePaneMap,
        markers:markers,
        referenceLines:refLines,
        noiseSource:noiseSource,
        noiseFilter:noiseFilter,
        npsdStats:npsdStats,
        savedNoiseResults:noiseResults,
        savedIP3Results:ip3Results
      });
      downloadJsonFile(buildTimestampedDownloadName("mergen-scope-data-export","json"),payload);
      setError(null);
    }catch(err){
      setError("Unable to export trace data: "+(err&&err.message?err.message:"Unknown error."));
    }
  }
  function exportChartSvg(){
    try{
      var exportAsset=buildChartVectorExport({kind:"svg"});
      downloadBlobFile(new Blob([exportAsset.markup],{type:"image/svg+xml;charset=utf-8"}),buildTimestampedDownloadName("mergen-scope-chart","svg"));
      setError(null);
    }catch(err){
      setError("Unable to export chart SVG: "+(err&&err.message?err.message:"Unknown error."));
    }
  }
  function exportChartPng(){
    try{
      var exportAsset=buildChartVectorExport({kind:"png"});
      exportSvgMarkupAsPngFile(exportAsset.markup,exportAsset.width,exportAsset.height,buildTimestampedDownloadName("mergen-scope-chart","png"),{scale:3,backgroundColor:exportAsset.backgroundColor}).then(function(){
        setError(null);
      }).catch(function(err){
        setError("Unable to export chart PNG: "+(err&&err.message?err.message:"Unknown error."));
      });
    }catch(err){
      setError("Unable to prepare chart PNG export: "+(err&&err.message?err.message:"Unknown error."));
    }
  }
  function escapeExportText(value){
    return String(value==null?"":value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&apos;");
  }
  function getExportThemeColors(){
    var rootStyles=window.getComputedStyle?window.getComputedStyle(document.documentElement):null;
    var bodyStyles=window.getComputedStyle?window.getComputedStyle(document.body):null;
    function cssVar(name,fallback){
      var value=rootStyles?String(rootStyles.getPropertyValue(name)||"").trim():"";
      return value||fallback;
    }
    return {
      backgroundColor:(bodyStyles&&bodyStyles.backgroundColor)||cssVar("--bg","#ffffff"),
      cardColor:cssVar("--card","#ffffff"),
      textColor:cssVar("--text","#111111"),
      mutedColor:cssVar("--muted","#666666"),
      borderColor:cssVar("--border","#d0d7de")
    };
  }
  function appendSvgRows(parts,x,y,width,rows,colors){
    rows.forEach(function(row,index){
      var rowY=y+20+(index*18);
      parts.push('<text x="'+(x+12)+'" y="'+rowY+'" font-size="12" fill="'+escapeExportText(colors.mutedColor)+'">'+escapeExportText(row.label)+'</text>');
      parts.push('<text x="'+(x+width-12)+'" y="'+rowY+'" font-size="12" font-family="monospace" text-anchor="end" fill="'+escapeExportText(row.color||colors.textColor)+'">'+escapeExportText(row.value)+'</text>');
    });
  }
  function appendSvgCard(parts,x,y,width,title,titleColor,rows,colors){
    var cardHeight=40+(rows.length*18)+10;
    parts.push('<g transform="translate('+x+' '+y+')">');
    parts.push('<rect x="0" y="0" width="'+width+'" height="'+cardHeight+'" rx="10" fill="'+escapeExportText(colors.cardColor)+'" stroke="'+escapeExportText(colors.borderColor)+'"/>');
    parts.push('<text x="12" y="22" font-size="12" font-weight="700" fill="'+escapeExportText(titleColor||colors.textColor)+'">'+escapeExportText(title)+'</text>');
    appendSvgRows(parts,0,14,width,rows,colors);
    parts.push("</g>");
    return cardHeight;
  }
  function getExportTraceSourceRows(){
    var traces=(allTr||[]).filter(function(tr){return tr&&tr.name&&vis[tr.name];});
    if(!traces.length)traces=(allTr||[]).filter(function(tr){return tr&&tr.name;});
    return traces.map(function(tr){
      var file=getTraceFile(tr.name);
      return {
        label:getTraceLabel(tr)||tr.name,
        value:file&&file.fileName?file.fileName:(isDerivedTrace(tr)?"Derived trace":"Unknown file"),
        color:traceColorMap[tr.name]||C.text
      };
    });
  }
  function buildChartVectorExport(options){
    options=options||{};
    if(!chartExportRef.current)throw new Error("The chart is not ready to export yet.");
    var serializer=new XMLSerializer();
    var paneGap=12;
    var padding=options.kind==="png"?16:0;
    var colors=getExportThemeColors();
    var paneSvgs=Array.from(chartExportRef.current.querySelectorAll("svg.recharts-surface")).map(function(node){
      var rect=node.getBoundingClientRect();
      return {node:node,width:Math.max(1,Math.round(rect.width)),height:Math.max(1,Math.round(rect.height))};
    }).filter(function(item){return item.width>1&&item.height>1;});
    if(!paneSvgs.length)throw new Error("No chart SVG surfaces are available to export.");
    var graphWidth=paneSvgs.reduce(function(max,item){return Math.max(max,item.width);},0);
    var graphHeight=paneSvgs.reduce(function(sum,item,idx){return sum+item.height+(idx<paneSvgs.length-1?paneGap:0);},0);
    var width=graphWidth+(padding*2);
    var traceSourceRows=getExportTraceSourceRows();
    var parts=['<?xml version="1.0" encoding="UTF-8"?>','<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+width+'" height="__HEIGHT__" viewBox="0 0 '+width+' __HEIGHT__">','<rect x="0" y="0" width="'+width+'" height="__HEIGHT__" fill="'+escapeExportText(colors.backgroundColor)+'"/>','<style>text{font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;} .mono{font-family:Consolas,Menlo,Monaco,monospace;}</style>'];
    var currentY=padding;
    paneSvgs.forEach(function(item,idx){
      var clone=item.node.cloneNode(true);
      clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");
      clone.setAttribute("width",item.width);
      clone.setAttribute("height",item.height);
      clone.setAttribute("x",padding);
      clone.setAttribute("y",currentY);
      parts.push(serializer.serializeToString(clone));
      currentY+=item.height+(idx<paneSvgs.length-1?paneGap:0);
    });
    var cardY=currentY+16;
    var cardWidth=width-(padding*2);
    if(traceSourceRows.length){
      cardY+=appendSvgCard(parts,padding,cardY,cardWidth,"Trace Sources",C.accent,traceSourceRows,colors)+10;
    }
    if(options.kind==="png"){
      markers.forEach(function(marker,index){
        var traceLabel=(getTraceByName(marker.trace)&&getTraceLabel(getTraceByName(marker.trace)))||marker.trace||"-";
        var markerColor=(traceColorMap&&marker.trace&&traceColorMap[marker.trace])||(mcMap[marker.type]||C.accent);
        var rows=[
          {label:"Freq",value:fmtF(marker.freq,true)},
          {label:"Amp",value:marker.amp.toFixed(3)+" "+yU}
        ];
        if(marker.type==="delta"&&marker.refIdx!==undefined&&marker.refIdx!==null&&markers[marker.refIdx]){
          rows.push({label:"dFreq",value:fmtF(marker.freq-markers[marker.refIdx].freq,true)});
          rows.push({label:"dAmp",value:(marker.amp-markers[marker.refIdx].amp).toFixed(3)+" dB"});
        }
        cardY+=appendSvgCard(parts,padding,cardY,cardWidth,(marker.label||("M"+(index+1)))+"  "+traceLabel,markerColor,rows,colors)+10;
      });
      noiseResults.forEach(function(result){
        var values=result.values||{},params=result.parameters||{};
        cardY+=appendSvgCard(parts,padding,cardY,cardWidth,result.traceLabel||result.sourceTraceName||"-",C.noiseTr,[
          {label:"Filter",value:params.filterLabel||params.filter||"-"},
          {label:"Peak",value:(values.peak||0).toFixed(2)+" dBm/Hz"},
          {label:"Avg",value:(values.avg||0).toFixed(2)+" dBm/Hz"},
          {label:"Min",value:(values.min||0).toFixed(2)+" dBm/Hz"}
        ],colors)+10;
      });
      ip3Results.forEach(function(result){
        var values=result.values||{},params=result.parameters||{};
        var rows=[
          {label:"OIP3 avg",value:(values.oip3_avg||0).toFixed(2)+" "+yU},
          {label:"OIP3 low",value:(values.oip3_l||0).toFixed(2)+" "+yU},
          {label:"OIP3 high",value:(values.oip3_u||0).toFixed(2)+" "+yU}
        ];
        if(params.gain!=null)rows.push({label:"IIP3 avg",value:((values.oip3_avg||0)-params.gain).toFixed(2)+" "+yU});
        cardY+=appendSvgCard(parts,padding,cardY,cardWidth,result.traceLabel||result.sourceTraceName||"-",C.ip3C,rows,colors)+10;
      });
    }
    currentY=cardY;
    var totalHeight=Math.max(1,currentY+padding);
    parts.push("</svg>");
    var markup=parts.join("").replace(/__HEIGHT__/g,String(totalHeight));
    return {markup:markup,width:width,height:totalHeight,backgroundColor:colors.backgroundColor};
  }
  function importWorkspaceFile(file){
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var rawText=String(ev&&ev.target&&ev.target.result!=null?ev.target.result:"");
        var payload=JSON.parse(rawText);
        var snapshot=extractWorkspaceSnapshotFromPackage(payload);
        clearWorkspaceToBaseline();
        if(!restoreSnapshot(snapshot))throw new Error("Unable to restore workspace.");
        setError(null);
      }catch(err){
        setError(file.name+": "+(err&&err.message?err.message:"Unable to import workspace."));
      }
    };
    reader.onerror=function(){
      setError(file.name+": Unable to read workspace file.");
    };
    reader.readAsText(file);
  }
  function openWorkspace(){
    if(hasData&&!window.confirm("Replace the current workspace with the selected workspace file?"))return;
    if(wRef.current)wRef.current.click();
  }
  function createOffsetDerivedTrace(){
    var src=getTraceByName(offsetSource)||traceOptions[0]||null;
    var offsetDb=parseFloat(offsetValue);
    if(!src||!isFinite(offsetDb))return;
    var srcData=getTraceData(src);
    if(!srcData.length)return;
    var sign=offsetDb>=0?"+":"";
    var label=buildDerivedLabel((getTraceLabel(src)||src.name)+" ["+sign+offsetDb.toFixed(2)+" dB]");
    var data=srcData.map(function(p){return {freq:p.freq,amp:p.amp+offsetDb};});
    var drv=createDerivedTrace(src,"offset",{offsetDb:offsetDb},data,label);
    addDerivedTrace(drv);
    setTraceOpsError("");
  }
  function createScaledDerivedTrace(){
    var src=getTraceByName(scaleSource)||traceOptions[0]||null;
    var factor=parseFloat(scaleValue);
    if(!src||!isFinite(factor))return;
    var srcData=getTraceData(src);
    if(!srcData.length)return;
    var label=buildDerivedLabel((getTraceLabel(src)||src.name)+" [x"+factor.toFixed(3)+"]");
    var data=srcData.map(function(p){return {freq:p.freq,amp:p.amp*factor};});
    var drv=createDerivedTrace(src,"scale",{factor:factor},data,label);
    addDerivedTrace(drv);
    setTraceOpsError("");
  }
  function createSmoothedDerivedTrace(){
    var src=getTraceByName(smoothSource)||traceOptions[0]||null;
    if(!src)return;
    var srcData=getTraceData(src);
    if(!srcData.length)return;
    var method=smoothMethod||"moving-average";
    var result=smoothTraceData(srcData,method,smoothWindow,smoothPolyOrder);
    var data=result.data;
    var methodLabel=method==="none"?"none":method==="moving-average"?"ma":method==="median-filter"?"median":"sgolay";
    var label=buildDerivedLabel((getTraceLabel(src)||src.name)+" [smooth "+methodLabel+(result.window>1?(" "+result.window):"")+(result.polyOrder!=null?(" p"+result.polyOrder):"")+"]");
    var drv=createDerivedTrace(src,"smoothing",{method:method,windowPoints:result.window,polyOrder:result.polyOrder},data,label);
    addDerivedTrace(drv);
    setSmoothWindow(String(result.window||1));
    if(result.polyOrder!=null)setSmoothPolyOrder(String(result.polyOrder));
    setTraceOpsError("");
  }
  function createTraceMathDerivedTrace(){
    var a=getTraceByName(subtractA)||traceOptions[0]||null;
    var b=getTraceByName(subtractB)||traceOptions[1]||null;
    if(!a||!b||a.name===b.name){
      setTraceOpsError("Choose two different source traces for trace math.");
      return;
    }
    var aUnits=a.units||{},bUnits=b.units||{};
    if((aUnits.y||"")!== (bUnits.y||"")){
      setTraceOpsError("Trace math requires matching Y units.");
      return;
    }
    var aData=getTraceData(a),bData=getTraceData(b);
    if(!aData.length||!bData.length){
      setTraceOpsError("Trace math requires both traces to have data.");
      return;
    }
    var calc=computeBinaryTraceMathData(aData,bData,subtractInterpolation,traceMathOperation);
    if(calc.error){
      setTraceOpsError(calc.error);
      return;
    }
    var opSymbol=traceMathOperation==="add"?"+":traceMathOperation==="subtract"?"-":traceMathOperation==="multiply"?"*":"/";
    var opType=traceMathOperation==="add"?"add":traceMathOperation==="subtract"?"subtract":traceMathOperation==="multiply"?"multiply":"divide";
    var label=buildDerivedLabel((getTraceLabel(a)||a.name)+" "+opSymbol+" "+(getTraceLabel(b)||b.name));
    var drv=createDerivedTrace(a,opType,{sourceA:getTraceId(a),sourceB:getTraceId(b),sourceATrace:a.name,sourceBTrace:b.name,policy:"overlap-only",requestedInterpolation:subtractInterpolation,appliedInterpolation:calc.appliedInterpolation,grid:"A",operation:traceMathOperation,droppedPoints:calc.droppedPoints},calc.data,label);
    var resolvedYUnit=resolveTraceMathResultUnit(getEffectiveTraceYUnit(a),getEffectiveTraceYUnit(b),traceMathOperation);
    if(resolvedYUnit)setDerivedTraceYUnit(drv,resolvedYUnit);
    drv.sourceTraceIds=[getTraceId(a),getTraceId(b)].filter(Boolean);
    addDerivedTrace(drv);
    setTraceOpsError("");
  }
  useEffect(function(){
    if(offsetSource&&traceOptions.some(function(tr){return tr.name===offsetSource;}))return;
    setOffsetSource(traceOptions[0]?traceOptions[0].name:"");
  },[offsetSource,traceOptions]);
  useEffect(function(){
    if(scaleSource&&traceOptions.some(function(tr){return tr.name===scaleSource;}))return;
    setScaleSource(traceOptions[0]?traceOptions[0].name:"");
  },[scaleSource,traceOptions]);
  useEffect(function(){
    if(smoothSource&&traceOptions.some(function(tr){return tr.name===smoothSource;}))return;
    setSmoothSource(traceOptions[0]?traceOptions[0].name:"");
  },[smoothSource,traceOptions]);
  useEffect(function(){
    if(subtractA&&traceOptions.some(function(tr){return tr.name===subtractA;}))return;
    setSubtractA(traceOptions[0]?traceOptions[0].name:"");
  },[subtractA,traceOptions]);
  useEffect(function(){
    if(subtractB&&traceOptions.some(function(tr){return tr.name===subtractB&&tr.name!==subtractA;}))return;
    var fallback=traceOptions.find(function(tr){return tr.name!==subtractA;})||traceOptions[0]||null;
    setSubtractB(fallback?fallback.name:"");
  },[subtractB,subtractA,traceOptions]);
  useEffect(function(){
    setDerivedTraces(function(prev){
      var graph=reconcileDerivedTraceGraph(rawTr,prev,[]);
      return graph.removed.length?graph.kept:prev;
    });
  },[rawTr]);
  useEffect(function(){
    var validIds={};
    var validNames={};
    allTr.forEach(function(tr){ validNames[tr.name]=true; var id=getTraceId(tr); if(id)validIds[id]=true; });
    setMarkers(function(prev){
      var next=prev.filter(function(mk){return !!validNames[mk.trace];});
      return next.length===prev.length?prev:next;
    });
    setNoiseResults(function(lst){
      var next=lst.filter(function(r){return savedResultHasValidTraceRefs(r,validIds,validNames);});
      return next.length===lst.length?lst:next;
    });
    setIP3Results(function(lst){
      var next=lst.filter(function(r){return savedResultHasValidTraceRefs(r,validIds,validNames);});
      return next.length===lst.length?lst:next;
    });
  },[allTr,setMarkers,setNoiseResults,setIP3Results]);
  useEffect(function(){
    var names={};
    allTr.forEach(function(tr){ names[tr.name]=true; });
    setVis(function(prev){
      var next={},changed=false;
      Object.keys(prev||{}).forEach(function(name){
        if(names[name])next[name]=prev[name];
        else changed=true;
      });
      allTr.forEach(function(tr){
        if(!(tr.name in next)){ next[tr.name]=true; changed=true; }
      });
      return changed?next:prev;
    });
  },[allTr,setVis]);
  useEffect(function(){
    if(dtTrace&&allTr.some(function(t){return t.name===dtTrace;}))return;
    setDtTrace(allTr[0]?allTr[0].name:null);
  },[dtTrace,allTr,setDtTrace]);
  useEffect(function(){
    if(selectedTraceName&&allTr.some(function(t){return t.name===selectedTraceName;}))return;
    setSelectedTraceName(allTr[0]?allTr[0].name:null);
  },[selectedTraceName,allTr]);
  useEffect(function(){
    var pending=pendingPaneImportRef.current;
    if(!pending)return;
    var added=rawTr.filter(function(tr){
      var id=getTraceId(tr)||tr.name;
      return !pending.knownIds.has(id);
    });
    if(!added.length)return;
    added.forEach(function(tr){
      assignTraceToPane(tr.name,pending.paneId);
      pending.knownIds.add(getTraceId(tr)||tr.name);
    });
    var last=added[added.length-1];
    if(last){
      setSelectedTraceName(last.name);
      setDtTrace(last.name);
      setPaneActiveTrace(pending.paneId,last.name);
      setActivePaneId(pending.paneId);
    }
    if(pendingPaneImportTimerRef.current)clearTimeout(pendingPaneImportTimerRef.current);
    pendingPaneImportTimerRef.current=setTimeout(function(){
      pendingPaneImportRef.current=null;
      pendingPaneImportTimerRef.current=null;
    },400);
  },[rawTr,assignTraceToPane,setPaneActiveTrace]);
  useEffect(function(){
    return function(){
      if(pendingPaneImportTimerRef.current)clearTimeout(pendingPaneImportTimerRef.current);
    };
  },[]);
  useEffect(function(){
    if(noiseSource&&allTr.some(function(t){return t.name===noiseSource&&getTraceData(t).length;}))return;
    var first=allTr.find(function(t){return t&&getTraceData(t).length;});
    if(first)setNoiseSource(first.name);
  },[noiseSource,allTr,setNoiseSource]);
  useEffect(function(){
    if(demoBootRef.current)return;
    var demoId=getDemoLaunchPresetId();
    if(!demoId)return;
    demoBootRef.current=true;
    var preset=getDemoWorkspacePresetById(demoId);
    if(!preset){
      setError("Unknown demo preset: "+demoId);
      clearDemoLaunchQueryParam();
      return;
    }
    if(restoreDemoWorkspace(preset))clearDemoLaunchQueryParam();
    else setError("Unable to load demo preset.");
  },[]);
  useEffect(function(){
    if(selectedRefLineId===null||selectedRefLineId===undefined)return;
    var selectedLine=refLines.find(function(line){return line&&line.id===selectedRefLineId;})||null;
    if(selectedLine&&selectedLine.paneId&&selectedLine.paneId!==activePaneId)setSelectedRefLineId(null);
  },[selectedRefLineId,refLines,activePaneId,setSelectedRefLineId]);

  var normalizedAnalysisOpenState=useMemo(function(){return normalizeAnalysisOpenState(analysisOpenState);},[analysisOpenState]);
  var traceMathUnitWarning=useMemo(function(){
    return getTraceMathUnitWarning(subtractA,subtractB,traceMathOperation);
  },[subtractA,subtractB,traceMathOperation]);
  var analysisPanelVisible=showTraceOps||showAnalysisPanel;
  useEffect(function(){
    var prev=prevRightPanelVisibilityRef.current||{importExport:false,analysis:false,data:false};
    if(analysisPanelVisible&&!prev.analysis)promoteRightPanelSection("analysis");
    if(showDT&&!prev.data)promoteRightPanelSection("data");
    prevRightPanelVisibilityRef.current={
      importExport:showImportExportPanel,
      analysis:analysisPanelVisible,
      data:showDT
    };
  },[showImportExportPanel,analysisPanelVisible,showDT,promoteRightPanelSection]);
  var analysisButtons=useMemo(function(){
    return [
      {id:"trace-ops",title:"Trace Ops",tooltip:"Open derived-trace tools such as offset, scale, smoothing, and trace math.",active:showTraceOps,color:C.tr[4],onClick:function(){
        promoteRightPanelSection("analysis");
        setShowTraceOps(function(p){return !p;});
      }},
      {id:"analysis",title:"Analysis",tooltip:"Open numeric measurement tools such as Noise PSD, IP3, peak tables, bandwidth, crossings, and range statistics.",active:(showAnalysisPanel||anyOpenAnalysis),color:C.tr[5]||C.accent,onClick:function(){
        if(showAnalysisPanel||anyOpenAnalysis){
          setShowAnalysisPanel(false);
          closeAllAnalysisCards();
          return;
        }
        promoteRightPanelSection("analysis");
        setShowAnalysisPanel(true);
      }}
    ];
  },[showTraceOps,setShowTraceOps,showAnalysisPanel,setShowAnalysisPanel,anyOpenAnalysis,closeAllAnalysisCards,C,promoteRightPanelSection]);

  var noiseMeta=noiseSource?getTraceMeta(noiseSource):m0;
  var nav=useChartNav({allTr:allTr,xAllTr:allTr,vis:vis,colors:C.tr,zoom:zoom,setZoom:setZoom,syncYInputs:syncYInputs,resetY:resetYZ,chartRef:chartRef,panRef:panRef,suppressClickRef:suppressClickRef,mouseBtnRef:mouseBtnRef,crosshair:crosshair,getActivePaneModel:function(){return activePaneModelRef.current;},getActivePaneYZoom:function(){return getPaneYZoom(activePaneId);}});
  selA=nav.selA;setSelA=nav.setSelA;selB=nav.selB;setSelB=nav.setSelB;hoverX=nav.hoverX;hoverData=nav.hoverData;getMouseBtn=nav.getMouseBtn;getXDomain=nav.getXDomain;getXDomainHz=nav.getXDomainHz;freqFromClientX=nav.freqFromClientX;panXWindow=nav.panXWindow;chartMM=nav.chartMM;chartML=nav.chartML;mDown=nav.mDown;mUp=nav.mUp;onChartContainerMouseDownCapture=nav.onChartContainerMouseDownCapture;onChartContainerMouseUpCapture=nav.onChartContainerMouseUpCapture;
  var rbw=noiseMeta["RBW"]?.value||m0["RBW"]?.value||3000;
  var nextPeakExclusion=useMemo(function(){
    var vals=allTr.filter(function(t){return vis[t.name];}).map(function(t){return fileMap[t.fileId]?.meta?.["RBW"]?.value;}).filter(function(v){return typeof v==="number"&&!isNaN(v)&&v>0;});
    var base=vals.length?Math.max.apply(null,vals):(rbw||3000);
    return base*3;
  },[allTr,vis,fileMap,rbw]);

  var npsdStats=useNoisePSDModel({noiseSource:noiseSource,noiseFilter:noiseFilter,allTr:allTr,rbw:rbw,files:files,getTraceMeta:getTraceMeta});
  useEffect(function(){
    if(!showNoise)return;
    if(noiseSource&&allTr.some(function(t){return t.name===noiseSource&&t.data&&t.data.length;}))return;
    var first=allTr.find(function(t){return t&&t.data&&t.data.length;});
    if(first&&first.name!==noiseSource)setNoiseSource(first.name);
  },[showNoise,noiseSource,allTr,setNoiseSource]);
  useEffect(function(){
    ip3Ctl.syncFromMarkers(markers);
  },[markers,ip3Ctl.syncFromMarkers]);

  var selectedMarker=(selectedMkrIdx!==null&&selectedMkrIdx!==undefined)?markers[selectedMkrIdx]||null:null;
  var selectedHLine=useMemo(function(){
    return resolveSelectedHorizontalLine(refLines,selectedRefLineId,activePaneId);
  },[refLines,selectedRefLineId,activePaneId]);
  function assignSelectedRole(role){
    if(selectedMkrIdx===null||selectedMkrIdx===undefined||!markers[selectedMkrIdx])return;
    var label=IP3_ROLE_LABELS[role];
    setMarkers(function(prev){
      var next=prev.slice();
      next=next.map(function(marker,idx){
        if(!marker)return marker;
        if(idx===selectedMkrIdx)return Object.assign({},marker,{label:label,type:"peak"});
        if(marker.label===label)return cloneMarkerWithoutIP3Label(marker);
        return marker;
      });
      return next;
    });
  }
  function clearSelectedRole(){
    if(selectedMkrIdx===null||selectedMkrIdx===undefined||!markers[selectedMkrIdx])return;
    setMarkers(function(prev){
      var next=prev.slice();
      next[selectedMkrIdx]=cloneMarkerWithoutIP3Label(next[selectedMkrIdx]);
      return next;
    });
  }
  function autoPickIP3(){
    if(!selectedMarker)return;
    ip3Flow.tryAutoCompleteIP3({freq:selectedMarker.freq,amp:selectedMarker.amp,trace:selectedMarker.trace},selectedMkrIdx);
  }

  var traceColorMap=useMemo(function(){
    var map={},rawIdx=0,derivedIdx=0;
    var rawPalette=C.tr&&C.tr.length?C.tr:[C.accent];
    var derivedPalette=C.dr&&C.dr.length?C.dr:rawPalette;
    allTr.forEach(function(tr){
      var palette,isDerivedVisual,touchstoneFamily;
      if(!tr||!tr.name)return;
      touchstoneFamily=(getTouchstoneTraceFamily&&isTouchstoneTrace&&isTouchstoneTrace(tr))?String(getTouchstoneTraceFamily(tr)||"").toUpperCase():"";
      isDerivedVisual=!!(isDerivedTrace(tr)||tr.operationType==="touchstone-stability"||touchstoneFamily==="Y"||touchstoneFamily==="Z");
      palette=isDerivedVisual?derivedPalette:rawPalette;
      if(tr.operationType==="touchstone-stability"&&tr.networkSource&&tr.networkSource.metric){
        var metricOrder={k:0,mu1:1,mu2:2,deltaMag:3};
        var metricKey=String(tr.networkSource.metric||"");
        map[tr.name]=palette[metricOrder.hasOwnProperty(metricKey)?metricOrder[metricKey]%palette.length:derivedIdx%palette.length];
        derivedIdx++;
        return;
      }
      if(isDerivedVisual){
        map[tr.name]=palette[derivedIdx%palette.length];
        derivedIdx++;
        return;
      }
      map[tr.name]=palette[rawIdx%palette.length];
      rawIdx++;
    });
    return map;
  },[allTr,C]);




  /* ── Chart data ── */
    var paneModels=useMemo(function(){
      return panes.map(function(pane){
      var traces=getPaneTracesForId(pane.id);
      var paneZoom=getPaneZoom(pane.id);
      var m=new Map();
      traces.forEach(function(tr){
        if(!vis[tr.name])return;
        var d=getVisibleTraceData(tr,paneZoom);
        d.forEach(function(point){
          if(!m.has(point.freq))m.set(point.freq,{freq:point.freq});
          m.get(point.freq)[tr.name]=point.amp;
        });
      });
      var sorted=Array.from(m.values()).sort(function(a,b){return a.freq-b.freq;});
      var sf=sorted.length?Math.abs(sorted[0].freq):0;
      var div=sf>=1e9?1e9:sf>=1e6?1e6:sf>=1e3?1e3:1;
      var unit=div===1e9?"GHz":div===1e6?"MHz":div===1e3?"kHz":"Hz";
      var minF=sorted.length?sorted[0].freq/div:0;
      var maxF=sorted.length?sorted[sorted.length-1].freq/div:0;
      var spanD=Math.abs(maxF-minF);
      var tickDp=spanD>100?0:spanD>10?1:spanD>1?2:spanD>0.1?3:spanD>0.01?4:spanD>0.001?5:6;
      var selectedTraceInPane=(selectedMkrIdx!==null&&selectedMkrIdx!==undefined&&markers[selectedMkrIdx]&&getTracePaneId(tracePaneMap,markers[selectedMkrIdx].trace)===pane.id)?markers[selectedMkrIdx].trace:null;
      var paneActiveTraceName=selectedTraceInPane||(getPaneActiveTraceName(pane.id)||null);
      var axisInfo=deriveAxisInfo(traces,vis,paneActiveTraceName,unit,hasData);
      return {
        pane:pane,
        traces:traces,
        cData:sorted.map(function(row){row.fs=row.freq/div;return row;}),
        paneZoom:paneZoom,
        fDiv:div,
        fUnit:unit,
        tickDp:tickDp||2,
        axisInfo:axisInfo,
        paneActiveTraceName:paneActiveTraceName,
        paneYZoom:sanitizeYDomain(paneYZooms[pane.id])||null,
        autoYDomain:getPaneAutoYDomain(allTr,tracePaneMap,pane.id,vis,paneZoom)
      };
    });
  },[panes,getPaneTracesForId,vis,getPaneZoom,selectedMkrIdx,markers,tracePaneMap,getPaneActiveTraceName,hasData,paneYZooms,allTr]);
    var activePaneModel=useMemo(function(){
      return paneModels.find(function(model){return model.pane.id===activePaneId;})||paneModels[0]||null;
    },[paneModels,activePaneId]);
    activePaneModelRef.current=activePaneModel;
  var cTr=activePaneModel?activePaneModel.traces.slice():[];
  var cData=activePaneModel?activePaneModel.cData:[]; 
  var fDiv=activePaneModel?activePaneModel.fDiv:1;
  var fUnit=activePaneModel?activePaneModel.fUnit:"Hz";
  var tickDp=activePaneModel?activePaneModel.tickDp:2;
  var analysisTarget=useMemo(function(){
    return resolveAnalysisTarget({
      activePaneId:activePaneId,
      activePaneModel:activePaneModel,
      selectedTraceName:selectedTraceName,
      zoom:zoom,
      vis:vis,
      getTraceFile:function(traceName){return getTraceFile(traceName);}
    });
  },[activePaneId,activePaneModel,selectedTraceName,zoom,vis,files]);
  var analysisRegistry=useAnalysisRegistry({analysisOpenState:normalizedAnalysisOpenState,noiseResults:noiseResults,ip3Results:ip3Results,target:analysisTarget});
  var visibleAnalysisIds=useMemo(function(){
    return (analysisRegistry||[]).map(function(item){return item.id;});
  },[analysisRegistry]);
  var anyOpenAnalysis=useMemo(function(){
    return (analysisRegistry||[]).some(function(item){return !!item.isOpen;});
  },[analysisRegistry]);
  analysisPanelVisible=showTraceOps||showAnalysisPanel||anyOpenAnalysis;
  var addPeakTableMarker=useCallback(function(target,row,selectNew){
    if(!target||!target.trace||!row)return;
    setSelectedRefLineId(null);
    markerCtl.addMarker({freq:row.freq,amp:row.amp,trace:target.trace.name,type:"peak",label:"P"+row.rank},selectNew!==false);
  },[markerCtl,setSelectedRefLineId]);
  var addAllPeakTableMarkers=useCallback(function(target,rows){
    if(!target||!target.trace||!Array.isArray(rows)||!rows.length)return;
    setSelectedRefLineId(null);
    setMarkers(function(prev){
      var next=(prev||[]).concat(rows.map(function(row){
        return {freq:row.freq,amp:row.amp,trace:target.trace.name,type:"peak",label:"P"+row.rank};
      }));
      setSelectedMkrIdx(next.length-1);
      return next;
    });
  },[setMarkers,setSelectedMkrIdx,setSelectedRefLineId]);

  var stats=useMemo(function(){
    var st={};allTr.forEach(function(tr){
      var d=getVisibleTraceData(tr,zoom);
      if(!d.length)return;
      var pk=d.reduce(function(a,b){return a.amp>b.amp?a:b;});
      var mn=d.reduce(function(a,b){return a.amp<b.amp?a:b;});
      st[tr.name]={pk:pk,mn:mn,n:d.length,delta:pk.amp-mn.amp};
    });return st;
  },[allTr,zoom]);

  /* ── Chart interactions ── */
  var markerActions=useMarkerActions({allTr:allTr,paneTraces:cTr,activeTraceName:activePaneModel?activePaneModel.paneActiveTraceName:null,vis:vis,markerTrace:markerTrace,zoom:zoom,markers:markers,nextPeakExclusion:nextPeakExclusion,setMarkers:setMarkers,selectedMkrIdx:selectedMkrIdx,addMarker:markerCtl.addMarker,searchDirection:searchDirection});
  var resolveMarkerTarget=markerActions.resolveMarkerTarget;
  var peakSrch=markerActions.peakSrch;
  var nxtPeak=markerActions.nxtPeak;
  var minSrch=markerActions.minSrch;
  var nxtMin=markerActions.nxtMin;
  var stripIP3Markers=ip3Ctl.stripIP3Markers;
  var ip3Flow=useIP3Workflow({allTr:allTr,zoom:zoom,nextPeakExclusion:nextPeakExclusion,setMarkers:setMarkers,stripIP3Markers:stripIP3Markers});

  function getChartYValueFromEvent(ev){
    if(!ev)return null;
    if(isFinite(ev.clientY))return getChartYValueFromClientY(ev.clientY);
    var dom=chartDomainRef.current;
    if(!dom||!isFinite(dom.min)||!isFinite(dom.max))return null;
    var rect=chartRef.current?chartRef.current.getBoundingClientRect():null;
    var plotTop=CHART_MARGIN_TOP,plotBottom=CHART_MARGIN_BOTTOM;
    var plotH=rect?Math.max(1,rect.height-plotTop-plotBottom):0;
    if(!(plotH>0))return null;
    var localY=null;
    if(ev.activeCoordinate&&isFinite(ev.activeCoordinate.y)){
      localY=Math.max(0,Math.min(plotH,ev.activeCoordinate.y));
    } else if(isFinite(ev.chartY)){
      localY=Math.max(0,Math.min(plotH,ev.chartY-plotTop));
    }
    if(!isFinite(localY))return null;
    var frac=1-(localY/plotH);
    return dom.min+frac*(dom.max-dom.min);
  }
  function getChartYValueFromClientY(clientY){
    var dom=chartDomainRef.current;
    if(!dom||!isFinite(dom.min)||!isFinite(dom.max)||!isFinite(clientY))return null;
    var rect=chartRef.current?chartRef.current.getBoundingClientRect():null;
    if(!rect)return null;
    var plotH=Math.max(1,rect.height-CHART_MARGIN_TOP-CHART_MARGIN_BOTTOM);
    if(!(plotH>0))return null;
    var localY=clientY-rect.top-CHART_MARGIN_TOP;
    if(localY<0)localY=0;
    if(localY>plotH)localY=plotH;
    var frac=1-(localY/plotH);
    return dom.min+frac*(dom.max-dom.min);
  }
  function getChartFreqFromClientX(clientX){
    if(!isFinite(clientX)||!chartRef.current)return null;
    var rect=chartRef.current.getBoundingClientRect();
    var plotW=rect.width-CHART_PLOT_LEFT-CHART_MARGIN_RIGHT;
    if(!isFinite(plotW)||plotW<=20)return null;
    var x=clientX-rect.left-CHART_PLOT_LEFT;
    if(x<0)x=0;
    if(x>plotW)x=plotW;
    var domHz=getXDomainHz();
    if(!domHz||!isFinite(domHz.left)||!isFinite(domHz.right)||domHz.right<=domHz.left)return null;
    return domHz.left + (x/plotW)*(domHz.right-domHz.left);
  }
  function getEventFreq(ev){
    if(ev&&ev.activePayload&&ev.activePayload[0]&&ev.activePayload[0].payload&&isFinite(ev.activePayload[0].payload.freq))return ev.activePayload[0].payload.freq;
    if(ev&&isFinite(ev.activeLabel))return ev.activeLabel*fDiv;
    if(ev&&isFinite(ev.clientX)){
      var clientFreq=getChartFreqFromClientX(ev.clientX);
      if(isFinite(clientFreq))return clientFreq;
    }
    if(ev&&isFinite(ev.chartX)&&chartRef.current){
      var rect=chartRef.current.getBoundingClientRect();
      var plotW=rect.width-CHART_PLOT_LEFT-CHART_MARGIN_RIGHT;
      if(isFinite(plotW)&&plotW>20){
        var x=ev.chartX-CHART_PLOT_LEFT;
        if(x<0)x=0;
        if(x>plotW)x=plotW;
        var domHz=getXDomainHz();
        if(domHz&&isFinite(domHz.left)&&isFinite(domHz.right)&&domHz.right>domHz.left){
          return domHz.left + (x/plotW)*(domHz.right-domHz.left);
        }
      }
    }
    return null;
  }
  function updateRefLinePosition(target,type,nextValue){
    var targetId=(target&&typeof target==="object")?target.id:target;
    var targetGroupId=(target&&typeof target==="object"&&target.groupId)?target.groupId:null;
    if(targetId==null&&!targetGroupId)return false;
    if(typeof nextValue!=="number"||!Number.isFinite(nextValue))return false;
    setRefLines(function(prev){
      var sourceLine=targetGroupId?null:((prev||[]).find(function(line){return line&&line.id===targetId;})||null);
      var resolvedGroupId=targetGroupId||(sourceLine&&sourceLine.groupId?sourceLine.groupId:null);
      return prev.map(function(line){
        if(!line)return line;
        if(resolvedGroupId){
          if(line.groupId!==resolvedGroupId)return line;
        } else if(line.id!==targetId){
          return line;
        }
        if(type==="v"){
          return Object.assign({},line,{value:nextValue,label:fmtF(nextValue,true)});
        }
        return Object.assign({},line,{value:nextValue,label:nextValue.toFixed(2)+" dBm"});
      });
    });
    return true;
  }
  function updateSelectedMarkerPosition(mk){
    if(selectedMkrIdx===null||selectedMkrIdx===undefined||!markers[selectedMkrIdx]||!mk)return false;
    setMarkers(function(prev){
      if(selectedMkrIdx===null||selectedMkrIdx===undefined||!prev[selectedMkrIdx])return prev;
      var next=prev.slice();
      var current=next[selectedMkrIdx]||{};
      next[selectedMkrIdx]=Object.assign({},current,mk,current.label?{label:current.label}:{});
      if(next[selectedMkrIdx].type!=="delta")delete next[selectedMkrIdx].refIdx;
      return next;
    });
    return true;
  }
  function placeMarkerFromEvent(ev,forceAdd){
    if(suppressClickRef.current){suppressClickRef.current=false;return;}
    if(getMouseBtn(ev)!==0)return;
    if(!ev)return;
      var action=interactionCtl.action;
        if(action==="place-hline"){
          var yVal=getChartYValueFromEvent(ev);
          if(isFinite(yVal)){
            setSelectedMkrIdx(null);
            refCtl.addHLine(yVal,yU,getTargetLinePaneIds(),activePaneId);
          }
          return;
        }
      if(selectedRefLineId!==null&&selectedRefLineId!==undefined&&!newMarkerArmed&&action!=="place-vline")return;
    var eventFreq=getEventFreq(ev);
    if(!isFinite(eventFreq))return;
    var pt=(ev&&ev.activePayload&&ev.activePayload[0]&&ev.activePayload[0].payload)?ev.activePayload[0].payload:{freq:eventFreq};
      if(action==="place-vline"){
        setSelectedMkrIdx(null);
        refCtl.addVLine(eventFreq,getTargetLinePaneIds(),activePaneId);
        return;
      }
    var hit=resolveMarkerTarget(pt,getChartYValueFromEvent(ev));
    if(!hit)return;
    var bt=hit.trace,ba=hit.amp;
    var isDelta=action==="place-delta-marker";
    var mk={freq:eventFreq,amp:ba,trace:bt,type:isDelta?"delta":"normal"};
    if(isDelta&&markers.length>0) mk.refIdx=dRef??0;
    var addFresh=!!newMarkerArmed||!!forceAdd||!!(ev&&((ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey)||(ev.nativeEvent&&(ev.nativeEvent.ctrlKey||ev.nativeEvent.metaKey||ev.nativeEvent.shiftKey||ev.nativeEvent.altKey))));
    if(!addFresh&&selectedMkrIdx!==null&&selectedMkrIdx!==undefined&&markers[selectedMkrIdx]){
      updateSelectedMarkerPosition(mk);
    } else {
      markerCtl.addMarker(mk,true);
    }
    if(newMarkerArmed)setNewMarkerArmed(false);
    if(selectedRefLineId!==null&&selectedRefLineId!==undefined)setSelectedRefLineId(null);
  }
  var chartClick=function(ev){ placeMarkerFromEvent(ev,false); };
    var chartMMWithDrag=function(ev){
      chartMM(ev);
      if(dragRefLineRef.current){
        var dragLine=dragRefLineRef.current;
        didDragRefLineRef.current=true;
        if(dragLine.type==="v"){
          var refFreq=getEventFreq(ev);
          if(isFinite(refFreq))updateRefLinePosition(dragLine,"v",refFreq);
      } else if(dragLine.type==="h"){
        var yVal=getChartYValueFromEvent(ev);
        if(isFinite(yVal))updateRefLinePosition(dragLine,"h",yVal);
      }
      return;
    }
    if(!dragSelectedMarkerRef.current||!ev)return;
    if(refMode||newMarkerArmed)return;
    if(selectedMkrIdx===null||selectedMkrIdx===undefined||!markers[selectedMkrIdx])return;
    var markerFreq=getEventFreq(ev);
    if(!isFinite(markerFreq))return;
    var pt=(ev&&ev.activePayload&&ev.activePayload[0]&&ev.activePayload[0].payload)?ev.activePayload[0].payload:{freq:markerFreq};
    var hit=resolveMarkerTarget(pt,getChartYValueFromEvent(ev));
    if(!hit)return;
    var current=markers[selectedMkrIdx];
    var mk={freq:markerFreq,amp:hit.amp,trace:hit.trace,type:current&&current.type==="delta"?"delta":"normal"};
    if(mk.type==="delta"&&current&&current.refIdx!==undefined&&current.refIdx!==null)mk.refIdx=current.refIdx;
    updateSelectedMarkerPosition(mk);
    };
      var handleChartMouseDownCapture=function(ev){
        onChartContainerMouseDownCapture(ev);
        didDragRefLineRef.current=false;
        if(ev&&ev.button===0&&!refMode&&!newMarkerArmed&&selectedRefLineId!==null&&selectedRefLineId!==undefined){
          var selectedLine=refLines.find(function(line){return line&&line.id===selectedRefLineId;})||null;
          if(selectedLine){
            dragRefLineRef.current={id:selectedLine.id,type:selectedLine.type,groupId:selectedLine.groupId||null};
          }
        }
        dragSelectedMarkerRef.current=!!(ev&&ev.button===0&&!dragRefLineRef.current&&!refMode&&!newMarkerArmed&&selectedMkrIdx!==null&&selectedMkrIdx!==undefined&&markers[selectedMkrIdx]);
      };
    var handleChartMouseUpCapture=function(ev){
      if(didDragRefLineRef.current)suppressClickRef.current=true;
      didDragRefLineRef.current=false;
      dragSelectedMarkerRef.current=false;
      dragRefLineRef.current=null;
      onChartContainerMouseUpCapture(ev);
  };
    useEffect(function(){
      var onWindowMouseMove=function(ev){
        var dragLine=dragRefLineRef.current;
        if(!dragLine)return;
        didDragRefLineRef.current=true;
        if(dragLine.type==="v"){
          var refFreq=getChartFreqFromClientX(ev&&ev.clientX);
          if(isFinite(refFreq))updateRefLinePosition(dragLine,"v",refFreq);
          return;
        }
        if(dragLine.type==="h"){
          var yVal=getChartYValueFromClientY(ev&&ev.clientY);
          if(isFinite(yVal))updateRefLinePosition(dragLine,"h",yVal);
        }
      };
      var clearDrag=function(){
        didDragRefLineRef.current=false;
        dragSelectedMarkerRef.current=false;
        dragRefLineRef.current=null;
      };
    window.addEventListener("mousemove",onWindowMouseMove);
    window.addEventListener("mouseup",clearDrag);
    return function(){
      window.removeEventListener("mousemove",onWindowMouseMove);
      window.removeEventListener("mouseup",clearDrag);
    };
  },[getXDomainHz]);


  var mKeys=["Type","Mode","Date","Center Freq","Span","Start","Stop","Ref Level","Rf Att","RBW","VBW","SWT","Preamplifier","Detector","Trace Mode","Sweep Count"];
  var hasData=files.length>0;
  var yU=activePaneModel&&activePaneModel.axisInfo?activePaneModel.axisInfo.yUnit:"dBm";
  var rightPanelSections=useMemo(function(){
    var order=[];
    if(showImportExportPanel)order.push("import-export");
    rightPanelOrder.forEach(function(id){
      if(id==="analysis"&&analysisPanelVisible&&order.indexOf(id)===-1)order.push(id);
      if(id==="data"&&showDT&&hasData&&order.indexOf(id)===-1)order.push(id);
    });
    return order;
  },[showImportExportPanel,rightPanelOrder,analysisPanelVisible,showDT,hasData]);

  function removeNoiseResult(id){
    setNoiseResults(function(lst){return lst.filter(function(x){return x.id!==id;});});
  }

  function removeIP3Result(id){
    setIP3Results(function(lst){return lst.filter(function(x){return x.id!==id;});});
  }

  function saveCurrentIP3(){
    var srcName=(ip3Pts.f1&&ip3Pts.f1.trace)||(ip3Pts.f2&&ip3Pts.f2.trace)||(ip3Pts.im3l&&ip3Pts.im3l.trace)||(ip3Pts.im3u&&ip3Pts.im3u.trace)||null;
    var srcTrace=srcName?getTraceByName(srcName):null;
    saveIP3({
      traceLabel:srcTrace?getTraceLabel(srcTrace):(srcName||null),
      sourceTraceId:srcTrace?getTraceId(srcTrace):null,
      sourceTraceName:srcTrace?srcTrace.name:srcName,
      roles:buildIP3RoleRefs(ip3Pts,getTraceByName)
    });
  }

  function setShowDTFromTopBar(next){
    if(typeof next==="function"){
      setShowDT(function(prev){
        var resolved=next(prev);
        if(!prev&&resolved)promoteRightPanelSection("data");
        return resolved;
      });
      return;
    }
    if(next)promoteRightPanelSection("data");
    setShowDT(next);
  }

  function toggleImportExportPanel(){
    setShowImportExportPanel(function(prev){return !prev;});
  }

  var topBarProps={files:files,removeFile:removeFile,hasData:hasData,C:C,showSidebar:showSidebar,setShowSidebar:setShowSidebar,showMarkerTools:showMarkerTools,setShowMarkerTools:setShowMarkerTools,showPaneTools:showPaneTools,setShowPaneTools:setShowPaneTools,showSearchTools:showSearchTools,setShowSearchTools:setShowSearchTools,showLineTools:showLineTools,setShowLineTools:setShowLineTools,showViewTools:showViewTools,setShowViewTools:setShowViewTools,showDots:showDots,setShowDots:setShowDots,showDT:showDT,setShowDT:setShowDTFromTopBar,analysisButtons:analysisButtons,clearAllFiles:clearAllFiles,showImportExportPanel:showImportExportPanel,toggleImportExportPanel:toggleImportExportPanel};
  var sidebarProps={C:C,files:files,mKeys:mKeys,stats:stats,allTr:allTr,panes:panes,markers:markers,refLines:refLines,activePaneId:activePaneId,selectedTraceName:selectedTraceName,dragTraceName:dragTraceName,tracePaneMap:tracePaneMap,vis:vis,setVis:setVis,paneMode:paneMode,getTracePaneId:function(traceName){return getTracePaneId(tracePaneMap,traceName);},getTraceByName:getTraceByName,selectTrace:selectTrace,onTraceDragStart:onTraceDragStart,onTraceDragEnd:onTraceDragEnd,removeTrace:removeTrace,showMarkers:showMarkers,setShowMarkers:setShowMarkers,showMeta:showMeta,setShowMeta:setShowMeta,showTouchstoneControls:showTouchstoneControls,setShowTouchstoneControls:setShowTouchstoneControls,fitPane:fitPane,fitAllPanes:fitAllPanes,resetYZ:resetYZ,clearPane:clearPane,yU:yU,mcMap:mcMap,traceColorMap:traceColorMap,setMarkers:setMarkers,zoom:zoom,selectedMkrIdx:selectedMkrIdx,setSelectedMkrIdx:setSelectedMkrIdx,selectedRefLineId:selectedRefLineId,setSelectedRefLineId:setSelectedRefLineId,setRefLines:setRefLines,setActivePaneId:setActivePaneId,clearMarkers:clearMarkers,rmMkr:rmMkr,removeFile:removeFile,touchstoneStateByFileId:touchstoneStateByFileId,onTouchstoneSetActiveFamily:onTouchstoneSetActiveFamily,onTouchstoneSetFamilyView:onTouchstoneSetFamilyView,onTouchstoneSetExpanded:onTouchstoneSetExpanded,onTouchstoneToggleCell:onTouchstoneToggleCell,onTouchstoneApplyPreset:onTouchstoneApplyPreset,onTouchstoneClearFileViews:onTouchstoneClearFileViews};
  var toolbarProps={C:C,allTr:allTr,vis:vis,zoom:zoom,yZoom:yZoom,cData:cData,fUnit:fUnit,yU:yU,showMarkerTools:showMarkerTools,showPaneTools:showPaneTools,showSearchTools:showSearchTools,showLineTools:showLineTools,showViewTools:showViewTools,mkrMode:mkrMode,refMode:refMode,setNewMarkerArmed:setNewMarkerArmed,newMarkerArmed:newMarkerArmed,setMkrMode:setMkrMode,setRefMode:setRefMode,markers:markers,dRef:dRef,setDRef:setDRef,selectedMkrIdx:selectedMkrIdx,setSelectedMkrIdx:setSelectedMkrIdx,selectedRefLineId:selectedRefLineId,setSelectedRefLineId:setSelectedRefLineId,panes:panes,activePaneId:activePaneId,setActivePaneId:setActivePaneId,setPaneMode:setPaneMode,fitAllPanes:fitAllPanes,hasData:hasData,peakSrch:peakSrch,nxtPeak:nxtPeak,minSrch:minSrch,nxtMin:nxtMin,searchDirection:searchDirection,setSearchDirection:setSearchDirection,lockLinesAcrossPanes:lockLinesAcrossPanes,setLockLinesAcrossPanes:setLockLinesAcrossPanes,zoomAll:zoomAll,setZoomAll:setZoomAll,resetYZ:resetYZ,setZoom:setZoom,interactionCtl:interactionCtl,selectedMarker:selectedMarker,refLines:refLines};
  var chartWorkspaceProps={allTr:allTr,paneModels:paneModels,panes:panes,activePaneId:activePaneId,setActivePaneId:setActivePaneId,vis:vis,traceColorMap:traceColorMap,showDots:showDots,markers:markers,selectedMkrIdx:selectedMkrIdx,setSelectedMkrIdx:setSelectedMkrIdx,refLines:refLines,selectedRefLineId:selectedRefLineId,setSelectedRefLineId:setSelectedRefLineId,dragRefLineRef:dragRefLineRef,dragTraceName:dragTraceName,chartDomainRef:chartDomainRef,chartRef:chartRef,chartExportRef:chartExportRef,chartClick:chartClick,chartMMWithDrag:chartMMWithDrag,chartML:chartML,mDown:mDown,mUp:mUp,handleChartMouseDownCapture:handleChartMouseDownCapture,handleChartMouseUpCapture:handleChartMouseUpCapture,hoverData:hoverData,hoverX:hoverX,selA:selA,selB:selB,getXDomainHz:getXDomainHz,mcMap:mcMap,C:C,selectedTraceName:selectedTraceName,moveSelectedTraceToPane:moveSelectedTraceToPane,fitPane:fitPane,clearPane:clearPane,resetYZ:resetYZ,getTraceByName:getTraceByName,getTracePaneId:function(traceName){return getTracePaneId(tracePaneMap,traceName);},tracePaneMap:tracePaneMap,onPaneDrop:onPaneDrop,isDrag:isDrag,setIsDrag:setIsDrag,loadFiles:loadFiles,fileInputRef:fRef};
  var analysisStackProps={visible:analysisPanelVisible,showTraceOps:showTraceOps,showAnalysisPanel:showAnalysisPanel,showNoise:showNoise,showIP3:showIP3,visibleAnalysisIds:visibleAnalysisIds,normalizedAnalysisOpenState:normalizedAnalysisOpenState,traceOpsProps:{C:C,openOps:traceOpsOpenSections,setOpenOps:setTraceOpsOpenSections,traceOptions:traceOptions,offsetSource:offsetSource,setOffsetSource:setOffsetSource,offsetValue:offsetValue,setOffsetValue:setOffsetValue,createOffsetDerivedTrace:createOffsetDerivedTrace,scaleSource:scaleSource,setScaleSource:setScaleSource,scaleValue:scaleValue,setScaleValue:setScaleValue,createScaledDerivedTrace:createScaledDerivedTrace,smoothSource:smoothSource,setSmoothSource:setSmoothSource,smoothMethod:smoothMethod,setSmoothMethod:setSmoothMethod,smoothWindow:smoothWindow,setSmoothWindow:setSmoothWindow,smoothPolyOrder:smoothPolyOrder,setSmoothPolyOrder:setSmoothPolyOrder,createSmoothedDerivedTrace:createSmoothedDerivedTrace,subtractA:subtractA,setSubtractA:setSubtractA,subtractB:subtractB,setSubtractB:setSubtractB,traceMathOperation:traceMathOperation,setTraceMathOperation:setTraceMathOperation,subtractInterpolation:subtractInterpolation,setSubtractInterpolation:setSubtractInterpolation,createTraceMathDerivedTrace:createTraceMathDerivedTrace,traceMathUnitWarning:traceMathUnitWarning,traceOpsError:traceOpsError},analysisMenuProps:{C:C,hasTraceOps:showTraceOps,registry:analysisRegistry,toggleAnalysisOpen:toggleAnalysisOpen},noiseCardProps:{C:C,allTr:allTr,noiseSource:noiseSource,setNoiseSource:setNoiseSource,noiseFilter:noiseFilter,setNoiseFilter:setNoiseFilter,npsdStats:npsdStats,addSavedNoise:addSavedNoise,noiseResults:noiseResults,removeNoise:removeNoiseResult},ip3CardProps:{C:C,ip3Ctl:ip3Ctl,ip3Pts:ip3Pts,ip3Res:ip3Res,yU:yU,ip3Gain:ip3Gain,setIP3Gain:setIP3Gain,saveIP3:saveCurrentIP3,ip3Results:ip3Results,removeIP3:removeIP3Result,setMarkers:setMarkers,selectedMarker:selectedMarker,selectedIndex:selectedMkrIdx,assignSelectedRole:assignSelectedRole,clearSelectedRole:clearSelectedRole,autoPickIP3:autoPickIP3},peakSpurProps:{C:C,target:analysisTarget,peakTableLimit:peakTableLimit,setPeakTableLimit:setPeakTableLimit,peakTableMinSpacing:peakTableMinSpacing,setPeakTableMinSpacing:setPeakTableMinSpacing,peakTableMinAmp:peakTableMinAmp,setPeakTableMinAmp:setPeakTableMinAmp,addPeakMarker:addPeakTableMarker,addAllPeakMarkers:addAllPeakTableMarkers},markerDeltaProps:{C:C,target:analysisTarget,markers:markers},rangeStatsProps:{C:C,target:analysisTarget},bandwidthProps:{C:C,target:analysisTarget,selectedMarker:selectedMarker,bandwidthDrop:bandwidthDrop,setBandwidthDrop:setBandwidthDrop},thresholdProps:{C:C,target:analysisTarget,selectedHLine:selectedHLine,thresholdManual:thresholdManual,setThresholdManual:setThresholdManual},rippleProps:{C:C,target:analysisTarget},obwProps:{C:C,target:analysisTarget,obwPercent:obwPercent,setObwPercent:setObwPercent},channelPowerProps:{C:C,target:analysisTarget},touchstoneStabilityProps:{C:C,target:analysisTarget,onGenerateTrace:onGenerateTouchstoneTrace}};
  var importExportPanelProps={visible:showImportExportPanel,C:C,hasData:hasData,files:files,allTr:allTr,panes:panes,activePaneId:activePaneId,fRef:fRef,iRef:iRef,openWorkspace:openWorkspace,exportWorkspace:exportWorkspace,exportTraceData:exportTraceData,exportChartPng:exportChartPng,exportChartSvg:exportChartSvg,clearAllFiles:clearAllFiles};
  var dataTableProps={visible:showDT,hasData:hasData,C:C,allTr:allTr,dtTrace:dtTrace,setDtTrace:setDtTrace,zoom:zoom,yU:yU};
  var footerProps={hasData:hasData};

  return {state:{isDrag:isDrag,setIsDrag:setIsDrag,showSidebar:showSidebar,showImportExportPanel:showImportExportPanel,error:error},derived:{hasData:hasData,rightPanelSections:rightPanelSections},refs:{fRef:fRef,iRef:iRef,wRef:wRef},actions:{importWorkspaceFile:importWorkspaceFile},chartHandlers:{onDrop:onDrop,loadFiles:loadFiles},view:{topBarProps:topBarProps,sidebarProps:sidebarProps,toolbarProps:toolbarProps,chartWorkspaceProps:chartWorkspaceProps,analysisStackProps:analysisStackProps,importExportPanelProps:importExportPanelProps,dataTableProps:dataTableProps,footerProps:footerProps,rightPanelSections:rightPanelSections}};
}

function renderOverlay(onDrop){
  return h("div",{onDragOver:function(ev){ev.preventDefault();},onDrop:onDrop,style:{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}},
    h("div",{style:{padding:"40px 60px",border:"2px dashed var(--accent)",borderRadius:16,background:"var(--card)",textAlign:"center"}},
      h("div",{style:{fontSize:18,fontWeight:700,marginBottom:6}},"Drop to add traces"),
      h("div",{style:{fontSize:13,color:"var(--muted)"}},"Files will be merged")));
}

function AppRoot(){
  var app=useAppController();
  var state=app.state;
  var derived=app.derived;
  var refs=app.refs;
  var actions=app.actions;
  var chartHandlers=app.chartHandlers;
  var view=app.view;
  return h("div",{style:{background:"var(--bg)",color:"var(--text)",height:"100vh",display:"flex",flexDirection:"column"},onDragOver:function(ev){ev.preventDefault();if(isFileDragEvent(ev))state.setIsDrag(true);},onDragLeave:function(ev){if(!ev.currentTarget.contains(ev.relatedTarget))state.setIsDrag(false);},onDrop:chartHandlers.onDrop},
    h("input",{ref:refs.fRef,type:"file",accept:".dat,.csv,.txt,.s1p,.s2p,.s3p,.s4p,.s5p,.s6p,.s7p,.s8p,.s9p",multiple:true,style:{display:"none"},onChange:function(ev){if(ev.target.files.length)chartHandlers.loadFiles(ev.target.files,false);ev.target.value="";}}),
    h("input",{ref:refs.iRef,type:"file",accept:".dat,.csv,.txt,.s1p,.s2p,.s3p,.s4p,.s5p,.s6p,.s7p,.s8p,.s9p",multiple:true,style:{display:"none"},onChange:function(ev){if(ev.target.files.length)chartHandlers.loadFiles(ev.target.files,true);ev.target.value="";}}),
    h("input",{ref:refs.wRef,type:"file",accept:".json,application/json",style:{display:"none"},onChange:function(ev){if(ev.target.files.length)actions.importWorkspaceFile(ev.target.files[0]);ev.target.value="";}}),
    derived.hasData&&state.isDrag?renderOverlay(chartHandlers.onDrop):null,
    h(TopBar,view.topBarProps),
    h("div",{style:{flex:1,display:"flex",overflow:"hidden"}},
      state.showSidebar?h(SidebarPane,{render:function(){return h(SidebarPanel,view.sidebarProps);}}):null,
      h("div",{style:{flex:1,display:"flex",flexDirection:"column",minWidth:0}},
        state.error?h("div",{style:{background:"var(--err-bg)",border:"1px solid var(--err-bd)",borderRadius:6,padding:"6px 12px",margin:"8px 12px 0",fontSize:13,color:"var(--err-tx)",flexShrink:0}},state.error):null,
        h(ChartPane,null,h(ToolbarStrip,view.toolbarProps),h(ChartWorkspace,view.chartWorkspaceProps),h(FooterBar,view.footerProps))
      ),
      view.rightPanelSections.length?h(RightPanelStack,null,view.rightPanelSections.map(function(id){
        if(id==="import-export")return h(ImportExportPanel,Object.assign({key:id},view.importExportPanelProps));
        if(id==="analysis")return h(AnalysisPanelStack,Object.assign({key:id},view.analysisStackProps));
        if(id==="data")return h(DataTablePanel,Object.assign({key:id},view.dataTableProps));
        return null;
      }).filter(Boolean)):null
    ));
}

function AppBoundary(props){
  ReactComponent.call(this,props);
  this.state={error:null,componentStack:""};
}
AppBoundary.prototype=Object.create(ReactComponent.prototype);
AppBoundary.prototype.constructor=AppBoundary;
AppBoundary.getDerivedStateFromError=function(error){
  return {error:error||new Error("Unknown app error")};
};
AppBoundary.prototype.componentDidCatch=function(error,info){
  var stack=info&&info.componentStack?info.componentStack:"";
  this.setState({componentStack:stack});
  if(global.console&&typeof global.console.error==="function"){
    global.console.error("App render failed",error,info);
  }
};
AppBoundary.prototype.render=function(){
  if(this.state&&this.state.error){
    return h("div",{style:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",padding:24,fontFamily:"monospace"}},
      h("div",{style:{maxWidth:960,margin:"0 auto",border:"1px solid var(--err-bd)",background:"var(--err-bg)",color:"var(--err-tx)",borderRadius:12,padding:20,whiteSpace:"pre-wrap",lineHeight:1.5}},
        "Mergen Scope failed to render.\n\n"+
        (this.state.error&&this.state.error.stack?this.state.error.stack:String(this.state.error))+
        (this.state.componentStack?("\n\nComponent stack:\n"+this.state.componentStack):"")
      )
    );
  }
  return this.props.children||null;
};

global.AppController={useAppController:useAppController,AppRoot:AppRoot,AppBoundary:AppBoundary};
})(window);
