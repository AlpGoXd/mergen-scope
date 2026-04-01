(function(global){
  var React=global.React;
  var AH=global.AnalysisHelpers||{};
  var UH=global.UIHelpers||{};
  var ATH=global.AnalysisTargetHelpers||{};
  var RAH=global.RangeAnalysisHelpers||{};
  var TM=global.TraceModel||{};
  var MH=global.MarkerHelpers||{};
  var h=React.createElement;
  var ENBW=AH.ENBW;
  var getAnalysisColor=ATH.getAnalysisColor;
  var buildPeakSpurTable=RAH.buildPeakSpurTable;
  var buildMarkerDeltaTable=RAH.buildMarkerDeltaTable;
  var computeRangeStats=RAH.computeRangeStats;
  var computeBandwidthAtDrop=RAH.computeBandwidthAtDrop;
  var findThresholdCrossingsForLevel=RAH.findThresholdCrossingsForLevel;
  var computeRippleFlatness=RAH.computeRippleFlatness;
  var computeOccupiedBandwidth=RAH.computeOccupiedBandwidth;
  var computeChannelPower=RAH.computeChannelPower;
  var getTraceLabel=TM.getTraceLabel;
  var fmtF=UH.fmtF;
  var MR=UH.MR;
  var Sec=UH.Sec;
  var SavedNoiseResultItem=UH.SavedNoiseResultItem;
  var SavedIP3ResultItem=UH.SavedIP3ResultItem;
  var IP3_ROLE_KEYS=MH.IP3_ROLE_KEYS||[];
  var IP3_ROLE_LABELS=MH.IP3_ROLE_LABELS||{};
  var isIP3Label=MH.isIP3Label||function(){return false;};

function AnalysisFeatureCard(props){
  var tint=props.color||null;
  var kids=[];
  kids.push(h(Sec,{key:"t",first:!!props.first},props.title));
  if(props.description)kids.push(h("div",{key:"d",style:{fontSize:11,color:"var(--muted)",marginBottom:8,lineHeight:1.5}},props.description));
  if(props.children)kids=kids.concat(Array.isArray(props.children)?props.children:[props.children]);
  return h("div",{style:{marginBottom:10,padding:"8px 10px",border:"1px solid "+(tint?(tint+"44"):"var(--border)"),borderRadius:8,background:tint?(tint+"0f"):"var(--card)"}},kids);
}
/* Saved result item components moved to UIHelpers */
function NoisePSDCard(props){
  var C=props.C,allTr=props.allTr;
  var items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",first:true,color:C.noiseTr,title:"Noise PSD (saved numbers)",description:"N = P - 10*log10(ENBW). Calculated result is saved as numbers, not plotted as a trace."}));
  items.push(h("div",{key:"src",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
    h("span",{style:{fontSize:11,color:"var(--muted)"}},"Src:"),
    h("select",{value:props.noiseSource||"",onChange:function(ev){props.setNoiseSource(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
      allTr.map(function(t){return h("option",{key:t.name,value:t.name},t.dn||t.name);}))
  ));
  items.push(h("div",{key:"flt",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
    h("span",{style:{fontSize:11,color:"var(--muted)"}},"Filter:"),
    h("select",{value:props.noiseFilter,onChange:function(ev){props.setNoiseFilter(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
      Object.entries(ENBW).map(function(e){return h("option",{key:e[0],value:e[0]},e[1].label+" (k="+e[1].k+")");}))
  ));
  if(props.npsdStats){
    items.push(h(MR,{key:"n-src",label:"Trace",value:props.npsdStats.src.dn||props.npsdStats.src.name,vc:C.noiseTr}));
    items.push(h(MR,{key:"n-rbw",label:"RBW",value:props.npsdStats.rbw.toFixed(1)+" Hz"}));
    items.push(h(MR,{key:"n-peak",label:"Peak",value:props.npsdStats.peak.amp.toFixed(2)+" dBm/Hz",vc:C.noiseTr}));
    items.push(h(MR,{key:"n-pf",label:"Peak Freq",value:fmtF(props.npsdStats.peak.freq,true)}));
    items.push(h(MR,{key:"n-min",label:"Min",value:props.npsdStats.min.amp.toFixed(2)+" dBm/Hz",vc:C.noiseTr}));
    items.push(h(MR,{key:"n-avg",label:"Avg",value:props.npsdStats.avg.toFixed(2)+" dBm/Hz",vc:C.noiseTr}));
    items.push(h("button",{key:"save",title:"Save the current Noise PSD result into the analysis results list.",onClick:function(){props.addSavedNoise(props.npsdStats);},style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.noiseTr,borderRadius:4,cursor:"pointer",fontSize:11,marginTop:6}},"Save Noise Result"));
  } else {
    items.push(h("div",{key:"none",style:{fontSize:11,color:"var(--muted)"}},"Select a valid source trace with numeric RBW metadata."));
  }
  if(props.noiseResults.length){
    items.push(h(Sec,{key:"saved"},"Saved Noise Results ("+props.noiseResults.length+")"));
    props.noiseResults.forEach(function(r){ items.push(h(SavedNoiseResultItem,{key:r.id,r:r,C:C,onRemove:props.removeNoise})); });
  }
  return items;
}

function TraceOpsCard(props){
  var C=props.C, items=[];
function opBtn(key,label,color,tip){
  var active=!!props.openOps[key];
  return h("button",{key:key,title:tip||null,onClick:function(){props.setOpenOps(function(prev){var next=Object.assign({},prev);next[key]=!next[key];return next;});},style:{padding:"5px 8px",background:active?(color+"22"):"transparent",border:"1px solid "+(active?color:"var(--border)"),color:active?color:"var(--muted)",borderRadius:4,cursor:"pointer",fontSize:11}},label);
}
  items.push(h(AnalysisFeatureCard,{key:"head",first:true,color:C.tr[4],title:"Trace Operations",description:"Create derived traces without changing the imported raw source. This is the Phase 2 home for offset, smoothing, subtraction, and future trace math."}));
  if(!props.traceOptions.length){
    items.push(h("div",{key:"none",style:{fontSize:11,color:"var(--muted)"}},"Import at least one raw trace to enable derived operations."));
    return items;
  }
  items.push(h("div",{key:"op-tabs",style:{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}},
    opBtn("offset","Offset",C.tr[4],"Open additive offset controls for a copied trace."),
    opBtn("scale","Scale",C.tr[3]||C.accent,"Open multiplicative scaling controls for a copied trace."),
    opBtn("smoothing","Smoothing",C.tr[5]||C.accent,"Open smoothing controls to create filtered derived traces."),
    opBtn("subtract","Trace Math",C.tr[1],"Open A+B, A-B, A*B, and A/B trace math controls.")
  ));
  if(props.openOps.offset){
    items.push(h(Sec,{key:"offset-sec"},"Offset"));
    items.push(h("div",{key:"src",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Source"),
      h("select",{value:props.offsetSource,onChange:function(ev){props.setOffsetSource(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        props.traceOptions.map(function(tr){return h("option",{key:tr.name,value:tr.name},getTraceLabel(tr));}))
    ));
    items.push(h("div",{key:"offset",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Offset"),
      h("input",{type:"number",value:props.offsetValue,onChange:function(ev){props.setOffsetValue(ev.target.value);},step:"0.1",style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}),
      h("span",{style:{fontSize:11,color:"var(--muted)"}},"dB")
    ));
    items.push(h("button",{key:"create",title:"Create a new derived trace by adding a constant offset to the source trace.",onClick:props.createOffsetDerivedTrace,disabled:!props.offsetSource||!isFinite(parseFloat(props.offsetValue)),style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.tr[4],borderRadius:4,cursor:!props.offsetSource||!isFinite(parseFloat(props.offsetValue))?"not-allowed":"pointer",fontSize:11,opacity:!props.offsetSource||!isFinite(parseFloat(props.offsetValue))?0.55:1,marginBottom:8}},"Create Offset Trace"));
    items.push(h("div",{key:"note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Flat amplitude correction on a copied trace. The source trace stays unchanged."));
  }
  if(props.openOps.scale){
    items.push(h(Sec,{key:"scale-sec"},"Scale"));
    items.push(h("div",{key:"scale-src",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Source"),
      h("select",{value:props.scaleSource,onChange:function(ev){props.setScaleSource(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        props.traceOptions.map(function(tr){return h("option",{key:"sc-"+tr.name,value:tr.name},getTraceLabel(tr));}))
    ));
    items.push(h("div",{key:"scale-val",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Factor"),
      h("input",{type:"number",value:props.scaleValue,onChange:function(ev){props.setScaleValue(ev.target.value);},step:"0.1",style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}),
      h("span",{style:{fontSize:11,color:"var(--muted)"}},"x")
    ));
    items.push(h("button",{key:"scale-create",title:"Create a new derived trace by multiplying the source trace by a constant factor.",onClick:props.createScaledDerivedTrace,disabled:!props.scaleSource||!isFinite(parseFloat(props.scaleValue)),style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.tr[3]||C.accent,borderRadius:4,cursor:!props.scaleSource||!isFinite(parseFloat(props.scaleValue))?"not-allowed":"pointer",fontSize:11,opacity:!props.scaleSource||!isFinite(parseFloat(props.scaleValue))?0.55:1,marginBottom:8}},"Create Scaled Trace"));
    items.push(h("div",{key:"scale-note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Scale multiplies the source trace amplitudes by a constant factor. Use it when you want multiplicative correction instead of additive offset."));
  }
  if(props.openOps.smoothing){
    items.push(h(Sec,{key:"smooth-sec"},"Smoothing"));
    items.push(h("div",{key:"sm-src",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Source"),
      h("select",{value:props.smoothSource,onChange:function(ev){props.setSmoothSource(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        props.traceOptions.map(function(tr){return h("option",{key:"sm-"+tr.name,value:tr.name},getTraceLabel(tr));}))
    ));
    items.push(h("div",{key:"sm-method",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Method"),
      h("select",{value:props.smoothMethod,onChange:function(ev){props.setSmoothMethod(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        h("option",{value:"none"},"None"),
        h("option",{value:"moving-average"},"Moving Average"),
        h("option",{value:"median-filter"},"Median Filter"),
        h("option",{value:"savitzky-golay"},"Savitzky-Golay")
      )
    ));
    if(props.smoothMethod!=="none"){
      items.push(h("div",{key:"sm-win",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
        h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Window"),
        h("input",{type:"number",value:props.smoothWindow,onChange:function(ev){props.setSmoothWindow(ev.target.value);},min:"3",step:"2",style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}),
        h("span",{style:{fontSize:11,color:"var(--muted)"}},"pts")
      ));
    }
    if(props.smoothMethod==="savitzky-golay"){
      items.push(h("div",{key:"sm-poly",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
        h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Order"),
        h("input",{type:"number",value:props.smoothPolyOrder,onChange:function(ev){props.setSmoothPolyOrder(ev.target.value);},min:"1",step:"1",style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}),
        h("span",{style:{fontSize:11,color:"var(--muted)"}},"poly")
      ));
    }
    items.push(h("button",{key:"sm-create",title:props.smoothMethod==="none"?"Create a direct copy of the selected source trace.":"Create a derived trace using the selected smoothing method.",onClick:props.createSmoothedDerivedTrace,disabled:!props.smoothSource,style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.tr[5]||C.accent,borderRadius:4,cursor:!props.smoothSource?"not-allowed":"pointer",fontSize:11,opacity:!props.smoothSource?0.55:1,marginBottom:8}},props.smoothMethod==="none"?"Create Raw Copy":"Create Smoothed Trace"));
    items.push(h("div",{key:"sm-note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},
      props.smoothMethod==="none"
        ?"None keeps the source trace unchanged and creates a direct copy with no smoothing."
        :props.smoothMethod==="moving-average"
          ?"Moving Average is the current simple smoother and uses an odd window size."
          :props.smoothMethod==="median-filter"
            ?"Median Filter is useful for removing isolated spikes while keeping the baseline stable."
            :"Savitzky-Golay smooths while preserving peak shape better than Moving Average, but still needs sensible window/order settings."
    ));
  }
  if(props.openOps.subtract){
    items.push(h(Sec,{key:"sub-sec"},"Trace Math"));
    items.push(h("div",{key:"sub-op",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Op"),
      h("select",{value:props.traceMathOperation,onChange:function(ev){props.setTraceMathOperation(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        h("option",{value:"subtract"},"A - B"),
        h("option",{value:"add"},"A + B"),
        h("option",{value:"multiply"},"A * B"),
        h("option",{value:"divide"},"A / B")
      )
    ));
    items.push(h("div",{key:"sub-a",style:{display:"flex",alignItems:"center",gap:6,marginBottom:6}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"A"),
      h("select",{value:props.subtractA,onChange:function(ev){props.setSubtractA(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        props.traceOptions.map(function(tr){return h("option",{key:"sub-a-"+tr.name,value:tr.name},getTraceLabel(tr));}))
    ));
    items.push(h("div",{key:"sub-b",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"B"),
      h("select",{value:props.subtractB,onChange:function(ev){props.setSubtractB(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        props.traceOptions.map(function(tr){return h("option",{key:"sub-b-"+tr.name,value:tr.name},getTraceLabel(tr));}))
    ));
    items.push(h("div",{key:"sub-int",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
      h("span",{style:{fontSize:11,color:"var(--muted)",minWidth:46}},"Interp"),
      h("select",{value:props.subtractInterpolation,onChange:function(ev){props.setSubtractInterpolation(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
        h("option",{value:"auto"},"Auto"),
        h("option",{value:"exact"},"Exact only"),
        h("option",{value:"linear"},"Linear"),
        h("option",{value:"nearest"},"Nearest"),
        h("option",{value:"previous"},"Previous"),
        h("option",{value:"next"},"Next"),
        h("option",{value:"cubic"},"Cubic spline")
      )
    ));
    items.push(h("button",{key:"sub-create",title:"Create a derived trace from the selected trace math operation using the chosen interpolation mode.",onClick:props.createTraceMathDerivedTrace,disabled:!props.subtractA||!props.subtractB||props.subtractA===props.subtractB,style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.tr[1],borderRadius:4,cursor:!props.subtractA||!props.subtractB||props.subtractA===props.subtractB?"not-allowed":"pointer",fontSize:11,opacity:!props.subtractA||!props.subtractB||props.subtractA===props.subtractB?0.55:1,marginBottom:8}},props.traceMathOperation==="subtract"?"Create A - B Trace":props.traceMathOperation==="add"?"Create A + B Trace":props.traceMathOperation==="multiply"?"Create A * B Trace":"Create A / B Trace"));
    if(props.traceMathUnitWarning)items.push(h("div",{key:"sub-unit-note",style:{fontSize:11,color:"#b8860b",lineHeight:1.4,marginBottom:6}},props.traceMathUnitWarning));
    if(props.traceOpsError)items.push(h("div",{key:"sub-err",style:{fontSize:11,color:"#f55",lineHeight:1.4,marginBottom:6}},props.traceOpsError));
    items.push(h("div",{key:"sub-note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Binary trace math uses A's grid over the overlap range only. Auto uses exact matching when possible, otherwise linear. Exact only rejects mismatched X grids. Previous/Next are step modes, and cubic can overshoot measured RF data."));
  }
  return items;
}

function formatHzRange(rangeHz){
  if(!rangeHz||!isFinite(rangeHz.left)||!isFinite(rangeHz.right))return "--";
  return fmtF(rangeHz.left,true)+" .. "+fmtF(rangeHz.right,true);
}
function xUnitScale(unit){
  return unit==="GHz"?1e9:unit==="MHz"?1e6:unit==="kHz"?1e3:1;
}
function appendAnalysisTargetRows(items,keyBase,target,color){
  items.push(h(MR,{key:keyBase+"-pane",label:"Pane",value:(target&&target.paneId)?target.paneId.replace("pane-","P"):"--",vc:color}));
  items.push(h(MR,{key:keyBase+"-trace",label:"Trace",value:(target&&target.traceLabel)||"--",vc:color}));
  items.push(h(MR,{key:keyBase+"-range",label:"Range",value:formatHzRange(target&&target.rangeHz)}));
}
function appendAnalysisUnsupported(items,keyBase,target){
  var msg=(target&&target.reason)||"This analysis is not available for the current trace selection.";
  items.push(h("div",{key:keyBase+"-unsupported",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},msg));
  return items;
}
function AnalysisMenuCard(props){
  var C=props.C, items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",first:!props.hasTraceOps,color:C.accent,title:"Analysis",description:"Measurement and numeric analysis tools live here. Open one or more functions below."}));
  items.push(h("div",{key:"btns",style:{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}},
    (props.registry||[]).map(function(item){
      return h("button",{key:item.id,title:"Open or close the "+item.title+" analysis card.",onClick:function(){props.toggleAnalysisOpen(item.id);},style:{padding:"5px 8px",background:item.isOpen?(getAnalysisColor(item,C)+"22"):"transparent",border:"1px solid "+(item.isOpen?getAnalysisColor(item,C):"var(--border)"),color:item.isOpen?getAnalysisColor(item,C):"var(--muted)",borderRadius:4,cursor:"pointer",fontSize:11}},
        item.title+(item.resultCount?(" ("+item.resultCount+")"):""));
    })
  ));
  if(!(props.registry||[]).some(function(item){return item.isOpen;}))items.push(h("div",{key:"idle",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Choose a function to open its controls here. Phase 4 tools act on the selected trace in the active pane over the visible range."));
  return items;
}

function PeakSpurTableCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.tr[2],title:"Peak / Spur Table",description:"Find local peaks on the selected trace within the active pane's visible range."}));
  appendAnalysisTargetRows(items,"pst",target,C.tr[2]);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"pst",target);
  items.push(h("div",{key:"controls",style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}},
    h("div",null,h("div",{style:{fontSize:11,color:"var(--muted)",marginBottom:3}},"Count"),h("input",{type:"number",min:"1",max:"50",value:props.peakTableLimit,onChange:function(ev){props.setPeakTableLimit(ev.target.value);},style:{width:"100%",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}})),
    h("div",null,h("div",{style:{fontSize:11,color:"var(--muted)",marginBottom:3}},"Min Spacing"),h("input",{type:"number",min:"0",step:"0.001",value:props.peakTableMinSpacing,onChange:function(ev){props.setPeakTableMinSpacing(ev.target.value);},style:{width:"100%",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}})),
    h("div",null,h("div",{style:{fontSize:11,color:"var(--muted)",marginBottom:3}},"Min Amp"),h("input",{type:"number",step:"0.1",value:props.peakTableMinAmp,onChange:function(ev){props.setPeakTableMinAmp(ev.target.value);},style:{width:"100%",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}))
  ));
  var peaks=buildPeakSpurTable(target.data,{limit:props.peakTableLimit,minSpacingHz:(parseFloat(props.peakTableMinSpacing)||0)*xUnitScale(target.xUnit),minAmp:props.peakTableMinAmp});
  if(!peaks.length){
    items.push(h("div",{key:"none",style:{fontSize:11,color:"var(--muted)"}},"No peaks matched the current threshold and spacing filters."));
    return items;
  }
  items.push(h("div",{key:"actions",style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
    h("button",{
      title:"Place peak markers on all rows in this table for the selected trace.",
      onClick:function(){if(props.addAllPeakMarkers)props.addAllPeakMarkers(target,peaks);},
      style:{padding:"5px 8px",background:"transparent",border:"1px solid "+C.tr[2],color:C.tr[2],borderRadius:4,cursor:"pointer",fontSize:11}
    },"Mark All")
  ));
  items.push(h("div",{key:"rows",style:{display:"grid",gap:4}},
    peaks.map(function(row){
      return h("div",{key:"peak-"+row.rank,style:{display:"grid",gridTemplateColumns:"38px 1fr 1fr auto",gap:8,fontSize:11,padding:"4px 6px",border:"1px solid var(--border)",borderRadius:4,background:"var(--bg)"}},
        h("span",{style:{color:C.tr[2],fontWeight:600}},"#"+row.rank),
        h("span",{style:{fontFamily:"monospace"}},fmtF(row.freq,true)),
        h("span",{style:{fontFamily:"monospace"}},row.amp.toFixed(3)+(target.yUnit?(" "+target.yUnit):"")),
        h("button",{
          title:"Place a peak marker at this peak on the selected trace.",
          onClick:function(){if(props.addPeakMarker)props.addPeakMarker(target,row);},
          style:{padding:"2px 6px",background:"transparent",border:"1px solid "+C.tr[2],color:C.tr[2],borderRadius:4,cursor:"pointer",fontSize:11}
        },"Mark"));
    })
  ));
  return items;
}

function MarkerDeltaTableCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.md,title:"Marker Delta Table",description:"Show marker deltas on the selected trace in the active pane's visible range."}));
  appendAnalysisTargetRows(items,"mdt",target,C.md);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"mdt",target);
  var rows=buildMarkerDeltaTable(props.markers,target.trace.name,target.rangeHz,target.xUnit,target.yUnit);
  if(!rows.length){
    items.push(h("div",{key:"none",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Place at least two markers on the selected trace to see delta rows."));
    return items;
  }
  var scale=xUnitScale(target.xUnit);
  items.push(h("div",{key:"rows",style:{display:"grid",gap:4}},
    rows.map(function(row,idx){
      var slopeDisplay="--";
      if(isFinite(row.slope)&&scale>0){
        slopeDisplay=(row.deltaY/(row.deltaX/scale)).toFixed(4)+" "+(target.yUnit||"dB")+"/"+target.xUnit;
      }
      return h("div",{key:"mdr-"+idx,style:{padding:"4px 6px",border:"1px solid var(--border)",borderRadius:4,background:"var(--bg)",fontSize:11,lineHeight:1.45}},
        h("div",{style:{fontWeight:600,color:C.md,marginBottom:2}},row.from+" -> "+row.to),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontFamily:"monospace"}},
          h("span",null,"dX: "+fmtF(row.deltaX,true)),
          h("span",null,"dY: "+row.deltaY.toFixed(3)+(target.yUnit?(" "+target.yUnit):"")),
          h("span",null,"Slope: "+slopeDisplay)));
    })
  ));
  return items;
}

function RangeStatsCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.tr[1],title:"Range Statistics",description:"Compute simple amplitude statistics over the visible range of the selected trace."}));
  appendAnalysisTargetRows(items,"rst",target,C.tr[1]);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"rst",target);
  var stats=computeRangeStats(target.data);
  if(!stats)return appendAnalysisUnsupported(items,"rst2",{reason:"Not enough visible samples to compute range statistics."});
  items.push(h(MR,{key:"count",label:"Points",value:stats.count,vc:C.tr[1]}));
  items.push(h(MR,{key:"min",label:"Min",value:stats.min.amp.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[1]}));
  items.push(h(MR,{key:"minf",label:"Min Freq",value:fmtF(stats.min.freq,true)}));
  items.push(h(MR,{key:"max",label:"Max",value:stats.max.amp.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[1]}));
  items.push(h(MR,{key:"maxf",label:"Max Freq",value:fmtF(stats.max.freq,true)}));
  items.push(h(MR,{key:"avg",label:"Average",value:stats.average.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[1]}));
  items.push(h(MR,{key:"med",label:"Median",value:isFinite(stats.median)?(stats.median.toFixed(3)+(target.yUnit?(" "+target.yUnit):"")):"--"}));
  return items;
}

function BandwidthHelperCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.tr[0],title:"3 dB / 10 dB Bandwidth",description:"Estimate bandwidth from a selected peak marker or the strongest visible peak in the active pane."}));
  appendAnalysisTargetRows(items,"bwh",target,C.tr[0]);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"bwh",target);
  items.push(h("div",{key:"drop",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
    h("span",{style:{fontSize:11,color:"var(--muted)"}},"Drop"),
    h("select",{value:props.bandwidthDrop,onChange:function(ev){props.setBandwidthDrop(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
      h("option",{value:"3"},"3 dB"),
      h("option",{value:"10"},"10 dB"))
  ));
  var reference=(props.selectedMarker&&props.selectedMarker.type==="peak"&&target.trace&&props.selectedMarker.trace===target.trace.name&&(!target.rangeHz||(props.selectedMarker.freq>=target.rangeHz.left&&props.selectedMarker.freq<=target.rangeHz.right)))?props.selectedMarker:null;
  var refPoint=reference||((buildPeakSpurTable(target.data,{limit:1})[0])||null);
  if(!refPoint){
    items.push(h("div",{key:"none",style:{fontSize:11,color:"var(--muted)"}},"No visible peak could be used as the bandwidth reference."));
    return items;
  }
  var result=computeBandwidthAtDrop(target.data,refPoint.freq,refPoint.amp,parseFloat(props.bandwidthDrop)||3);
  items.push(h(MR,{key:"src",label:"Reference",value:(reference?"Selected peak marker":"Strongest visible peak"),vc:C.tr[0]}));
  items.push(h(MR,{key:"rf",label:"Ref Freq",value:fmtF(refPoint.freq,true)}));
  items.push(h(MR,{key:"ra",label:"Ref Amp",value:refPoint.amp.toFixed(3)+(target.yUnit?(" "+target.yUnit):"")}));
  if(!result){
    items.push(h("div",{key:"err",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Could not find both bandwidth edges in the visible range."));
    return items;
  }
  items.push(h(MR,{key:"lvl",label:"Level",value:result.level.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[0]}));
  items.push(h(MR,{key:"left",label:"Left Edge",value:fmtF(result.left,true)}));
  items.push(h(MR,{key:"right",label:"Right Edge",value:fmtF(result.right,true)}));
  items.push(h(MR,{key:"bw",label:"Bandwidth",value:fmtF(result.bandwidth,true),vc:C.tr[0]}));
  items.push(h("div",{key:"note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Edge estimate: "+result.mode+". Linear interpolation is used when the exact level is not sampled directly."));
  return items;
}

function ThresholdCrossingsCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.refH,title:"Threshold Crossings",description:"Find where the selected trace crosses a horizontal level in the visible range."}));
  appendAnalysisTargetRows(items,"thc",target,C.refH);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"thc",target);
  items.push(h("div",{key:"manual",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
    h("span",{style:{fontSize:11,color:"var(--muted)"}},"Manual"),
    h("input",{type:"number",step:"0.1",value:props.thresholdManual,onChange:function(ev){props.setThresholdManual(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}),
    h("span",{style:{fontSize:11,color:"var(--muted)"}} ,target.yUnit||"")
  ));
  var usingHLine=props.selectedHLine&&isFinite(props.selectedHLine.value);
  var level=usingHLine?props.selectedHLine.value:parseFloat(props.thresholdManual);
  if(!isFinite(level)){
    items.push(h("div",{key:"need",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Enter a manual threshold or select an H-line in the active pane."));
    return items;
  }
  items.push(h(MR,{key:"src",label:"Threshold Source",value:usingHLine?"Selected H-line":"Manual input",vc:C.refH}));
  items.push(h(MR,{key:"lvl",label:"Level",value:level.toFixed(3)+(target.yUnit?(" "+target.yUnit):"")}));
  var hits=findThresholdCrossingsForLevel(target.data,level);
  if(!hits.length){
    items.push(h("div",{key:"none",style:{fontSize:11,color:"var(--muted)"}},"No threshold crossings were found in the visible range."));
    return items;
  }
  items.push(h("div",{key:"rows",style:{display:"grid",gap:4}},
    hits.map(function(hit,idx){
      return h("div",{key:"hit-"+idx,style:{display:"flex",justifyContent:"space-between",gap:8,fontSize:11,padding:"4px 6px",border:"1px solid var(--border)",borderRadius:4,background:"var(--bg)",fontFamily:"monospace"}},
        h("span",{style:{color:C.refH}},"Crossing "+(idx+1)),
        h("span",null,fmtF(hit.freq,true)));
    })
  ));
  items.push(h("div",{key:"note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},"Crossings are estimated with linear interpolation between adjacent visible samples."));
  return items;
}

function RippleFlatnessCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.tr[5],title:"Ripple / Flatness",description:"Measure peak-to-peak flatness over the visible range of the selected trace."}));
  appendAnalysisTargetRows(items,"rfl",target,C.tr[5]);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"rfl",target);
  var result=computeRippleFlatness(target.data);
  if(!result)return appendAnalysisUnsupported(items,"rfl2",{reason:"Not enough visible samples to compute ripple."});
  items.push(h(MR,{key:"min",label:"Min",value:result.min.amp.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[5]}));
  items.push(h(MR,{key:"max",label:"Max",value:result.max.amp.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[5]}));
  items.push(h(MR,{key:"ripple",label:"Ripple",value:result.ripple.toFixed(3)+(target.yUnit?(" "+target.yUnit):""),vc:C.tr[5]}));
  items.push(h(MR,{key:"span",label:"Range Span",value:fmtF(result.spanHz,true)}));
  return items;
}

function OccupiedBandwidthCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.tr[0],title:"Occupied Bandwidth",description:"Estimate occupied bandwidth from the visible portion of a power-like trace."}));
  appendAnalysisTargetRows(items,"obw",target,C.tr[0]);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"obw",target);
  items.push(h("div",{key:"pct",style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
    h("span",{style:{fontSize:11,color:"var(--muted)"}},"Percent"),
    h("input",{type:"number",min:"1",max:"99.9",step:"0.1",value:props.obwPercent,onChange:function(ev){props.setObwPercent(ev.target.value);},style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}}),
    h("span",{style:{fontSize:11,color:"var(--muted)"}},"%")
  ));
  var result=computeOccupiedBandwidth(target.data,parseFloat(props.obwPercent)||99,target.yUnit);
  if(!result.supported){
    items.push(h("div",{key:"na",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},result.reason));
    return items;
  }
  items.push(h(MR,{key:"lo",label:"Lower Edge",value:fmtF(result.lower,true),vc:C.tr[0]}));
  items.push(h(MR,{key:"hi",label:"Upper Edge",value:fmtF(result.upper,true),vc:C.tr[0]}));
  items.push(h(MR,{key:"bw",label:"OBW",value:fmtF(result.bandwidth,true),vc:C.tr[0]}));
  items.push(h("div",{key:"note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},result.note));
  return items;
}

function ChannelPowerCard(props){
  var C=props.C,target=props.target,items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.accent,title:"Channel Power",description:"Integrate visible-range spectral power density when the trace unit semantics are explicit enough to stay honest."}));
  appendAnalysisTargetRows(items,"chp",target,C.accent);
  if(!target||!target.supported)return appendAnalysisUnsupported(items,"chp",target);
  var result=computeChannelPower(target.data,target.yUnit);
  if(!result.supported){
    items.push(h("div",{key:"na",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},result.reason));
    return items;
  }
  items.push(h(MR,{key:"dbm",label:"Channel Power",value:result.powerDbm.toFixed(3)+" dBm",vc:C.accent}));
  items.push(h(MR,{key:"dbw",label:"Channel Power",value:result.powerDbw.toFixed(3)+" dBW"}));
  items.push(h("div",{key:"note",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4}},result.note));
  return items;
}

function IP3Card(props){
  var C=props.C, items=[];
  items.push(h(AnalysisFeatureCard,{key:"head",color:C.ip3C,title:"IP3 / TOI (saved numbers)",description:"Select a visible marker, assign it to F1/F2/IM3L/IM3U, and compute IP3 directly from those marker roles. Auto-pick can fill the remaining points on the same trace from the selected marker."}));
  items.push(h("button",{key:"reset",title:"Clear all assigned IP3 marker roles and reset the current IP3 calculation.",onClick:function(){props.ip3Ctl.resetIP3(props.setMarkers);},style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.ip3C,borderRadius:4,cursor:"pointer",fontSize:11,marginBottom:8}},"Reset IP3 Roles"));
  items.push(h("div",{key:"sel",style:{fontSize:11,color:"var(--muted)",marginBottom:8,lineHeight:1.35}},props.selectedMarker?("Selected marker: "+(props.selectedMarker.label||("M"+(props.selectedIndex+1)))+" @ "+fmtF(props.selectedMarker.freq,true)):"Select a marker from the sidebar to assign IP3 roles."));
  items.push(h("div",{key:"roles",style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}},
    IP3_ROLE_KEYS.map(function(role){
      var marker=props.ip3Pts[role];
      var disabled=props.selectedIndex===null||props.selectedIndex===undefined;
      return h("button",{key:role,title:"Assign the currently selected marker to the "+IP3_ROLE_LABELS[role]+" role.",onClick:function(){props.assignSelectedRole(role);},disabled:disabled,style:{padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.ip3C,borderRadius:4,cursor:disabled?"not-allowed":"pointer",fontSize:11,opacity:disabled?0.55:1}},
        marker?(IP3_ROLE_LABELS[role]+": "+fmtF(marker.freq,true)):("Assign "+IP3_ROLE_LABELS[role]));
    })
  ));
  items.push(h("div",{key:"tools",style:{display:"flex",gap:6,marginBottom:8}},
    h("button",{key:"auto",title:"Use the selected marker as a seed and auto-pick the remaining IP3 roles on the same trace.",onClick:props.autoPickIP3,disabled:props.selectedIndex===null||props.selectedIndex===undefined,style:{flex:1,padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.ip3C,borderRadius:4,cursor:props.selectedIndex===null||props.selectedIndex===undefined?"not-allowed":"pointer",fontSize:11,opacity:props.selectedIndex===null||props.selectedIndex===undefined?0.55:1}},"Auto-Pick From Selected"),
    h("button",{key:"clear-role",title:"Remove the IP3 role label from the currently selected marker.",onClick:props.clearSelectedRole,disabled:props.selectedIndex===null||props.selectedIndex===undefined||!props.selectedMarker||!isIP3Label(props.selectedMarker.label),style:{flex:1,padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:4,cursor:props.selectedIndex===null||props.selectedIndex===undefined?"not-allowed":"pointer",fontSize:11,opacity:props.selectedIndex===null||props.selectedIndex===undefined?0.55:1}},"Clear Selected Role")
  ));
  if(props.ip3Res){
    items.push(h(MR,{key:"a",label:"OIP3 (avg)",value:props.ip3Res.oip3_avg.toFixed(2)+" "+props.yU,vc:C.ip3C}));
    items.push(h(MR,{key:"l",label:"OIP3 (lower)",value:props.ip3Res.oip3_l.toFixed(2)+" "+props.yU,vc:C.ip3C}));
    items.push(h(MR,{key:"u",label:"OIP3 (upper)",value:props.ip3Res.oip3_u.toFixed(2)+" "+props.yU,vc:C.ip3C}));
    items.push(h(MR,{key:"dl",label:"Delta lower",value:props.ip3Res.deltaL.toFixed(2)+" dBc"}));
    items.push(h(MR,{key:"du",label:"Delta upper",value:props.ip3Res.deltaU.toFixed(2)+" dBc"}));
    items.push(h("div",{key:"gain",style:{display:"flex",alignItems:"center",gap:6,marginTop:8}},
      h("span",{style:{fontSize:11,color:"var(--muted)"}},"Gain:"),
      h("input",{type:"number",value:props.ip3Gain,onChange:function(ev){props.setIP3Gain(ev.target.value);},placeholder:"optional",style:{flex:1,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}})
    ));
    if(props.ip3Gain!==''&&!isNaN(parseFloat(props.ip3Gain)))items.push(h(MR,{key:"i",label:"IIP3 (avg)",value:(props.ip3Res.oip3_avg-parseFloat(props.ip3Gain)).toFixed(2)+" "+props.yU,vc:C.ip3C}));
    items.push(h("button",{key:"save",title:"Save the current computed IP3 result into the analysis results list.",onClick:props.saveIP3,style:{width:"100%",padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.ip3C,borderRadius:4,cursor:"pointer",fontSize:11,marginTop:6}},"Save IP3 Result"));
  } else {
    items.push(h("div",{key:"need",style:{fontSize:11,color:"var(--muted)",marginBottom:8,lineHeight:1.35}},"Assign all four roles to compute IP3. Moving a labeled marker updates the calculation automatically."));
  }
  if(props.ip3Results.length){
    items.push(h(Sec,{key:"saved"},"Saved IP3 Results ("+props.ip3Results.length+")"));
    props.ip3Results.forEach(function(r){ items.push(h(SavedIP3ResultItem,{key:r.id,r:r,C:C,yU:props.yU,onRemove:props.removeIP3})); });
  }
  return items;
}

function AnalysisPanelStack(props){
  if(!props||!props.visible)return null;
  var sections=[];
  if(props.showTraceOps){
    sections.push(h(TraceOpsCard,Object.assign({key:"trace-ops"},props.traceOpsProps)));
  }
  if(props.showAnalysisPanel){
    sections.push(h(AnalysisMenuCard,Object.assign({key:"analysis-menu"},props.analysisMenuProps)));
  }
  if(props.showNoise){
    sections.push(h(NoisePSDCard,Object.assign({key:"noise-psd"},props.noiseCardProps)));
  }
  if(props.showIP3){
    sections.push(h(IP3Card,Object.assign({key:"ip3"},props.ip3CardProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["peak-spur-table"]){
    sections.push(h(PeakSpurTableCard,Object.assign({key:"peak-spur-table"},props.peakSpurProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["marker-delta-table"]){
    sections.push(h(MarkerDeltaTableCard,Object.assign({key:"marker-delta-table"},props.markerDeltaProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["range-stats"]){
    sections.push(h(RangeStatsCard,Object.assign({key:"range-stats"},props.rangeStatsProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["bandwidth-helper"]){
    sections.push(h(BandwidthHelperCard,Object.assign({key:"bandwidth-helper"},props.bandwidthProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["threshold-crossings"]){
    sections.push(h(ThresholdCrossingsCard,Object.assign({key:"threshold-crossings"},props.thresholdProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["ripple-flatness"]){
    sections.push(h(RippleFlatnessCard,Object.assign({key:"ripple-flatness"},props.rippleProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["occupied-bandwidth"]){
    sections.push(h(OccupiedBandwidthCard,Object.assign({key:"occupied-bandwidth"},props.obwProps)));
  }
  if(props.normalizedAnalysisOpenState&&props.normalizedAnalysisOpenState["channel-power"]){
    sections.push(h(ChannelPowerCard,Object.assign({key:"channel-power"},props.channelPowerProps)));
  }
  return h("div",{key:"analysis-stack",style:{display:"flex",flexDirection:"column",gap:10}},sections);
}

global.AppAnalysis={
  AnalysisFeatureCard:AnalysisFeatureCard,
  NoisePSDCard:NoisePSDCard,
  TraceOpsCard:TraceOpsCard,
  AnalysisMenuCard:AnalysisMenuCard,
  PeakSpurTableCard:PeakSpurTableCard,
  MarkerDeltaTableCard:MarkerDeltaTableCard,
  RangeStatsCard:RangeStatsCard,
  BandwidthHelperCard:BandwidthHelperCard,
  ThresholdCrossingsCard:ThresholdCrossingsCard,
  RippleFlatnessCard:RippleFlatnessCard,
  OccupiedBandwidthCard:OccupiedBandwidthCard,
  ChannelPowerCard:ChannelPowerCard,
  IP3Card:IP3Card,
  AnalysisPanelStack:AnalysisPanelStack
};
})(window);

