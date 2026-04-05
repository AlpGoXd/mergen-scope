(function(global){
  var React=global.React;
  var RC=global.Recharts||{};
  var TM=global.TraceModel||{};
  var TH=global.TraceHelpers||{};
  var UH=global.UIHelpers||{};
  var PH=global.PaneHelpers||{};

  var h=React.createElement;
  var useState=React.useState;
  var useEffect=React.useEffect;
  var useRef=React.useRef;
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
  var formatScalarWithUnit=UH.formatScalarWithUnit||function(value,unit,opts){
    var n=Number(value);
    var digits=opts&&isFinite(Number(opts.digits))?Math.max(0,Math.floor(Number(opts.digits))):2;
    if(!isFinite(n))return "--";
    if(opts&&opts.valueOnly)return n.toFixed(digits);
    return unit?(n.toFixed(digits)+" "+unit):n.toFixed(digits);
  };
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

  function chooseTimeUnitForRange(domain){
    if(!domain||!isFinite(domain.min)||!isFinite(domain.max))return "s";
    var span=Math.abs((Number(domain.max)||0)-(Number(domain.min)||0));
    if(!(span>0))span=Math.max(Math.abs(Number(domain.min)||0),Math.abs(Number(domain.max)||0));
    if(span>=1)return "s";
    if(span>=1e-3)return "ms";
    if(span>=1e-6)return "us";
    if(span>=1e-9)return "ns";
    return "ps";
  }

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

  function cxAdd(a,b){ return {re:(a&&a.re||0)+(b&&b.re||0),im:(a&&a.im||0)+(b&&b.im||0)}; }
  function cxSub(a,b){ return {re:(a&&a.re||0)-(b&&b.re||0),im:(a&&a.im||0)-(b&&b.im||0)}; }
  function cxMul(a,b){ return {re:(a&&a.re||0)*(b&&b.re||0)-(a&&a.im||0)*(b&&b.im||0),im:(a&&a.re||0)*(b&&b.im||0)+(a&&a.im||0)*(b&&b.re||0)}; }
  function cxDiv(a,b){
    var bre=(b&&b.re||0), bim=(b&&b.im||0), denom=bre*bre+bim*bim;
    if(!denom||!isFinite(denom))return null;
    return {re:((a&&a.re||0)*bre+(a&&a.im||0)*bim)/denom,im:((a&&a.im||0)*bre-(a&&a.re||0)*bim)/denom};
  }

  function smithCoord(v){ return 50+(v*42); }

  function mirrorSmithCoord(v,mode){
    return mode==="smith-inverted"?100-v:v;
  }

  function getSmithDisplayCoords(re,im,mode){
    if(mode==="smith-inverted"){
      return {x:-re,y:im};
    }
    return {x:re,y:-im};
  }

  function applySmithDisplayMode(point,mode){
    if(!point)return null;
    var coords=getSmithDisplayCoords(point.re,point.im,mode);
    return Object.assign({},point,{x:coords.x,y:coords.y});
  }

  function readTouchstoneComplexCell(cell){
    if(!cell||typeof cell!=="object")return null;
    var re=cell.re!=null?Number(cell.re):(cell.real!=null?Number(cell.real):NaN);
    var im=cell.im!=null?Number(cell.im):(cell.imag!=null?Number(cell.imag):NaN);
    if(!isFinite(re)&&!isFinite(im))return null;
    return {re:isFinite(re)?re:0,im:isFinite(im)?im:0};
  }

  function parseSpiceFrequencyInput(rawValue){
    var text=String(rawValue==null?"":rawValue).trim();
    var match=text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zA-Z]*)/i);
    if(!match)return NaN;
    var base=Number(match[1]);
    if(!isFinite(base))return NaN;
    var suffix=(match[2]||"").toLowerCase();
    if(!suffix)return base;
    if(suffix.indexOf("t")==0)return base*1e12;
    if(suffix.indexOf("g")==0)return base*1e9;
    if(suffix.indexOf("meg")==0)return base*1e6;
    if(suffix.indexOf("m")==0)return base*1e6;
    if(suffix.indexOf("k")==0)return base*1e3;
    if(suffix.indexOf("u")==0)return base*1e-6;
    if(suffix.indexOf("n")==0)return base*1e-9;
    if(suffix.indexOf("p")==0)return base*1e-12;
    if(suffix.indexOf("f")==0)return base*1e-15;
    return base;
  }

  function parseCssColor(rgb){
    if(!rgb)return null;
    var s=String(rgb).trim();
    var hex=s.match(/^#([0-9a-f]{3,8})$/i);
    if(hex){
      var raw=hex[1];
      if(raw.length===3||raw.length===4)raw=raw.split("").map(function(ch){return ch+ch;}).join("");
      if(raw.length===6||raw.length===8){
        return {r:parseInt(raw.slice(0,2),16),g:parseInt(raw.slice(2,4),16),b:parseInt(raw.slice(4,6),16)};
      }
    }
    var m=s.match(/^rgba?\(([^)]+)\)$/i);
    if(m){
      var parts=m[1].split(",").map(function(v){return parseFloat(v.trim());});
      if(parts.length>=3&&isFinite(parts[0])&&isFinite(parts[1])&&isFinite(parts[2])){
        return {r:parts[0],g:parts[1],b:parts[2]};
      }
    }
    return null;
  }

  function isDarkTheme(){
    try{
      if(typeof document==="undefined")return true;
      var root=getComputedStyle(document.documentElement);
      var bg=root&&root.getPropertyValue?String(root.getPropertyValue("--bg")||"").trim():"";
      if(!bg&&document.body&&window.getComputedStyle)bg=String(getComputedStyle(document.body).backgroundColor||"").trim();
      var c=parseCssColor(bg);
      if(!c)return true;
      var lum=(0.2126*(c.r/255))+(0.7152*(c.g/255))+(0.0722*(c.b/255));
      return lum<0.5;
    }catch(_){
      return true;
    }
  }

  function interpolateSmithPoint(start,end,t,z0,mode){
    var re=(start.re||0)+(((end.re||0)-(start.re||0))*t);
    var im=(start.im||0)+(((end.im||0)-(start.im||0))*t);
    var s={re:re,im:im};
    var ratio=cxDiv(cxAdd({re:1,im:0},s),cxSub({re:1,im:0},s));
    var z=ratio?cxMul({re:z0,im:0},ratio):null;
    var coords=getSmithDisplayCoords(re,im,mode);
    return {
      freq:start.freq+((end.freq-start.freq)*t),
      x:coords.x,
      y:coords.y,
      re:re,
      im:im,
      magnitude:Math.hypot(re,im),
      phase:Math.atan2(im,re)*180/Math.PI,
      impedance:z
    };
  }

  function getSmithPlotPointsForTarget(target,mode,rangeHz){
    var touchstone=target&&target.touchstone||null;
    var samples=touchstone&&Array.isArray(touchstone.samples)?touchstone.samples:[];
    var rowRaw=touchstone&&isFinite(Number(touchstone.row))?Number(touchstone.row):null;
    var colRaw=touchstone&&isFinite(Number(touchstone.col))?Number(touchstone.col):null;
    var row=rowRaw==null?null:(rowRaw>=1?rowRaw-1:rowRaw);
    var col=colRaw==null?null:(colRaw>=1?colRaw-1:colRaw);
    var z0=50;
    if(Array.isArray(touchstone&&touchstone.referenceOhms)&&touchstone.referenceOhms.length&&isFinite(Number(touchstone.referenceOhms[0]))){
      z0=Number(touchstone.referenceOhms[0]);
    } else if(isFinite(Number(touchstone&&touchstone.referenceOhms))){
      z0=Number(touchstone.referenceOhms);
    }
    if(!samples.length||row==null||col==null)return [];
    return samples.map(function(sample){
      var matrix=sample&&sample.sMatrix;
      var cell=matrix&&matrix[row]&&matrix[row][col];
      var freq=Number(sample&&sample.freq);
      if(!isFinite(freq)||!cell)return null;
      if(rangeHz&&isFinite(rangeHz.left)&&isFinite(rangeHz.right)&&(freq<rangeHz.left||freq>rangeHz.right))return null;
      var complex=readTouchstoneComplexCell(cell);
      if(!complex)return null;
      var re=complex.re, im=complex.im;
      var s={re:re,im:im};
      var ratio=cxDiv(cxAdd({re:1,im:0},s),cxSub({re:1,im:0},s));
      var z=ratio?cxMul({re:z0,im:0},ratio):null;
      return applySmithDisplayMode({freq:freq,re:re,im:im,magnitude:Math.hypot(re,im),phase:Math.atan2(im,re)*180/Math.PI,impedance:z},mode);
    }).filter(Boolean).sort(function(a,b){ return a.freq-b.freq; });
  }

  function getSmithNearestPoint(points,svgPoint){
    var best=null;
    (points||[]).forEach(function(point,idx){
      var px=smithCoord(point.x), py=smithCoord(point.y);
      var dx=svgPoint.x-px, dy=svgPoint.y-py, dist2=dx*dx+dy*dy;
      if(!best||dist2<best.dist2)best={point:point,index:idx,dist2:dist2,x:px,y:py};
    });
    return best;
  }

  function projectSmithPointToPolyline(points,svgPoint,z0,mode){
    if(!points||points.length<2)return getSmithNearestPoint(points,svgPoint);
    var best=null;
    for(var i=0;i<points.length-1;i++){
      var start=points[i], end=points[i+1];
      var x1=smithCoord(start.x), y1=smithCoord(start.y), x2=smithCoord(end.x), y2=smithCoord(end.y);
      var dx=x2-x1, dy=y2-y1, len2=dx*dx+dy*dy;
      var t=len2>0?(((svgPoint.x-x1)*dx)+((svgPoint.y-y1)*dy))/len2:0;
      if(t<0)t=0;
      if(t>1)t=1;
      var px=x1+(dx*t), py=y1+(dy*t), ddx=svgPoint.x-px, ddy=svgPoint.y-py, dist2=ddx*ddx+ddy*ddy;
      if(!best||dist2<best.dist2)best={point:interpolateSmithPoint(start,end,t,z0||50,mode),index:i,dist2:dist2,x:px,y:py};
    }
    return best||getSmithNearestPoint(points,svgPoint);
  }

  function projectSmithPointAcrossSeries(series,svgPoint){
    var best=null;
    (series||[]).forEach(function(item){
      if(!item||!Array.isArray(item.points)||!item.points.length)return;
      var projected=projectSmithPointToPolyline(item.points,svgPoint,item.z0||50,item.mode||"smith");
      if(!projected)return;
      if(!best||projected.dist2<best.dist2){
        best={
          point:projected.point,
          traceName:item.traceName||null,
          dist2:projected.dist2,
          x:projected.x,
          y:projected.y
        };
      }
    });
    return best;
  }

  function getSmithPointAtFreq(points,freq,z0,mode){
    if(!points||!points.length||!isFinite(freq))return null;
    if(points.length===1)return points[0];
    if(freq<=points[0].freq)return interpolateSmithPoint(points[0],points[1],0,z0||50,mode);
    for(var i=0;i<points.length-1;i++){
      var a=points[i];
      var b=points[i+1];
      if(freq>=a.freq&&freq<=b.freq){
        var span=b.freq-a.freq;
        var t=span!==0?(freq-a.freq)/span:0;
        if(t<0)t=0;
        if(t>1)t=1;
        return interpolateSmithPoint(a,b,t,z0||50,mode);
      }
    }
    return interpolateSmithPoint(points[points.length-2],points[points.length-1],1,z0||50,mode);
  }

  function getSmithTraceArrowheads(points){
    var arrows=[], targets=[0.18,0.36,0.54,0.72,0.88];
    targets.forEach(function(tgt){
      var idx=Math.max(0,Math.floor((points.length-1)*tgt));
      for(var i=idx;i<points.length-1;i++){
        var a=points[i], b=points[i+1];
        var x1=smithCoord(a.x), y1=smithCoord(a.y), x2=smithCoord(b.x), y2=smithCoord(b.y);
        var dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy);
        if(len<=1.0)continue;
        var ux=dx/len, uy=dy/len, bx=x1+(dx*0.5), by=y1+(dy*0.5);
        arrows.push({tip:{x:bx+ux*0.7,y:by+uy*0.7},left:{x:bx-ux*0.28-uy*0.22,y:by-uy*0.28+ux*0.22},right:{x:bx-ux*0.28+uy*0.22,y:by-uy*0.28-ux*0.22}});
        break;
      }
    });
    return arrows;
  }

  function renderSmithGrid(mode,color,clipId){
    var dark=isDarkTheme();
    var stroke=dark?"rgba(255,255,255,0.38)":"rgba(58,58,58,0.35)";
    var major=dark?"rgba(255,255,255,0.22)":"rgba(58,58,58,0.26)";
    var axis=dark?"rgba(255,255,255,0.30)":"rgba(58,58,58,0.34)";
    var outer=dark?"rgba(255,255,255,0.62)":"rgba(36,36,36,0.62)";
    var bgFill=mode==="smith-inverted"?(dark?"rgba(90,170,150,0.08)":"rgba(90,170,150,0.05)"):(dark?"rgba(90,140,190,0.08)":"rgba(90,140,190,0.05)");
    var gx=function(v){ return mirrorSmithCoord(v,mode); };
    var gy=function(v){ return mirrorSmithCoord(v,mode); };
    var els=[
      h("circle",{key:"bg",cx:String(gx(50)),cy:String(gy(50)),r:"42",fill:bgFill,stroke:"none"}),
      h("circle",{key:"outer",cx:String(gx(50)),cy:String(gy(50)),r:"42",fill:"none",stroke:outer,strokeWidth:dark?"0.32":"0.36"}),
      h("line",{key:"axis",x1:String(gx(8)),y1:String(gy(50)),x2:String(gx(92)),y2:String(gy(50)),stroke:axis,strokeWidth:dark?"0.22":"0.24"})
    ];
    [0,0.2,0.5,1,2,5].forEach(function(r,idx){ var cx=50+42*(r/(1+r)); var radius=42/(1+r); els.push(h("circle",{key:"r-"+idx,cx:String(gx(cx)),cy:String(gy(50)),r:String(radius),fill:"none",stroke:idx===3?major:stroke,strokeWidth:idx===3?"0.28":"0.18",strokeDasharray:idx===3?"":"2 4"})); });
    [0.2,0.5,1,2,5].forEach(function(x,idx){ var cyTop=50-(42*(1/x)); var cyBottom=50+(42*(1/x)); var radius=42/Math.abs(x); els.push(h("circle",{key:"xt-"+idx,cx:String(gx(95)),cy:String(gy(cyTop)),r:String(radius),fill:"none",stroke:stroke,strokeWidth:"0.18",strokeDasharray:"2 4",clipPath:"url(#"+clipId+")"})); els.push(h("circle",{key:"xb-"+idx,cx:String(gx(95)),cy:String(gy(cyBottom)),r:String(radius),fill:"none",stroke:stroke,strokeWidth:"0.18",strokeDasharray:"2 4",clipPath:"url(#"+clipId+")"})); });
    els.push(h("circle",{key:"center",cx:String(gx(50)),cy:String(gy(50)),r:"0.58",fill:dark?"rgba(255,255,255,0.40)":"rgba(0,0,0,0.42)"}));
    return els;
  }

  function SmithInteractiveFigure(props){
    var _hover=useState(null),hoverPoint=_hover[0],setHoverPoint=_hover[1];
    var _drag=useState(false),dragging=_drag[0],setDragging=_drag[1];
    var _moved=useState(false),dragMoved=_moved[0],setDragMoved=_moved[1];
    var svgRef=useRef(null);
    function getSvgPoint(ev){
      var rect=ev&&ev.currentTarget&&ev.currentTarget.getBoundingClientRect?ev.currentTarget.getBoundingClientRect():(svgRef.current&&svgRef.current.getBoundingClientRect?svgRef.current.getBoundingClientRect():null);
      if(!rect)return null;
      return {x:((ev.clientX-rect.left)/rect.width)*100,y:((ev.clientY-rect.top)/rect.height)*100};
    }
    function resolveProjected(ev){
      var svgPoint=getSvgPoint(ev);
      if(!svgPoint||!(props.series||[]).length)return null;
      return projectSmithPointAcrossSeries(props.series,svgPoint);
    }
    function emitHoverInfo(nearest){
      if(!props.onHoverPoint)return;
      props.onHoverPoint(nearest&&nearest.point?{freq:nearest.point.freq,magnitude:nearest.point.magnitude,phase:nearest.point.phase,impedance:nearest.point.impedance,traceName:nearest.traceName||null}:null);
    }
    useEffect(function(){
      if(typeof window==="undefined")return function(){};
      function onMove(ev){
        if(!dragging||!props.onDragPoint||((ev.buttons!==undefined)&&!(ev.buttons&1)))return;
        var nearest=resolveProjected(ev);
        if(!nearest||!nearest.point)return;
        setHoverPoint(nearest);
        setDragMoved(true);
        emitHoverInfo(nearest);
        props.onDragPoint(nearest);
      }
      function onUp(){ setDragging(false); }
      window.addEventListener("mousemove",onMove);
      window.addEventListener("mouseup",onUp);
      return function(){ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
    },[dragging,props.onDragPoint,props.onHoverPoint]);
    return h("svg",{ref:svgRef,viewBox:"0 0 100 100","data-chart-type":"smith",onContextMenu:function(ev){ if(ev&&ev.preventDefault)ev.preventDefault(); },onMouseDown:function(ev){
      if(ev.button!==0)return;
      var nearest=resolveProjected(ev);
      setHoverPoint(nearest);
      emitHoverInfo(nearest);
      setDragMoved(false);
      if(props.canDragSelectedMarker&&nearest&&props.onDragPoint){
        setDragging(true);
        if(ev.preventDefault)ev.preventDefault();
      }
    },onMouseMove:function(ev){
      if(rightBox&&rightBox.active){
        var projectedBox=resolveProjected(ev);
        var pointer=getSvgPoint(ev);
        setRightBox(function(prev){
          if(!prev||!prev.active)return prev;
          var nextFreq=projectedBox&&projectedBox.point&&isFinite(projectedBox.point.freq)?projectedBox.point.freq:prev.endFreq;
          var nextX=pointer&&isFinite(pointer.x)?pointer.x:prev.endX;
          var nextY=pointer&&isFinite(pointer.y)?pointer.y:prev.endY;
          return Object.assign({},prev,{endFreq:nextFreq,endX:nextX,endY:nextY});
        });
        return;
      }
      var projected=resolveProjected(ev);
      var nearest=dragging?projected:projected;
      if(!dragging&&projected&&projected.dist2>25)nearest=null;
      setHoverPoint(nearest);
      if(!dragging)emitHoverInfo(nearest);
      if(dragging&&nearest&&props.onDragPoint){
        setDragMoved(true);
        props.onDragPoint(nearest);
      }
    },onMouseLeave:function(){ setHoverPoint(null); if(!dragging)emitHoverInfo(null); },onClick:function(ev){ if(dragMoved)return; if(props.onClick)props.onClick(ev,resolveProjected(ev)); },style:{width:"100%",height:"100%",maxWidth:"760px",maxHeight:"760px",overflow:"hidden",filter:"drop-shadow(0 12px 24px rgba(0,0,0,0.16))",cursor:(props.series||[]).length?"crosshair":"default"}},props.render(hoverPoint));
  }

  function renderSmithPaneModel(props,model,paneHeader,paneDropActive){
    var paneId=model.pane.id;
    var smithTargets=Array.isArray(model.smithTargets)?model.smithTargets:[];
    var seriesByTrace={};
    var smithMode=model.renderMode;
    var smithSeries=smithTargets.map(function(target,idx){
      var trace=target&&target.trace||null;
      var ref=target&&target.touchstone&&target.touchstone.referenceOhms;
      var z0=50;
      if(Array.isArray(ref)&&ref.length&&isFinite(Number(ref[0])))z0=Number(ref[0]);
      else if(isFinite(Number(ref)))z0=Number(ref);
      var stroke=(trace&&props.traceColorMap&&props.traceColorMap[trace.name])||(props.C.tr&&props.C.tr.length?props.C.tr[idx%props.C.tr.length]:props.C.accent);
      var points=getSmithPlotPointsForTarget(target,smithMode,model.paneZoom||null);
      var path=(points||[]).map(function(point){ return smithCoord(point.x).toFixed(3)+","+smithCoord(point.y).toFixed(3); }).join(" ");
      var arrowheads=getSmithTraceArrowheads(points);
      var entry={target:target,trace:trace,traceName:trace&&trace.name?trace.name:null,stroke:stroke,z0:z0,points:points,path:path,arrowheads:arrowheads,mode:smithMode};
      if(entry.traceName)seriesByTrace[entry.traceName]=entry;
      return entry;
    }).filter(function(item){return item&&item.traceName&&item.points&&item.points.length;});
    var primarySeries=smithSeries[0]||null;
    var trace=primarySeries&&primarySeries.trace||null;
    var stroke=primarySeries&&primarySeries.stroke||((props.C.tr&&props.C.tr[0])||props.C.accent);
    var clipId="smith-clip-"+paneId;
    var description=smithSeries.length?(smithSeries.length+" trace"+(smithSeries.length===1?"":"s")):"No Smith target";
    var modeLabel=model.renderMode==="smith-inverted"?"Inverted Smith":"Smith";
    var startPoint=primarySeries&&primarySeries.points.length?primarySeries.points[0]:null;
    var endPoint=primarySeries&&primarySeries.points.length?primarySeries.points[primarySeries.points.length-1]:null;
    var startX=startPoint?smithCoord(startPoint.x):null;
    var startY=startPoint?smithCoord(startPoint.y):null;
    var endX=endPoint?smithCoord(endPoint.x):null;
    var endY=endPoint?smithCoord(endPoint.y):null;
    var freqSummary=(startPoint&&endPoint)?(fmtF(startPoint.freq,true)+" -> "+fmtF(endPoint.freq,true)):"";
    var paneZoom=model&&model.paneZoom||null;
    var smithRangeLeft=paneZoom&&isFinite(paneZoom.left)?paneZoom.left:null;
    var smithRangeRight=paneZoom&&isFinite(paneZoom.right)?paneZoom.right:null;
    var fullSmithMinFreq=Infinity;
    var fullSmithMaxFreq=-Infinity;
    smithSeries.forEach(function(series){
      (series.points||[]).forEach(function(point){
        if(!point||!isFinite(point.freq))return;
        if(point.freq<fullSmithMinFreq)fullSmithMinFreq=point.freq;
        if(point.freq>fullSmithMaxFreq)fullSmithMaxFreq=point.freq;
      });
    });
    var selectedMarkerRecord=(props.markers||[])[props.selectedMkrIdx];
    var canDragSelectedMarker=!!(selectedMarkerRecord&&selectedMarkerRecord.trace&&seriesByTrace[selectedMarkerRecord.trace]);
    var smithMarkers=(props.markers||[]).map(function(marker,idx){
      if(!marker||!marker.trace||!seriesByTrace[marker.trace])return null;
      var markerSeries=seriesByTrace[marker.trace];
      var selected=idx===props.selectedMkrIdx;
      var projected=getSmithPointAtFreq(markerSeries.points,marker.freq,markerSeries.z0,smithMode);
      if(!projected)return null;
      return {key:"sm-"+idx,x:smithCoord(projected.x),y:smithCoord(projected.y),color:selected?"#fff":markerSeries.stroke,ring:markerSeries.stroke,selected:selected,label:marker.label||("M"+(idx+1)),index:idx};
    }).filter(Boolean);
    function onSmithSvgClick(ev,nearest){
      if(!smithSeries.length||!props.chartClick||!nearest||!nearest.point)return;
      if(props.setActivePaneId)props.setActivePaneId(paneId);
      if(nearest.traceName&&props.selectTrace)props.selectTrace(nearest.traceName);
      var payload={freq:nearest.point.freq};
      if(nearest.traceName)payload[nearest.traceName]=0;
      props.chartClick({activePayload:[{payload:payload}],ctrlKey:true,button:0});
    }
    return h("div",{key:paneId,style:{flex:1,display:"flex",flexDirection:"column",minHeight:0,borderTop:props.panes&&paneId!==(props.panes[0]&&props.panes[0].id)?"1px solid var(--border)":"none"}},
      h("div",{onDragOver:function(ev){ ev.preventDefault(); },onDrop:function(ev){ if(props.onPaneDrop)props.onPaneDrop(paneId,ev); }},paneHeader),
      h("div",{style:{flex:1,padding:"10px 12px 12px",background:paneDropActive?(props.C.accent+"06"):"transparent",outline:paneDropActive?("2px dashed "+props.C.accent):"none",outlineOffset:-8,display:"flex",flexDirection:"column",gap:6,minHeight:0}},
        h("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"2px 4px 0"}},
          h("span",{style:{fontSize:11,fontWeight:700,color:stroke}},modeLabel),
          h("span",{style:{fontSize:11,color:"var(--muted)"}},description),
          freqSummary?h("span",{style:{fontSize:10,color:"var(--dim)",marginLeft:"auto"}},freqSummary):null
        ),
        h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",padding:"0 4px"}},
          h("span",{style:{fontSize:10,color:"var(--dim)",fontWeight:700}},"X Range (Hz)"),
          h("input",{id:"smith-range-left-"+paneId,defaultValue:smithRangeLeft!=null?String(smithRangeLeft):"",placeholder:"Start (e.g. 1g)",type:"text",style:{width:140,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"2px 6px"}}),
          h("input",{id:"smith-range-right-"+paneId,defaultValue:smithRangeRight!=null?String(smithRangeRight):"",placeholder:"Stop (e.g. 2.4g)",type:"text",style:{width:140,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:10,padding:"2px 6px"}}),
          h("button",{title:"Apply Smith X frequency range for this pane.",onClick:function(){
            if(!props.setPaneSmithRange)return;
            var leftEl=typeof document!=="undefined"?document.getElementById("smith-range-left-"+paneId):null;
            var rightEl=typeof document!=="undefined"?document.getElementById("smith-range-right-"+paneId):null;
            var left=leftEl?parseSpiceFrequencyInput(leftEl.value):NaN;
            var right=rightEl?parseSpiceFrequencyInput(rightEl.value):NaN;
            if(!isFinite(left)||!isFinite(right)||right<=left)return;
            props.setPaneSmithRange(paneId,left,right);
          },style:{padding:"2px 8px",background:"transparent",border:"1px solid var(--border)",color:"var(--text)",borderRadius:4,cursor:"pointer",fontSize:10}},"Apply"),
          h("button",{title:"Reset Smith X frequency range for this pane.",onClick:function(){if(props.clearPaneSmithRange)props.clearPaneSmithRange(paneId);},style:{padding:"2px 8px",background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:4,cursor:"pointer",fontSize:10}},"Reset")
        ),
        h("div",{style:{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center"}},
          h(SmithInteractiveFigure,{series:smithSeries,canDragSelectedMarker:canDragSelectedMarker,onDragPoint:function(nearest){ if(nearest&&nearest.point&&props.onSmithMoveSelectedMarker&&nearest.traceName)props.onSmithMoveSelectedMarker(nearest.traceName,nearest.point); },onClick:onSmithSvgClick,render:function(){
            return [
              h("defs",null,h("clipPath",{id:clipId},h("circle",{cx:"50",cy:"50",r:"42"}))),
              h("rect",{x:"0",y:"0",width:"100",height:"100",fill:"transparent"}),
              h("g",{clipPath:"url(#"+clipId+")"},
                renderSmithGrid(model.renderMode,props.C.grid,clipId),
                smithSeries.map(function(series){
                  return series.path?h("polyline",{key:"sp-"+series.traceName,points:series.path,fill:"none",stroke:series.stroke,strokeWidth:"0.10",strokeLinejoin:"round",strokeLinecap:"round"}):null;
                }),
                smithSeries.map(function(series){
                  return (series.arrowheads||[]).map(function(arrow,idx){
                    return h("polygon",{key:"ah-"+series.traceName+"-"+idx,points:[arrow.tip,arrow.left,arrow.right].map(function(pt){return pt.x.toFixed(3)+","+pt.y.toFixed(3);}).join(" "),fill:"#ffffff",fillOpacity:"0.95",stroke:series.stroke,strokeWidth:"0.08"});
                  });
                }),
                startPoint?h("circle",{cx:String(startX),cy:String(startY),r:"0.50",fill:"rgba(255,255,255,0.82)",stroke:stroke,strokeWidth:"0.18"}):null,
                endPoint?h("circle",{cx:String(endX),cy:String(endY),r:"0.68",fill:stroke,stroke:"rgba(255,255,255,0.9)",strokeWidth:"0.22"}):null,
                endPoint?h("text",{x:String(endX+1.1),y:String(endY-0.8),fill:"rgba(255,255,255,0.55)",fontSize:"1.7",fontFamily:"inherit"},"End"):null,
                smithMarkers.map(function(marker){ return h("g",{key:marker.key,onClick:function(ev){ if(ev&&ev.stopPropagation)ev.stopPropagation(); if(props.setActivePaneId)props.setActivePaneId(paneId); if(props.setSelectedRefLineId)props.setSelectedRefLineId(null); if(props.setSelectedMkrIdx)props.setSelectedMkrIdx(marker.index); },style:{cursor:"pointer"}},h("circle",{cx:String(marker.x),cy:String(marker.y),r:marker.selected?"0.62":"0.50",fill:marker.selected?marker.ring:"rgba(255,255,255,0.95)",stroke:marker.ring,strokeWidth:marker.selected?"0.18":"0.14"}),h("text",{x:String(marker.x+0.8),y:String(marker.y-0.6),fill:marker.ring,fontSize:"1.6",fontFamily:"inherit",fontWeight:marker.selected?700:500},marker.label)); })
              )
            ];
          }})
        ),
        h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"0 4px",fontSize:10,color:"var(--dim)"}},
          h("span",null,startPoint?"Start: "+fmtF(startPoint.freq,true):""),
          h("span",null,model.renderMode==="smith-inverted"?"Admittance grid":"Impedance grid"),
          h("span",null,endPoint?"End: "+fmtF(endPoint.freq,true):"")
        )
      )
    );
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
    var paneDropActive=props.dragTraceName!==null&&props.dragTraceName!==undefined&&resolveTracePaneId(props,props.dragTraceName)!==paneId;
    var paneHeader=renderPaneHeader(Object.assign({},props,{model:model}));
    if((model.renderMode==="smith"||model.renderMode==="smith-inverted")&&Array.isArray(model.smithTargets)&&model.smithTargets.length){
      return renderSmithPaneModel(props,model,paneHeader,paneDropActive);
    }
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
    var paneTargetUnit=(paneAxisInfo&&paneAxisInfo.hasMixedYUnits)?"":(((model.axisInfo&&model.axisInfo.yUnit)||"").trim()||"");
    var paneTimeTickUnit=(paneTargetUnit&&String(paneTargetUnit).toLowerCase()==="s")?chooseTimeUnitForRange(paneYBase):null;

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
      var tickUnit=(paneAxisInfo&&paneAxisInfo.hasMixedYUnits)?"":(paneTargetUnit||"");
      return h("text",{
        x:(tickProps.x!=null?tickProps.x:CHART_PLOT_LEFT)-4,
        y:tickProps.y+(isFirst?1:(isLast?-4:0)),
        fill:props.C.muted,
        fontSize:12,
        fontFamily:"inherit",
        fontWeight:400,
        textAnchor:"end",
        dominantBaseline:"central"
      },formatScalarWithUnit(Number(tickProps.payload.value),tickUnit,{digits:2,preferredUnit:paneTimeTickUnit||undefined}));
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
    paneTargetUnit=activeTarget?getEffectiveTraceYUnit(activeTarget):paneTargetUnit;
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
                tickFormatter:function(v){
                  var tickUnit=(paneAxisInfo&&paneAxisInfo.hasMixedYUnits)?"":(paneTargetUnit||"");
                  return formatScalarWithUnit(Number(v),tickUnit,{digits:2,preferredUnit:paneTimeTickUnit||undefined});
                }
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
