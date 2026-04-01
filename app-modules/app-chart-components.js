(function(global){
  var React=global.React;
  var RC=global.Recharts||{};
  var TM=global.TraceModel||{};
  var TH=global.TraceHelpers||{};
  var UH=global.UIHelpers||{};
  var PH=global.PaneHelpers||{};

  var h=React.createElement;
  var LineChart=RC.LineChart;
  var Line=RC.Line;
  var XAxis=RC.XAxis;
  var YAxis=RC.YAxis;
  var CartesianGrid=RC.CartesianGrid;
  var Tooltip=RC.Tooltip;
  var ResponsiveContainer=RC.ResponsiveContainer;
  var ReferenceLine=RC.ReferenceLine;
  var ReferenceDot=RC.ReferenceDot;

  var getTraceLabel=TM.getTraceLabel||function(tr){ return tr?(tr.dn||tr.name||""):""; };
  var getTraceData=TM.getTraceData||function(tr){ return tr&&Array.isArray(tr.data)?tr.data:[]; };
  var getEffectiveTraceYUnit=TM.getEffectiveTraceYUnit||function(){ return ""; };
  var getYAxisTextForUnit=TM.getYAxisTextForUnit||function(unit){ return unit?("Amplitude ("+unit+")"):"Amplitude"; };
  var makeNiceTicks=TH.makeNiceTicks||function(){ return undefined; };
  var makeYTicksFromDomain=TH.makeYTicksFromDomain||function(){ return undefined; };
  var fmtF=UH.fmtF||function(v){ return String(v); };
  var getTracePaneIdFromHelpers=PH.getTracePaneId||function(tracePaneMap,traceName){
    return (tracePaneMap&&tracePaneMap[traceName])||"pane-1";
  };

  var CHART_MARGIN_TOP=8;
  var CHART_MARGIN_RIGHT=12;
  var CHART_MARGIN_BOTTOM=24;
  var CHART_MARGIN_LEFT=0;
  var CHART_Y_AXIS_WIDTH=56;
  var CHART_PLOT_LEFT=CHART_MARGIN_LEFT+CHART_Y_AXIS_WIDTH;

  function noop(){}

  function EmptyChartPane(props){
    return h("div",{style:{flex:1,padding:"8px 12px 0",minHeight:0,position:"relative"}},
      h("div",{
        onDragOver:function(ev){
          ev.preventDefault();
          if(props.setIsDrag)props.setIsDrag(true);
        },
        onDragLeave:function(ev){
          if(!ev.currentTarget.contains(ev.relatedTarget)&&props.setIsDrag)props.setIsDrag(false);
        },
        onDrop:function(ev){
          ev.preventDefault();
          if(props.setIsDrag)props.setIsDrag(false);
          if(props.loadFiles&&ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files.length){
            props.loadFiles(ev.dataTransfer.files,false);
          }
        },
        onClick:function(){
          if(props.fileInputRef&&props.fileInputRef.current&&props.fileInputRef.current.click)props.fileInputRef.current.click();
        },
        style:{
          height:"100%",
          width:"100%",
          position:"relative",
          overflow:"hidden",
          cursor:"pointer",
          background:"var(--bg)",
          border:"1px solid var(--border)",
          borderRadius:8
        }
      },
        h("div",{style:{
          position:"absolute",
          inset:0,
          backgroundImage:"linear-gradient(to right, var(--grid) 1px, transparent 1px), linear-gradient(to bottom, var(--grid) 1px, transparent 1px)",
          backgroundSize:"12.5% 100%, 100% 12.5%",
          pointerEvents:"none"
        }}),
        h("div",{style:{position:"absolute",left:60,right:16,bottom:34,height:1,background:"var(--muted)",opacity:0.65,pointerEvents:"none"}}),
        h("div",{style:{position:"absolute",left:60,top:16,bottom:34,width:1,background:"var(--muted)",opacity:0.65,pointerEvents:"none"}}),
        h("div",{style:{
          position:"absolute",
          left:"50%",
          top:"50%",
          transform:"translate(-50%,-50%)",
          padding:"20px 24px",
          border:"2px dashed "+(props.isDrag?"var(--accent)":"var(--border)"),
          borderRadius:12,
          textAlign:"center",
          background:props.isDrag?"var(--drop-h)":"var(--card)"
        }},
          h("div",{style:{fontSize:16,fontWeight:700,marginBottom:6}},"Drop .dat, .csv, or Touchstone .s1p/.s2p/.sNp files here"),
          h("div",{style:{fontSize:12,color:"var(--muted)",lineHeight:1.45}},"Click the graph to import local files. Touchstone imports will unlock S/Y/Z matrix views and stability analysis once they are loaded.")
        )
      )
    );
  }

  function resolveTraceByName(props,name){
    if(!name)return null;
    if(typeof props.getTraceByName==="function")return props.getTraceByName(name);
    var allTr=Array.isArray(props.allTr)?props.allTr:[];
    for(var i=0;i<allTr.length;i++){
      if(allTr[i]&&allTr[i].name===name)return allTr[i];
    }
    return null;
  }

  function resolveTracePaneId(props,traceName){
    if(typeof props.getTracePaneId==="function")return props.getTracePaneId(traceName);
    return getTracePaneIdFromHelpers(props.tracePaneMap||{},traceName);
  }

  function renderCrosshairReadout(hoverData,hoverX){
    if(!hoverData||!hoverData.length||hoverX===null||hoverX===undefined)return null;
    var rows=[
      h("div",{key:"cr-f",className:"cr-row",style:{borderBottom:"1px solid var(--border)",paddingBottom:2,marginBottom:2}},
        h("span",{style:{color:"var(--muted)"}},fmtF(hoverX,true)))
    ];
    hoverData.forEach(function(v,i){
      rows.push(h("div",{key:"cr-"+i,className:"cr-row"},
        h("span",null,
          h("span",{className:"cr-dot",style:{background:v.color}}),
          v.name
        ),
        h("span",{style:{fontWeight:600}},Number(v.value).toFixed(3))
      ));
    });
    return h("div",{className:"crosshair-readout"},rows);
  }

  function renderDragOverlay(opts){
    if(!opts.isActive||opts.selA==null||opts.selB==null||typeof opts.getXDomainHz!=="function")return null;
    var domHz=opts.getXDomainHz();
    if(!domHz||!isFinite(domHz.left)||!isFinite(domHz.right)||domHz.right<=domHz.left)return null;
    var rect=opts.chartRef&&opts.chartRef.current?opts.chartRef.current.getBoundingClientRect():null;
    if(!rect)return null;
    var plotW=Math.max(0,rect.width-CHART_PLOT_LEFT-CHART_MARGIN_RIGHT);
    var plotH=Math.max(0,rect.height-CHART_MARGIN_TOP-CHART_MARGIN_BOTTOM);
    if(!(plotW>0&&plotH>0))return null;
    var aHz=opts.selA*opts.paneFDiv;
    var bHz=opts.selB*opts.paneFDiv;
    var x1=(Math.min(aHz,bHz)-domHz.left)/(domHz.right-domHz.left)*plotW;
    var x2=(Math.max(aHz,bHz)-domHz.left)/(domHz.right-domHz.left)*plotW;
    x1=Math.max(0,Math.min(plotW,x1));
    x2=Math.max(0,Math.min(plotW,x2));
    return h("div",{
      className:"chart-drag-overlay",
      style:{
        position:"absolute",
        left:CHART_PLOT_LEFT+x1,
        top:CHART_MARGIN_TOP,
        width:Math.max(1,Math.abs(x2-x1)),
        height:plotH,
        pointerEvents:"none",
        background:"rgba(0,120,212,0.04)",
        border:"1px solid rgba(0,120,212,0.45)",
        borderRadius:2,
        zIndex:9,
        boxSizing:"border-box"
      }
    });
  }

  function renderPaneHeader(props){
    var model=props.model;
    var paneId=model.pane.id;
    var isActive=props.activePaneId===paneId;
    var paneDropActive=props.dragTraceName!==null&&props.dragTraceName!==undefined&&resolveTracePaneId(props,props.dragTraceName)!==paneId;
    var activeTrace=model.paneActiveTraceName?resolveTraceByName(props,model.paneActiveTraceName):null;
    var paneHeaderTrace=activeTrace?getTraceLabel(activeTrace):"No active trace";
    return h("div",{
      className:"pane-header",
      onClick:function(){ if(props.setActivePaneId)props.setActivePaneId(paneId); },
      style:{
        display:"flex",
        flexDirection:"column",
        gap:6,
        padding:"6px 10px",
        borderBottom:"1px solid var(--border)",
        background:paneDropActive?(props.C.accent+"18"):(isActive?(props.C.accent+"10"):"var(--card)"),
        cursor:"pointer",
        flexShrink:0
      }
    },
      h("div",{style:{display:"flex",alignItems:"center",gap:8}},
        h("span",{style:{fontSize:11,fontWeight:700,color:isActive?props.C.accent:"var(--muted)",textTransform:"uppercase",letterSpacing:0.5}},model.pane.title),
        h("span",{style:{fontSize:11,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},paneHeaderTrace),
        paneDropActive?h("span",{style:{fontSize:10,color:props.C.accent,fontWeight:700,border:"1px dashed "+props.C.accent,borderRadius:999,padding:"2px 6px",lineHeight:1.1}},"Drop Trace Here"):null,
        h("div",{className:"pane-header-actions",style:{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}},
          h("button",{
            title:"Make this pane active for marker, search, and line actions.",
            onClick:function(ev){
              ev.stopPropagation();
              if(props.setActivePaneId)props.setActivePaneId(paneId);
            },
            style:{
              padding:"4px 8px",
              background:isActive?(props.C.accent+"22"):"transparent",
              border:"1px solid "+(isActive?props.C.accent:"var(--border)"),
              color:isActive?props.C.accent:"var(--muted)",
              borderRadius:4,
              cursor:"pointer",
              fontSize:11
            }
          },isActive?"Active":"Set Active"),
          h("button",{
            title:"Fit this pane vertically to the traces visible in it.",
            onClick:function(ev){
              ev.stopPropagation();
              if(props.fitPane)props.fitPane(paneId);
            },
            style:{
              padding:"4px 8px",
              background:"transparent",
              border:"1px solid var(--border)",
              color:props.C.accent,
              borderRadius:4,
              cursor:"pointer",
              fontSize:11
            }
          },"Fit Pane"),
          h("button",{
            title:"Move the currently selected trace into this pane.",
            onClick:function(ev){
              ev.stopPropagation();
              if(props.selectedTraceName&&props.moveSelectedTraceToPane)props.moveSelectedTraceToPane(paneId);
            },
            disabled:!props.selectedTraceName||resolveTracePaneId(props,props.selectedTraceName)===paneId,
            style:{
              padding:"4px 8px",
              background:"transparent",
              border:"1px solid var(--border)",
              color:"var(--muted)",
              borderRadius:4,
              cursor:!props.selectedTraceName?"not-allowed":"pointer",
              fontSize:11,
              opacity:(!props.selectedTraceName||resolveTracePaneId(props,props.selectedTraceName)===paneId)?0.55:1
            }
          },"Move Selected Here"),
          props.panes&&props.panes.length>1?h("button",{
            title:"Clear all traces from this pane and reset its vertical zoom.",
            onClick:function(ev){
              ev.stopPropagation();
              if(props.clearPane)props.clearPane(paneId);
              if(props.resetYZ)props.resetYZ(paneId);
            },
            disabled:(model.traces||[]).length===0,
            style:{
              padding:"4px 8px",
              background:"transparent",
              border:"1px solid var(--border)",
              color:"var(--muted)",
              borderRadius:4,
              cursor:(model.traces||[]).length===0?"not-allowed":"pointer",
              fontSize:11,
              opacity:(model.traces||[]).length===0?0.55:1
            }
          },"Clear Pane"):null
        )
      )
    );
  }

  function renderPaneModel(props,model){
    var paneId=model.pane.id;
    var isActive=paneId===props.activePaneId;
    var paneData=model.cData||[];
    var paneFDiv=model.fDiv||1;
    var paneTickDp=model.tickDp||0;
    var paneAxisInfo=model.axisInfo||null;
    var paneYBase=model.paneYZoom||model.autoYDomain;
    var paneYDomain=paneYBase?[paneYBase.min,paneYBase.max]:["auto","auto"];
    var paneYTicks=paneYBase?makeYTicksFromDomain(paneYBase):undefined;

    if(isActive&&props.chartDomainRef)props.chartDomainRef.current=paneYBase||null;

    var paneXTicks=paneData.length?makeNiceTicks({min:paneData[0].fs,max:paneData[paneData.length-1].fs},11):undefined;
    var paneXDomain=paneData.length?[paneData[0].fs,paneData[paneData.length-1].fs]:[0,1];
    var paneXTickCount=paneXTicks&&paneXTicks.length?paneXTicks.length:0;
    var paneYTickCount=paneYTicks&&paneYTicks.length?paneYTicks.length:0;

    function renderPaneXAxisTick(tickProps){
      var idx=tickProps.index||0;
      var isFirst=idx===0;
      var isLast=idx===paneXTickCount-1;
      var tickX=isFirst?Math.max(tickProps.x,CHART_PLOT_LEFT+8):(isLast?tickProps.x-4:tickProps.x);
      return h("text",{
        x:tickX,
        y:tickProps.y+1,
        fill:props.C.muted,
        fontSize:12,
        fontFamily:"inherit",
        fontWeight:400,
        textAnchor:isFirst?"start":(isLast?"end":"middle"),
        dominantBaseline:"hanging"
      },Number(tickProps.payload.value).toFixed(paneTickDp));
    }

    function renderPaneYAxisTick(tickProps){
      var idx=tickProps.index||0;
      var isFirst=idx===0;
      var isLast=idx===paneYTickCount-1;
      return h("text",{
        x:(tickProps.x!=null?tickProps.x:CHART_PLOT_LEFT)-4,
        y:tickProps.y+(isFirst?1:(isLast?-4:0)),
        fill:props.C.muted,
        fontSize:12,
        fontFamily:"inherit",
        fontWeight:400,
        textAnchor:"end",
        dominantBaseline:"central"
      },Number(tickProps.payload.value).toFixed(2));
    }

    var lines=[];
    (model.traces||[]).forEach(function(tr,i){
      if(!tr||!props.vis||!props.vis[tr.name])return;
      var stroke=(props.traceColorMap&&props.traceColorMap[tr.name])||props.C.tr[i%props.C.tr.length];
      lines.push(h(Line,{
        key:tr.name,
        type:"linear",
        dataKey:tr.name,
        name:tr.dn||tr.name,
        stroke:stroke,
        strokeWidth:1.3,
        dot:props.showDots?{r:1.5,fill:stroke}:false,
        activeDot:props.showDots?{r:3}:{r:2},
        isAnimationActive:false,
        connectNulls:true
      }));
    });

    var markerMinX=paneData.length?paneData[0].freq:-Infinity;
    var markerMaxX=paneData.length?paneData[paneData.length-1].freq:Infinity;
    var markers=(props.markers||[]).map(function(m,i){
      if(!m)return null;
      if(resolveTracePaneId(props,m.trace)!==paneId)return null;
      if(!isFinite(m.freq)||!isFinite(m.amp)||m.freq<markerMinX||m.freq>markerMaxX)return null;
      var selected=i===props.selectedMkrIdx;
      var col=(m.trace&&props.traceColorMap&&props.traceColorMap[m.trace])||(m.label?props.C.ip3C:((props.mcMap&&props.mcMap[m.type])||props.C.accent));
      return h(ReferenceDot,{
        key:"m-"+paneId+"-"+i,
        x:m.freq/paneFDiv,
        y:m.amp,
        r:selected?5:4,
        fill:col,
        stroke:"#fff",
        strokeWidth:selected?2:1,
        ifOverflow:"hidden",
        label:{
          value:(selected?"[":"")+(m.label||("M"+(i+1)))+(selected?"]":""),
          position:"top",
          offset:8,
          fill:col,
          fontSize:selected?11:10,
          fontWeight:selected?700:400
        },
        onMouseDown:function(ev){
          if(ev&&ev.stopPropagation)ev.stopPropagation();
        },
        onClick:function(ev){
          if(ev&&ev.stopPropagation)ev.stopPropagation();
          if(props.setActivePaneId)props.setActivePaneId(paneId);
          if(props.setSelectedRefLineId)props.setSelectedRefLineId(null);
          if(props.setSelectedMkrIdx)props.setSelectedMkrIdx(i);
        }
      });
    });

    var paneRefLines=(props.refLines||[]).filter(function(rl){
      return rl&&(!rl.paneId||rl.paneId===paneId);
    });

    var refLineEls=paneRefLines.map(function(rl){
      if(rl.type==="v"){
        return h(ReferenceLine,{
          key:"rl-"+paneId+"-"+rl.id,
          x:rl.value/paneFDiv,
          stroke:props.C.refV,
          strokeWidth:props.selectedRefLineId===rl.id?2.5:1.5,
          strokeDasharray:"8 4",
          label:{value:rl.label,position:"insideTopRight",fill:props.C.refV,fontSize:10},
          ifOverflow:"extendDomain",
          onMouseDown:isActive?function(ev){
            if(ev&&ev.stopPropagation)ev.stopPropagation();
            if(props.setSelectedMkrIdx)props.setSelectedMkrIdx(null);
            if(props.setSelectedRefLineId)props.setSelectedRefLineId(rl.id);
            if(props.dragRefLineRef)props.dragRefLineRef.current={id:rl.id,type:"v",groupId:rl.groupId||null};
          }:undefined,
          onClick:function(ev){
            if(ev&&ev.stopPropagation)ev.stopPropagation();
            if(props.setActivePaneId)props.setActivePaneId(paneId);
            if(props.setSelectedMkrIdx)props.setSelectedMkrIdx(null);
            if(props.setSelectedRefLineId)props.setSelectedRefLineId(rl.id);
          }
        });
      }
      return h(ReferenceLine,{
        key:"rl-"+paneId+"-"+rl.id,
        y:rl.value,
        stroke:props.C.refH,
        strokeWidth:props.selectedRefLineId===rl.id?2.5:1.5,
        strokeDasharray:"8 4",
        label:{value:rl.label,position:"insideTopRight",fill:props.C.refH,fontSize:10},
        ifOverflow:"extendDomain",
        onMouseDown:isActive?function(ev){
          if(ev&&ev.stopPropagation)ev.stopPropagation();
          if(props.setSelectedMkrIdx)props.setSelectedMkrIdx(null);
          if(props.setSelectedRefLineId)props.setSelectedRefLineId(rl.id);
          if(props.dragRefLineRef)props.dragRefLineRef.current={id:rl.id,type:"h",groupId:rl.groupId||null};
        }:undefined,
        onClick:function(ev){
          if(ev&&ev.stopPropagation)ev.stopPropagation();
          if(props.setActivePaneId)props.setActivePaneId(paneId);
          if(props.setSelectedMkrIdx)props.setSelectedMkrIdx(null);
          if(props.setSelectedRefLineId)props.setSelectedRefLineId(rl.id);
        }
      });
    });

    var crossLine=isActive&&props.hoverX!==null&&props.hoverX!==undefined?h(ReferenceLine,{
      key:"cross-"+paneId,
      x:props.hoverX/paneFDiv,
      stroke:props.C.cross,
      strokeWidth:1,
      strokeDasharray:"2 2"
    }):null;

    var dragOverlay=renderDragOverlay({
      isActive:isActive,
      selA:props.selA,
      selB:props.selB,
      getXDomainHz:props.getXDomainHz,
      chartRef:props.chartRef,
      paneFDiv:paneFDiv
    });

    var crosshairBox=isActive?renderCrosshairReadout(props.hoverData,props.hoverX):null;
    var paneDropActive=props.dragTraceName!==null&&props.dragTraceName!==undefined&&resolveTracePaneId(props,props.dragTraceName)!==paneId;
    var activeTarget=(model.paneActiveTraceName?resolveTraceByName(props,model.paneActiveTraceName):null)||(model.traces||[]).find(function(tr){ return props.vis&&props.vis[tr.name]; })||(model.traces&&model.traces[0])||null;
    var paneTargetUnit=activeTarget?getEffectiveTraceYUnit(activeTarget):"";
    var paneXLabel=(paneAxisInfo&&paneAxisInfo.xLabel)||("Frequency ("+(model.fUnit||"Hz")+")");
    var paneYLabel=(paneAxisInfo&&paneAxisInfo.hasMixedYUnits)?"Amplitude":(paneTargetUnit?getYAxisTextForUnit(paneTargetUnit,activeTarget):((paneAxisInfo&&paneAxisInfo.yLabel)||"Amplitude"));
    var paneHeader=renderPaneHeader(Object.assign({},props,{model:model}));

    if(!paneData.length){
      return h("div",{key:paneId,style:{flex:1,display:"flex",flexDirection:"column",minHeight:0,borderTop:props.panes&&paneId!==(props.panes[0]&&props.panes[0].id)?"1px solid var(--border)":"none"}},
        paneHeader,
        h("div",{
          ref:isActive?props.chartRef:null,
          onClick:function(){ if(props.setActivePaneId)props.setActivePaneId(paneId); },
          onDragOver:function(ev){ ev.preventDefault(); },
          onDrop:function(ev){ if(props.onPaneDrop)props.onPaneDrop(paneId,ev); },
          style:{
            flex:1,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            padding:"12px",
            color:"var(--muted)",
            background:paneDropActive?(props.C.accent+"10"):"var(--bg)",
            outline:paneDropActive?("2px dashed "+props.C.accent):"none",
            outlineOffset:-6
          }
        },"No visible traces in this pane")
      );
    }

    return h("div",{key:paneId,style:{flex:1,display:"flex",flexDirection:"column",minHeight:0,borderTop:props.panes&&paneId!==(props.panes[0]&&props.panes[0].id)?"1px solid var(--border)":"none"}},
      h("div",{onDragOver:function(ev){ ev.preventDefault(); },onDrop:function(ev){ if(props.onPaneDrop)props.onPaneDrop(paneId,ev); }},paneHeader),
      h("div",{style:{flex:1,display:"grid",gridTemplateColumns:"18px 1fr",gridTemplateRows:"1fr auto",minHeight:0}},
        h("div",{style:{gridColumn:"1",gridRow:"1",display:"flex",alignItems:"center",justifyContent:"center",padding:"4px 0 0",minHeight:0}},
          h("div",{style:{writingMode:"vertical-rl",transform:"rotate(180deg)",fontSize:12,fontWeight:400,color:props.C.text,padding:"0",whiteSpace:"nowrap",lineHeight:1.2}},"Y: "+paneYLabel)
        ),
        h("div",{
          ref:isActive?props.chartRef:null,
          onContextMenu:function(ev){ ev.preventDefault(); },
          onMouseDownCapture:isActive?(props.handleChartMouseDownCapture||noop):function(){ if(props.setActivePaneId)props.setActivePaneId(paneId); },
          onMouseUpCapture:isActive?props.handleChartMouseUpCapture:undefined,
          onClick:!isActive?function(){ if(props.setActivePaneId)props.setActivePaneId(paneId); }:undefined,
          onDragOver:function(ev){ ev.preventDefault(); },
          onDrop:function(ev){ if(props.onPaneDrop)props.onPaneDrop(paneId,ev); },
          style:{
            gridColumn:"2",
            gridRow:"1",
            padding:"4px 8px 0 0",
            minHeight:0,
            position:"relative",
            background:paneDropActive?(props.C.accent+"06"):"transparent",
            outline:paneDropActive?("2px dashed "+props.C.accent):"none",
            outlineOffset:-8
          }
        },
          crosshairBox,
          dragOverlay,
          h(ResponsiveContainer,{width:"100%",height:"100%"},
            h(LineChart,{
              data:paneData,
              onClick:isActive?props.chartClick:undefined,
              onMouseDown:isActive?props.mDown:undefined,
              onMouseMove:isActive?props.chartMMWithDrag:undefined,
              onMouseUp:isActive?props.mUp:undefined,
              onMouseLeave:isActive?props.chartML:undefined,
              margin:{top:CHART_MARGIN_TOP,right:CHART_MARGIN_RIGHT,bottom:CHART_MARGIN_BOTTOM,left:CHART_MARGIN_LEFT}
            },
              h(CartesianGrid,{
                strokeDasharray:"4 4",
                stroke:(props.C&&props.C.grid)||"rgba(127,127,127,0.18)",
                strokeWidth:1,
                strokeOpacity:1,
                horizontal:true,
                vertical:true
              }),
              h(XAxis,{
                dataKey:"fs",
                type:"number",
                scale:"linear",
                domain:paneXDomain,
                allowDataOverflow:true,
                padding:{left:0,right:0},
                ticks:paneXTicks,
                stroke:props.C.muted,
                fontSize:12,
                tick:renderPaneXAxisTick,
                tickLine:false,
                tickMargin:0,
                tickSize:0,
                interval:"preserveStartEnd",
                height:22
              }),
              h(YAxis,{
                stroke:props.C.muted,
                fontSize:12,
                domain:paneYDomain,
                ticks:paneYTicks,
                allowDataOverflow:true,
                width:CHART_Y_AXIS_WIDTH,
                tick:renderPaneYAxisTick,
                tickLine:false,
                tickMargin:0,
                tickSize:0,
                tickFormatter:function(v){ return Number(v).toFixed(2); }
              }),
              h(Tooltip,{content:function(){ return null; }}),
              lines,
              h(ReferenceLine,{key:"zero-"+paneId,y:0,stroke:"var(--muted)",strokeWidth:1,strokeDasharray:"6 4"}),
              markers,
              refLineEls,
              crossLine
            )
          )
        ),
        h("div",{style:{gridColumn:"2",gridRow:"2",display:"flex",justifyContent:"center",padding:"0"}},
          h("div",{style:{fontSize:12,fontWeight:400,color:props.C.text,padding:"0",whiteSpace:"nowrap",lineHeight:1.2}},"X: "+paneXLabel)
        )
      )
    );
  }

  function ChartWorkspace(props){
    if(typeof props.render==="function"&&!Array.isArray(props.paneModels)&&!props.allTr){
      return props.render();
    }
    var allTr=Array.isArray(props.allTr)?props.allTr:[];
    if(!allTr.some(function(tr){ return tr&&getTraceData(tr).length; })){
      return h(EmptyChartPane,{
        isDrag:props.isDrag,
        setIsDrag:props.setIsDrag,
        loadFiles:props.loadFiles,
        fileInputRef:props.fileInputRef
      });
    }
    return h("div",{ref:props.chartExportRef,style:{flex:1,display:"flex",flexDirection:"column",minHeight:0}},
      (props.paneModels||[]).map(function(model){
        return renderPaneModel(props,model);
      })
    );
  }

  global.AppChart={
    EmptyChartPane:EmptyChartPane,
    ChartWorkspace:ChartWorkspace
  };
})(window);
