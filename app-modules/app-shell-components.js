(function(global){
  var React=global.React;
  if(!React){
    global.AppShell={};
    return;
  }

  var h=React.createElement;
  var useState=React.useState;
  var useEffect=React.useEffect;
  var useRef=React.useRef;
  var UH=global.UIHelpers||{};
  var TH=global.TraceHelpers||{};
  var TM=global.TraceModel||{};
  var PH=global.ParserHelpers||{};

  var Sec=UH.Sec;
  var MR=UH.MR;
  var fmtF=UH.fmtF||function(v){return String(v);};
  var formatScalarWithUnit=UH.formatScalarWithUnit||function(value,unit,opts){
    var n=Number(value);
    var digits=opts&&isFinite(Number(opts.digits))?Math.max(0,Math.floor(Number(opts.digits))):3;
    if(!isFinite(n))return "--";
    if(opts&&opts.valueOnly)return n.toFixed(digits);
    return unit?(n.toFixed(digits)+" "+unit):n.toFixed(digits);
  };
  var getTraceLabel=TM.getTraceLabel||function(tr){return tr?(tr.dn||tr.name||""):"";};
  var isDerivedTrace=TM.isDerivedTrace||function(){return false;};
  var isTouchstoneTrace=TM.isTouchstoneTrace||function(){return false;};
  var getTouchstoneTraceFamily=TM.getTouchstoneTraceFamily||function(){return "";};
  var nearestPoint=PH.nearestPoint||function(){return null;};
  var findHorizontalCrossings=TH.findHorizontalCrossings||function(){return [];};
  var getVisibleTraceData=TH.getVisibleTraceData||function(tr){return tr&&Array.isArray(tr.data)?tr.data:[];};
  var sanitizeYDomain=TH.sanitizeYDomain||function(v){return v||null;};
  var getSafeYRangeFromData=TH.getSafeYRangeFromData||function(){return null;};
  var makeYTicksFromDomain=TH.makeYTicksFromDomain||function(){return null;};
  var makeNiceTicks=TH.makeNiceTicks||function(){return null;};
  var TOUCHSTONE_FAMILIES=["S","Y","Z"];
  var TOUCHSTONE_FAMILY_VIEWS={
    S:["dB","Mag","Phase","Real","Imag"],
    Y:["Mag","Phase","Real","Imag"],
    Z:["Mag","Phase","Real","Imag"]
  };

  function withAppProps(props){
    return props&&props.app?Object.assign({},props.app,props):props||{};
  }

  function colorWithAlpha(color, alpha){
    if(!color)return null;
    var s=String(color).trim();
    if(!s)return null;
    var a=Math.max(0,Math.min(1,alpha==null?1:alpha));
    var hex=s.match(/^#([0-9a-f]{3,8})$/i);
    if(hex){
      var raw=hex[1];
      if(raw.length===3||raw.length===4){
        raw=raw.split("").map(function(ch){return ch+ch;}).join("");
      }
      if(raw.length===6||raw.length===8){
        var r=parseInt(raw.slice(0,2),16);
        var g=parseInt(raw.slice(2,4),16);
        var b=parseInt(raw.slice(4,6),16);
        return "rgba("+r+","+g+","+b+","+a+")";
      }
    }
    var rgba=s.match(/^rgba?\(([^)]+)\)$/i);
    if(rgba){
      var parts=rgba[1].split(",").map(function(v){return v.trim();});
      if(parts.length>=3){
        return "rgba("+parseFloat(parts[0])+","+parseFloat(parts[1])+","+parseFloat(parts[2])+","+a+")";
      }
    }
    return null;
  }

  function featureCardFallback(props){
    var kids=[];
    if(props.title){
      kids.push(h("div",{key:"t",style:{fontSize:11,fontWeight:700,color:"var(--muted)",letterSpacing:0.4,textTransform:"uppercase",marginBottom:6}},props.title));
    }
    if(props.description){
      kids.push(h("div",{key:"d",style:{fontSize:11,color:"var(--muted)",marginBottom:8,lineHeight:1.5}},props.description));
    }
    if(props.children){
      if(Array.isArray(props.children))kids=kids.concat(props.children);
      else kids.push(props.children);
    }
    var tint=props.color||null;
    return h("div",{style:{marginBottom:10,padding:"8px 10px",border:"1px solid "+(tint?(colorWithAlpha(tint,0.28)||tint):"var(--border)"),borderRadius:8,background:tint?(colorWithAlpha(tint,0.06)||"var(--card)"):"var(--card)"}},kids);
  }

  function getFeatureCard(){
    return (global.AppAnalysis&&global.AppAnalysis.AnalysisFeatureCard)||featureCardFallback;
  }

  function isTouchstoneFile(file){
    if(!file)return false;
    if(file.format==="touchstone"||file.format==="touchstone-s-parameter"||file.touchstoneNetwork)return true;
    var name=String((file&&file.fileName)||(file&&file.file)||"").toLowerCase();
    return /\.s\d+p$/i.test(name);
  }

  function getTouchstonePortCount(file){
    var network=file&&file.touchstoneNetwork&&typeof file.touchstoneNetwork==="object"?file.touchstoneNetwork:null;
    var portCount=Number(network&&network.portCount!=null?network.portCount:null);
    if(isFinite(portCount)&&portCount>0)return Math.round(portCount);
    var name=String((file&&file.fileName)||(file&&file.file)||"").toLowerCase();
    var match=name.match(/\.s(\d+)p$/i);
    if(match){
      portCount=Number(match[1]);
      if(isFinite(portCount)&&portCount>0)return Math.round(portCount);
    }
    return 0;
  }

  function getTouchstoneDefaultView(family){
    return family==="S"?"dB":"Mag";
  }

  function getTouchstoneViewsForFamily(family){
    return TOUCHSTONE_FAMILY_VIEWS[family]||TOUCHSTONE_FAMILY_VIEWS.S;
  }

  function buildTouchstoneCellKey(row,col){
    return String(row)+":"+String(col);
  }

  function buildTouchstoneCellLabel(family,row,col){
    return String(family||"S")+String(row)+String(col);
  }

  function formatTouchstoneFamilyBadge(file){
    var count=getTouchstonePortCount(file);
    return count?("S"+count+"P"):"Touchstone";
  }

  function getTouchstoneSummaryRows(file){
    var network=file&&file.touchstoneNetwork&&typeof file.touchstoneNetwork==="object"?file.touchstoneNetwork:null;
    if(!network)return [];
    var rows=[];
    if(network.version!=null)rows.push({label:"Parsed Version",value:String(network.version)});
    if(network.parameterType)rows.push({label:"Parameter",value:String(network.parameterType).toUpperCase()});
    if(network.portCount!=null)rows.push({label:"Ports",value:String(network.portCount)});
    if(network.dataFormat)rows.push({label:"Format",value:String(network.dataFormat).toUpperCase()});
    if(network.freqUnit)rows.push({label:"Freq Unit",value:String(network.freqUnit)});
    if(network.matrixFormat)rows.push({label:"Matrix",value:String(network.matrixFormat).toUpperCase()});
    if(network.referenceOhms!=null){
      if(Array.isArray(network.referenceOhms))rows.push({label:"Z0 (normalized)",value:network.referenceOhms.join(", ")+" Ohm"});
      else rows.push({label:"Z0 (normalized)",value:String(network.referenceOhms)+" Ohm"});
    }
    if(Array.isArray(network.comments)&&network.comments.length)rows.push({label:"Comments",value:String(network.comments.length)});
    if(Array.isArray(network.samples)&&network.samples.length)rows.push({label:"Samples",value:String(network.samples.length)});
    return rows;
  }

  function getTouchstoneMarkerReadout(file,trace,freq){
    var network=trace&&trace.touchstoneNetwork&&typeof trace.touchstoneNetwork==="object"?trace.touchstoneNetwork:null;
    if(!network)network=file&&file.touchstoneNetwork&&typeof file.touchstoneNetwork==="object"?file.touchstoneNetwork:null;
    var source=trace&&trace.networkSource&&typeof trace.networkSource==="object"?trace.networkSource:null;
    if(!network||!source||!Array.isArray(network.samples)||!isFinite(freq))return null;
    var row=Number(source.row);
    var col=Number(source.col);
    if(!isFinite(row)||!isFinite(col)||row<1||col<1)return null;
    var ref=network.referenceOhms;
    var z0=50;
    if(Array.isArray(ref)&&ref.length&&isFinite(Number(ref[0])))z0=Number(ref[0]);
    else if(isFinite(Number(ref)))z0=Number(ref);
    function readComplexCell(cell){
      if(!cell||typeof cell!=="object")return null;
      var re=cell.re!=null?Number(cell.re):(cell.real!=null?Number(cell.real):NaN);
      var im=cell.im!=null?Number(cell.im):(cell.imag!=null?Number(cell.imag):NaN);
      if(!isFinite(re)&&!isFinite(im))return null;
      return {re:isFinite(re)?re:0,im:isFinite(im)?im:0};
    }
    var samples=network.samples;
    if(samples.length===1){
      var only=readComplexCell(samples[0]&&samples[0].sMatrix&&samples[0].sMatrix[row-1]&&samples[0].sMatrix[row-1][col-1]);
      if(!only)return null;
      var onlyMag=Math.hypot(only.re,only.im);
      var onlyPhase=Math.atan2(only.im,only.re)*180/Math.PI;
      var onlyDen=(1-only.re)*(1-only.re)+only.im*only.im;
      var onlyZ=onlyDen>0?{re:z0*(((1-only.re)*(1+only.re))+only.im*only.im)/onlyDen,im:z0*(2*only.im)/onlyDen}:null;
      return {freq:Number(samples[0].freq),re:only.re,im:only.im,mag:onlyMag,phase:onlyPhase,z:onlyZ};
    }
    function sampleAt(sample){
      var cell=sample&&sample.sMatrix&&sample.sMatrix[row-1]&&sample.sMatrix[row-1][col-1];
      var f=Number(sample&&sample.freq);
      var complex=readComplexCell(cell);
      if(!isFinite(f)||!complex)return null;
      return {freq:f,re:complex.re,im:complex.im};
    }
    var points=samples.map(sampleAt).filter(Boolean).sort(function(a,b){ return a.freq-b.freq; });
    if(!points.length)return null;
    if(freq<=points[0].freq||points.length===1){
      var p0=points[0];
      var mag0=Math.hypot(p0.re,p0.im);
      var phase0=Math.atan2(p0.im,p0.re)*180/Math.PI;
      var den0=(1-p0.re)*(1-p0.re)+p0.im*p0.im;
      var z0v=den0>0?{re:z0*(((1-p0.re)*(1+p0.re))+p0.im*p0.im)/den0,im:z0*(2*p0.im)/den0}:null;
      return {freq:p0.freq,re:p0.re,im:p0.im,mag:mag0,phase:phase0,z:z0v};
    }
    for(var i=0;i<points.length-1;i++){
      var a=points[i],b=points[i+1];
      if(freq<a.freq||freq>b.freq)continue;
      var span=b.freq-a.freq;
      var t=span!==0?(freq-a.freq)/span:0;
      if(t<0)t=0;
      if(t>1)t=1;
      var re=a.re+((b.re-a.re)*t);
      var im=a.im+((b.im-a.im)*t);
      var mag=Math.hypot(re,im);
      var phase=Math.atan2(im,re)*180/Math.PI;
      var den=(1-re)*(1-re)+im*im;
      var z=den>0?{re:z0*(((1-re)*(1+re))+im*im)/den,im:z0*(2*im)/den}:null;
      return {freq:a.freq+((b.freq-a.freq)*t),re:re,im:im,mag:mag,phase:phase,z:z};
    }
    var last=points[points.length-1];
    var magLast=Math.hypot(last.re,last.im);
    var phaseLast=Math.atan2(last.im,last.re)*180/Math.PI;
    var denLast=(1-last.re)*(1-last.re)+last.im*last.im;
    var zLast=denLast>0?{re:z0*(((1-last.re)*(1+last.re))+last.im*last.im)/denLast,im:z0*(2*last.im)/denLast}:null;
    return {freq:last.freq,re:last.re,im:last.im,mag:magLast,phase:phaseLast,z:zLast};
  }

  function SidebarPane(props){
    var p=withAppProps(props);
    if(typeof p.render==="function")return p.render();
    return h("div",{style:{width:260,background:"var(--card)",borderRight:"1px solid var(--border)",padding:12,overflowY:"auto",flexShrink:0}},p.children);
  }

  function RightPanelStack(props){
    var p=withAppProps(props);
    return h("div",{style:{width:320,background:"var(--card)",borderLeft:"1px solid var(--border)",padding:12,overflowY:"auto",flexShrink:0,display:"flex",flexDirection:"column",gap:10}},p.children);
  }

  function ChartPane(props){
    var p=withAppProps(props);
    if(typeof p.render==="function")return p.render();
    return p.children||null;
  }

  function TouchstoneMatrixPicker(props){
    var p=withAppProps(props);
    var file=p.file||null;
    var fileId=p.fileId!=null?p.fileId:(file&&file.id!=null?file.id:null);
    var portCount=p.portCount||getTouchstonePortCount(file);
    if(!file||!isTouchstoneFile(file)||!portCount)return null;

    var state=((p.touchstoneStateByFileId&&fileId!=null&&p.touchstoneStateByFileId[fileId])||p.touchstoneState||{})||{};
    var isExpanded=state.isExpanded!==false;
    var controlledFamily=state.activeFamily||null;
    var _family=useState(controlledFamily||"S");
    var draftFamily=_family[0],setDraftFamily=_family[1];
    var activeFamily=controlledFamily||draftFamily;
    var controlledViewByFamily=state.activeViewByFamily&&typeof state.activeViewByFamily==="object"?state.activeViewByFamily:null;
    var _viewByFamily=useState({});
    var draftViewByFamily=_viewByFamily[0],setDraftViewByFamily=_viewByFamily[1];
    var viewByFamily=controlledViewByFamily||draftViewByFamily||{};
    var controlledSelectionByFamily=state.selectedCellsByFamily&&typeof state.selectedCellsByFamily==="object"?state.selectedCellsByFamily:null;
    var _selectionByFamily=useState({});
    var draftSelectionByFamily=_selectionByFamily[0],setDraftSelectionByFamily=_selectionByFamily[1];
    var selectionByFamily=controlledSelectionByFamily||draftSelectionByFamily||{};
    var _pressCell=useState(null);
    var pressCell=_pressCell[0],setPressCell=_pressCell[1];
    var pressTimerRef=useRef(null);
    var activeView=viewByFamily[activeFamily]||getTouchstoneDefaultView(activeFamily);
    var familyViews=getTouchstoneViewsForFamily(activeFamily);
    var selectedCount=Object.keys(selectionByFamily).reduce(function(total,family){
      var cells=selectionByFamily[family]||{};
      return total+Object.keys(cells).reduce(function(sum,key){
        var views=Array.isArray(cells[key])?cells[key]:[cells[key]];
        return sum+views.filter(Boolean).length;
      },0);
    },0);

    function syncFamily(nextFamily){
      setDraftFamily(nextFamily);
      if(p.onSetActiveFamily)p.onSetActiveFamily(fileId,nextFamily,file);
    }

    function syncExpanded(nextExpanded){
      if(p.onSetExpanded)p.onSetExpanded(fileId,nextExpanded,file);
    }

    function syncView(nextView){
      setDraftViewByFamily(function(prev){
        var next=Object.assign({},prev||{});
        next[activeFamily]=nextView;
        return next;
      });
      if(p.onSetFamilyView)p.onSetFamilyView(fileId,activeFamily,nextView,file);
    }

    function syncSelection(nextSelections,preset){
      setDraftSelectionByFamily(nextSelections);
      if(p.onApplyPreset)p.onApplyPreset(fileId,preset||"custom",{file:file,activeFamily:activeFamily,activeView:activeView,selections:nextSelections});
    }

    function toggleCell(row,col){
      var key=buildTouchstoneCellKey(row,col);
      if(pressTimerRef.current)clearTimeout(pressTimerRef.current);
      setPressCell(key);
      pressTimerRef.current=setTimeout(function(){
        pressTimerRef.current=null;
        setPressCell(null);
      },180);
      setDraftSelectionByFamily(function(prev){
        var next=Object.assign({},prev||{});
        var family=Object.assign({},next[activeFamily]||{});
        family={};
        family[key]=[activeView];
        next[activeFamily]=family;
        if(p.onToggleCell)p.onToggleCell(fileId,activeFamily,row,col,activeView,file);
        return next;
      });
    }

    function buildPresetSelections(preset){
      var next={};
      var view=activeView||getTouchstoneDefaultView(activeFamily);
      if(preset==="clear")return next;
      next[activeFamily]={};
      if(preset==="all"){
        for(var r=1;r<=portCount;r++){
          for(var c=1;c<=portCount;c++){
            next[activeFamily][buildTouchstoneCellKey(r,c)]=[view];
          }
        }
        return next;
      }
      if(preset==="diagonal"){
        for(var d=1;d<=portCount;d++){
          next[activeFamily][buildTouchstoneCellKey(d,d)]=[view];
        }
        return next;
      }
      var defaults=[];
      if(activeFamily==="S"&&portCount===2){
        defaults=[{row:1,col:1,view:view},{row:2,col:1,view:view}];
      } else {
        for(var i=1;i<=portCount;i++){
          defaults.push({row:i,col:i,view:view});
        }
      }
      defaults.forEach(function(sel){
        next[activeFamily][buildTouchstoneCellKey(sel.row,sel.col)]=[sel.view];
      });
      return next;
    }

    function applyPreset(preset){
      var next=buildPresetSelections(preset);
      syncSelection(next,preset);
      if(preset==="clear"&&p.onClearFileViews)p.onClearFileViews(fileId,file);
    }

    useEffect(function(){
      return function(){
        if(pressTimerRef.current){
          clearTimeout(pressTimerRef.current);
          pressTimerRef.current=null;
        }
      };
    },[]);

    var familyTabs=TOUCHSTONE_FAMILIES.map(function(family){
      var active=activeFamily===family;
      return h("button",{
        key:family,
        onClick:function(){syncFamily(family);},
        title:"Switch to "+family+"-parameter selections.",
        style:{
          padding:"4px 8px",
          border:"1px solid "+(active?(p.C&&p.C.accent||"var(--accent)"):"var(--border)"),
          borderRadius:4,
          background:active?((p.C&&p.C.accent)||"var(--accent)")+"14":"var(--bg)",
          color:active?(p.C&&p.C.accent)||"var(--accent)":"var(--muted)",
          cursor:"pointer",
          fontSize:11,
          fontWeight:600
        }
      },family);
    });

    var viewButtons=familyViews.map(function(view){
      var active=activeView===view;
      return h("button",{
        key:view,
        onClick:function(){syncView(view);},
        title:"Use "+view+" view for "+activeFamily+"-parameter selections.",
        style:{
          padding:"3px 7px",
          border:"1px solid "+(active?(p.C&&p.C.accent||"var(--accent)"):"var(--border)"),
          borderRadius:4,
          background:active?((p.C&&p.C.accent)||"var(--accent)")+"14":"var(--bg)",
          color:active?(p.C&&p.C.accent)||"var(--accent)":"var(--muted)",
          cursor:"pointer",
          fontSize:10,
          fontWeight:600
        }
      },view);
    });

    var rows=[];
    rows.push(h("div",{key:"head",style:{display:"grid",gridTemplateColumns:"auto repeat("+portCount+", minmax(24px, 1fr))",gap:4,alignItems:"center",marginBottom:4}},
      h("span",{style:{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase"}},""),
      Array.from({length:portCount},function(_,idx){
        return h("span",{key:"c-"+idx,style:{fontSize:10,color:"var(--muted)",fontWeight:700,textAlign:"center"}},idx+1);
      })
    ));
    for(var r=1;r<=portCount;r++){
      var cellNodes=[h("span",{key:"r-"+r,style:{fontSize:10,color:"var(--muted)",fontWeight:700,textAlign:"center",paddingTop:3}},r)];
      for(var c=1;c<=portCount;c++){
        (function(row,col){
          var key=buildTouchstoneCellKey(row,col);
          var selected=false;
          var label=buildTouchstoneCellLabel(activeFamily,row,col);
          var isPressed=pressCell===key;
          cellNodes.push(h("button",{
            key:key,
            onClick:function(){toggleCell(row,col);},
            title:"Add "+label+" as "+activeView,
            style:{
              minHeight:24,
              padding:"2px 3px",
              border:"1px solid "+(selected?(p.C&&p.C.accent||"var(--accent)"):"var(--border)"),
              borderRadius:4,
              background:isPressed?((p.C&&p.C.accent)||"var(--accent)")+"2a":(selected?((p.C&&p.C.accent)||"var(--accent)")+"18":"var(--bg)"),
              color:selected?(p.C&&p.C.accent)||"var(--accent)":"var(--text)",
              cursor:"pointer",
              fontSize:10,
              lineHeight:1.1,
              textAlign:"center",
              whiteSpace:"nowrap",
              transform:isPressed?"scale(0.97)":"scale(1)",
              boxShadow:isPressed?"0 0 0 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,0.18)":"none",
              transition:"transform 120ms ease, background 120ms ease, box-shadow 120ms ease, border-color 120ms ease"
            }
          },h("div",{style:{fontWeight:700}},label),h("div",{style:{fontSize:9,color:selected?(p.C&&p.C.accent)||"var(--accent)":"var(--muted)" }},activeView)));
        })(r,c);
      }
      rows.push(h("div",{key:"row-"+r,style:{display:"grid",gridTemplateColumns:"auto repeat("+portCount+", minmax(24px, 1fr))",gap:4,alignItems:"stretch",marginBottom:4}},cellNodes));
    }

    return h("div",{style:{margin:"8px 0 10px",padding:"8px",border:"1px solid var(--border)",borderRadius:8,background:"var(--card)"}},
      h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:6,flexWrap:"wrap"}},
        h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
          h("span",{style:{fontSize:10,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",color:"var(--muted)"}},"Touchstone"),
          h("span",{style:{fontSize:10,fontWeight:700,color:"var(--text)",border:"1px solid var(--border)",borderRadius:999,padding:"1px 6px",lineHeight:1.2}},formatTouchstoneFamilyBadge(file)),
          h("span",{style:{fontSize:10,color:"var(--muted)"}},"Click a cell to add trace")
        ),
        h("div",{style:{display:"flex",gap:4,flexWrap:"wrap"}},
          h("button",{
            onClick:function(){syncExpanded(!isExpanded);},
            title:isExpanded?"Hide the Touchstone S/Y/Z selector for this file.":"Show the Touchstone S/Y/Z selector for this file.",
            style:{padding:"4px 8px",border:"1px solid var(--border)",borderRadius:4,background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:10}
          },isExpanded?"Hide":"Show"),
          isExpanded?h("div",{style:{display:"flex",gap:4,flexWrap:"wrap"}},familyTabs):null
        )
      ),
      !isExpanded?h("div",{style:{fontSize:10,color:"var(--muted)",lineHeight:1.4}},"Touchstone selector hidden for this file. Use Show to reopen it."):null,
      isExpanded?h("div",null,
      h("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}},
        h("span",{style:{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase"}},"View"),
        viewButtons
      ),
      h("div",{style:{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}},
        h("button",{onClick:function(){applyPreset("default");},title:"Apply the default selection for this file and family.",style:{padding:"4px 8px",border:"1px solid var(--border)",borderRadius:4,background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:10}},"Default"),
        h("button",{onClick:function(){applyPreset("diagonal");},title:"Select diagonal cells for this family.",style:{padding:"4px 8px",border:"1px solid var(--border)",borderRadius:4,background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:10}},"Diagonal"),
        h("button",{onClick:function(){applyPreset("all");},title:"Select every Sij/Yij/Zij cell for this family.",style:{padding:"4px 8px",border:"1px solid var(--border)",borderRadius:4,background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:10}},"All"),
        h("button",{onClick:function(){applyPreset("clear");},title:"Clear every matrix selection for this file.",style:{padding:"4px 8px",border:"1px solid var(--border)",borderRadius:4,background:"transparent",color:"#f55",cursor:"pointer",fontSize:10}},"Clear File Views")
      ),
      h("div",{style:{overflowX:"auto",paddingRight:2}},rows)
      ):null
    );
  }

  function TraceRow(props){
    var p=withAppProps(props);
    var tr=p.tr;
    if(!tr)return null;
    var i=p.i||0;
    var vis=p.vis||{};
    var C=p.C||{};
    var selected=p.selectedTraceName===tr.name;
    var traceColor=(p.traceColorMap&&p.traceColorMap[tr.name])||((C.tr&&C.tr[i%(C.tr.length||1)])||"var(--text)");
    var touchstoneFamily=(isTouchstoneTrace(tr)?String(getTouchstoneTraceFamily(tr)||"").toUpperCase():"");
    var isDerivedVisual=!!(isDerivedTrace(tr)||tr.operationType==="touchstone-stability"||tr.operationType==="touchstone-group-delay"||touchstoneFamily==="Y"||touchstoneFamily==="Z");
    var paneBadge=(p.paneMode>1&&p.tracePaneId)?("P"+String(String(p.tracePaneId).split("-")[1]||"1")):null;
    return h("div",{
      draggable:true,
      onDragStart:function(ev){if(p.onDragTraceStart)p.onDragTraceStart(tr.name,ev);},
      onDragEnd:function(){if(p.onDragTraceEnd)p.onDragTraceEnd();},
      onClick:function(){if(p.onSelectTrace)p.onSelectTrace(tr.name);},
      style:{display:"flex",alignItems:"center",gap:6,padding:"3px 6px",cursor:"grab",fontSize:12,borderRadius:4,background:selected?"var(--ft)":"transparent",border:selected?"1px solid var(--ftb)":"1px solid transparent"}
    },
      h("span",{draggable:true,title:"Drag trace to a pane",onDragStart:function(ev){if(p.onDragTraceStart)p.onDragTraceStart(tr.name,ev);},onDragEnd:function(){if(p.onDragTraceEnd)p.onDragTraceEnd();},onClick:function(ev){ev.stopPropagation();},style:{color:"var(--dim)",fontSize:12,cursor:"grab",userSelect:"none",padding:"0 2px",lineHeight:1}},"\u22EE"),
      h("input",{type:"checkbox",checked:!!vis[tr.name],onClick:function(ev){ev.stopPropagation();},onChange:function(){if(p.setVis)p.setVis(function(prev){var next=Object.assign({},prev||{});next[tr.name]=!next[tr.name];return next;});},style:{accentColor:traceColor||"var(--accent)"}}),
      h("span",{style:{color:traceColor||"var(--text)",fontWeight:600,fontSize:11}},getTraceLabel(tr)||tr.name),
      paneBadge?h("span",{style:{fontSize:10,color:"var(--dim)",border:"1px solid var(--border)",borderRadius:999,padding:"1px 5px",lineHeight:1.2}},paneBadge):null,
      isDerivedVisual?h("span",{style:{fontSize:10,color:traceColor||C.accent||"var(--accent)",border:"1px solid "+(traceColor||C.accent||"var(--accent)"),borderRadius:999,padding:"1px 6px",lineHeight:1.2}},"derived"):null,
      h("span",{style:{marginLeft:"auto"}}),
      p.onRemove?h("button",{onClick:function(ev){ev.preventDefault();ev.stopPropagation();p.onRemove();},title:"Remove trace",style:{background:"none",border:"none",color:"#f55",cursor:"pointer",fontSize:13,padding:0,lineHeight:"1"}},"\u00D7"):null
    );
  }

  function Btn(props){
    var p=withAppProps(props);
    var active=!!p.active;
    var color=p.color||"var(--accent)";
    var soft=!!p.soft;
    var activeBg=colorWithAlpha(color,0.14)||color;
    var softBg=colorWithAlpha(color,0.06)||"transparent";
    return h("button",{
      className:p.className||undefined,
      onClick:p.onClick,
      disabled:p.disabled,
      title:p.title||null,
      style:Object.assign({
        background:active?activeBg:(soft?softBg:"transparent"),
        border:"1px solid "+(active?color:(soft?colorWithAlpha(color,0.22)||color:"var(--border)")),
        color:active?color:"var(--muted)",
        borderRadius:6,
        padding:"5px 10px",
        cursor:p.disabled?"default":"pointer",
        fontSize:12,
        whiteSpace:"nowrap",
        fontWeight:p.bold?600:400,
        opacity:p.disabled?0.4:1,
        lineHeight:"1.4"
      },p.style||{})
    },p.children);
  }

  function MarkerItem(props){
    var p=withAppProps(props);
    var m=p.marker;
    if(!m)return null;
    var i=p.index||0;
    var markers=p.markers||[];
    var trace=(p.getTraceByName&&m.trace)?p.getTraceByName(m.trace):null;
    var yU=p.yU||"";
    var selected=p.selectedMkrIdx===i;
    var mc=(p.traceColorMap&&m.trace&&p.traceColorMap[m.trace])||((p.mcMap&&p.mcMap[m.type])||(p.C&&p.C.accent)||"var(--accent)");
    var bg=m.type==="peak"?"var(--pb)":m.type==="delta"?"var(--db)":"var(--mb)";
    var bd=selected?mc:(m.type==="peak"?"var(--pbb)":m.type==="delta"?"var(--dbb)":"var(--mbb)");
    var fScale=Math.abs(m.freq)>=1e9?1e9:Math.abs(m.freq)>=1e6?1e6:Math.abs(m.freq)>=1e3?1e3:1;
    var fUnit=fScale===1e9?"GHz":fScale===1e6?"MHz":fScale===1e3?"kHz":"Hz";
    var _freq=useState((m.freq/fScale).toFixed(fScale===1e9?6:3));
    var freqVal=_freq[0],setFreqVal=_freq[1];
    var ampDisplay=formatScalarWithUnit(m.amp,yU,{digits:3});
    var touchstoneInfo=null;
    var savedTouchstoneInfo=null;

    useEffect(function(){setFreqVal((m.freq/fScale).toFixed(fScale===1e9?6:3));},[m.freq,fScale]);

    if(selected&&trace){
      if(isFinite(m.smithPhase)||isFinite(m.smithZReal)||isFinite(m.smithZImag)||isFinite(m.smithMag)){
        savedTouchstoneInfo={};
        if(isFinite(m.smithMag))savedTouchstoneInfo.mag=m.smithMag;
        if(isFinite(m.smithPhase))savedTouchstoneInfo.phase=m.smithPhase;
        if(isFinite(m.smithZReal)||isFinite(m.smithZImag)){
          savedTouchstoneInfo.z={re:isFinite(m.smithZReal)?m.smithZReal:null,im:isFinite(m.smithZImag)?m.smithZImag:null};
        }
      }
      if(!savedTouchstoneInfo&&p.getTraceFile)touchstoneInfo=getTouchstoneMarkerReadout(p.getTraceFile(m.trace),trace,m.freq);
    }

    function commitFreq(raw){
      var n=parseFloat(raw);
      if(!isFinite(n)){
        setFreqVal((m.freq/fScale).toFixed(fScale===1e9?6:3));
        return;
      }
      setFreqVal(n.toFixed(fScale===1e9?6:3));
      if(!p.setMarkers)return;
      p.setMarkers(function(prev){
        var next=(prev||[]).slice();
        if(!next[i])return prev;
        var nextFreq=n*fScale;
        var traceName=next[i].trace;
        var trace=(p.allTr||[]).find(function(tr){return tr&&tr.name===traceName;})||null;
        var nextAmp=next[i].amp;
        if(trace){
          var point=nearestPoint(trace,nextFreq,p.zoom?p.zoom.left:null,p.zoom?p.zoom.right:null);
          if(point&&isFinite(point.amp)){
            nextFreq=point.freq;
            nextAmp=point.amp;
          }
        }
        next[i]=Object.assign({},next[i],{freq:nextFreq,amp:nextAmp});
        return next;
      });
    }

    var children=[
      h("div",{key:"mh",style:{display:"flex",alignItems:"center",gap:4,marginBottom:2,cursor:"pointer"}},
        h("span",{style:{color:mc,fontWeight:700,fontSize:11}},(m.label||"M"+(i+1))+" "+(selected?"<":"")),
        h("span",{style:{fontSize:10,color:"var(--dim)"}},m.trace),
        h("button",{title:"Remove this marker.",onClick:function(ev){ev.stopPropagation();if(p.rmMkr)p.rmMkr(i);},style:{marginLeft:"auto",background:"none",border:"none",color:"#f55",cursor:"pointer",fontSize:13,padding:0,lineHeight:"1"}},"x")
      ),
      h("div",{
        key:"mf",
        style:{display:"flex",alignItems:"center",gap:4,padding:"3px 0",borderBottom:"1px solid var(--border)"}
      },
        h("span",{style:{color:"var(--muted)",fontSize:12,minWidth:40}},"Freq"),
        h("input",{value:freqVal,onClick:function(ev){ev.stopPropagation();},onChange:function(ev){setFreqVal(ev.target.value);},onBlur:function(ev){commitFreq(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter"){commitFreq(ev.target.value);ev.target.blur();}else if(ev.key==="Escape"){setFreqVal((m.freq/fScale).toFixed(fScale===1e9?6:3));ev.target.blur();}},style:{flex:1,fontFamily:"monospace",fontSize:12,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:3,padding:"1px 4px",minWidth:0}}),
        h("span",{style:{fontSize:11,color:"var(--muted)",flexShrink:0}},fUnit)
      ),
      h("div",{
        key:"ma",
        style:{display:"flex",alignItems:"center",gap:4,padding:"3px 0",borderBottom:"1px solid var(--border)"}
      },
        h("span",{style:{color:"var(--muted)",fontSize:12,minWidth:40}},"Amp"),
        h("div",{style:{flex:1,fontFamily:"monospace",fontSize:12,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:3,padding:"1px 4px",minWidth:0}},ampDisplay)
      )
    ];

    var touchstoneData=savedTouchstoneInfo||touchstoneInfo;
    var isStabilityTrace=trace&&trace.operationType==="touchstone-stability";
    if(touchstoneData&&!isStabilityTrace){
      var paneId=p.getTracePaneId&&m.trace?p.getTracePaneId(m.trace):null;
      var renderMode=String(p.getPaneRenderMode&&paneId?p.getPaneRenderMode(paneId):"cartesian").trim().toLowerCase();
      var traceViewRaw=trace&&trace.networkSource&&trace.networkSource.view!=null?trace.networkSource.view:(trace&&trace.touchstoneView!=null?trace.touchstoneView:null);
      var traceView=String(traceViewRaw||"").trim().toLowerCase();
      var sRe=isFinite(touchstoneData.re)?Number(touchstoneData.re):null;
      var sIm=isFinite(touchstoneData.im)?Number(touchstoneData.im):null;
      var zReal=touchstoneData.z&&touchstoneData.z.re!=null?touchstoneData.z.re:touchstoneData.z&&touchstoneData.z.real!=null?touchstoneData.z.real:null;
      var zImag=touchstoneData.z&&touchstoneData.z.im!=null?touchstoneData.z.im:touchstoneData.z&&touchstoneData.z.imag!=null?touchstoneData.z.imag:null;
      var touchstoneDb=isFinite(touchstoneData.mag)?((20*Math.log10(Math.max(touchstoneData.mag,1e-12))).toFixed(2)+" dB"):"--";
      var touchstonePhase=isFinite(touchstoneData.phase)?touchstoneData.phase.toFixed(2)+" deg":"--";
      var yReal=null;
      var yImag=null;
      if(isFinite(zReal)||isFinite(zImag)){
        var zr=isFinite(zReal)?Number(zReal):0;
        var zi=isFinite(zImag)?Number(zImag):0;
        var yDen=(zr*zr)+(zi*zi);
        if(yDen>0){
          yReal=zr/yDen;
          yImag=-zi/yDen;
        }
      }

      if(renderMode==="smith"){
        children.push(h(MR,{key:"tszr",label:"Z real",value:isFinite(zReal)?formatScalarWithUnit(Number(zReal),"Ohm",{digits:3}):"--"}));
        children.push(h(MR,{key:"tszi",label:"Z imag",value:isFinite(zImag)?formatScalarWithUnit(Number(zImag),"Ohm",{digits:3}):"--"}));
      }else if(renderMode==="smith-inverted"){
        children.push(h(MR,{key:"tsyr",label:"Y real",value:isFinite(yReal)?formatScalarWithUnit(Number(yReal),"S",{digits:3}):"--"}));
        children.push(h(MR,{key:"tsyi",label:"Y imag",value:isFinite(yImag)?formatScalarWithUnit(Number(yImag),"S",{digits:3}):"--"}));
      }else{
        if(traceView==="db"){
          ampDisplay=touchstoneDb;
          children.push(h(MR,{key:"tsph",label:"Phase",value:touchstonePhase}));
        }else if(traceView==="phase"){
          ampDisplay=touchstonePhase;
          children.push(h(MR,{key:"tsf",label:"S dB",value:touchstoneDb}));
        }else if(traceView==="real"){
          if(isFinite(sRe))ampDisplay=sRe.toFixed(6);
          children.push(h(MR,{key:"tsim",label:"Imag",value:isFinite(sIm)?sIm.toFixed(6):"--"}));
        }else if(traceView==="imag"){
          if(isFinite(sIm))ampDisplay=sIm.toFixed(6);
          children.push(h(MR,{key:"tsre",label:"Real",value:isFinite(sRe)?sRe.toFixed(6):"--"}));
        }else if(traceView==="mag"){
          if(isFinite(touchstoneData.mag))ampDisplay=Number(touchstoneData.mag).toFixed(6);
          children.push(h(MR,{key:"tsph",label:"Phase",value:touchstonePhase}));
        }else{
          children.push(h(MR,{key:"tsf",label:"S dB",value:touchstoneDb}));
          children.push(h(MR,{key:"tsph",label:"Phase",value:touchstonePhase}));
        }
      }
    }

    children[2]=h("div",{
      key:"ma",
      style:{display:"flex",alignItems:"center",gap:4,padding:"3px 0",borderBottom:"1px solid var(--border)"}
    },
      h("span",{style:{color:"var(--muted)",fontSize:12,minWidth:40}},"Amp"),
      h("div",{style:{flex:1,fontFamily:"monospace",fontSize:12,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:3,padding:"1px 4px",minWidth:0}},ampDisplay)
    );

    if(m.type==="delta"&&m.refIdx!==undefined&&markers[m.refIdx]){
      children.push(h(MR,{key:"mdf",label:"dFreq",value:fmtF(m.freq-markers[m.refIdx].freq,true)}));
      children.push(h(MR,{key:"mda",label:"dAmp",value:(m.amp-markers[m.refIdx].amp).toFixed(3)+" dB"}));
    }

    return h("div",{onClick:function(){if(p.onSelect)p.onSelect(i);},style:{marginBottom:6,padding:"4px 6px",background:bg,border:"1px solid "+bd,borderRadius:4,cursor:"pointer"}},children);
  }

  function RefLineItem(props){
    var p=withAppProps(props);
    var rl=p.refLine;
    if(!rl)return null;
    var allTr=p.allTr||[];
    var vis=p.vis||{};
    var yU=p.yU||"";
    var C=p.C||{};
    var zoom=p.zoom||null;
    var selected=p.selectedRefLineId===rl.id;
    var col=rl.type==="h"?C.refH:C.refV;
    var paneBadge=rl.paneId?("P"+String((rl.paneId||"pane-1").split("-")[1]||"1")):null;
    var groupLocked=!!(rl.groupId&&Array.isArray(p.refLines)&&p.refLines.some(function(line){return line&&line.groupId===rl.groupId&&line.id!==rl.id;}));
    var visibleTraceRows=allTr.filter(function(tr){
      if(!vis[tr.name])return false;
      if(groupLocked)return true;
      if(!rl.paneId)return true;
      return p.getTracePaneId?p.getTracePaneId(tr.name)===rl.paneId:true;
    });
    var vScale=Math.abs(rl.value)>=1e9?1e9:Math.abs(rl.value)>=1e6?1e6:Math.abs(rl.value)>=1e3?1e3:1;
    var vUnit=vScale===1e9?"GHz":vScale===1e6?"MHz":vScale===1e3?"kHz":"Hz";
    var dispVal=rl.type==="v"?(rl.value/vScale).toFixed(vScale===1e9?6:3):rl.value.toFixed(2);
    var dispUnit=rl.type==="v"?vUnit:yU;
    var _edit=useState(dispVal);
    var editVal=_edit[0],setEditVal=_edit[1];

    useEffect(function(){setEditVal(dispVal);},[dispVal]);

    function commit(raw){
      var n=parseFloat(raw);
      if(!isFinite(n)){
        setEditVal(dispVal);
        return;
      }
      var fmt=rl.type==="v"?n.toFixed(vScale===1e9?6:3):n.toFixed(2);
      setEditVal(fmt);
      if(!p.setRefLines)return;
      if(rl.type==="v"){
        var newHz=n*vScale;
        p.setRefLines(function(prev){
          return (prev||[]).map(function(r){
            if(!r)return r;
            if(rl.groupId)return r.groupId===rl.groupId?Object.assign({},r,{value:newHz,label:fmtF(newHz,true)}):r;
            return r.id===rl.id?Object.assign({},r,{value:newHz,label:fmtF(newHz,true)}):r;
          });
        });
      }else{
        p.setRefLines(function(prev){
          return (prev||[]).map(function(r){
            if(!r)return r;
            if(rl.groupId)return r.groupId===rl.groupId?Object.assign({},r,{value:n,label:n.toFixed(2)+" "+yU}):r;
            return r.id===rl.id?Object.assign({},r,{value:n,label:n.toFixed(2)+" "+yU}):r;
          });
        });
      }
    }

    var block=[
      h("div",{
        key:"rlh-"+rl.id,
        style:{display:"flex",alignItems:"center",gap:4,padding:"3px 0",fontSize:12}
      },
        h("span",{style:{color:col,fontWeight:700,flexShrink:0}},rl.type==="h"?"H":"V"),
        paneBadge?h("span",{style:{fontSize:10,color:"var(--dim)",border:"1px solid var(--border)",borderRadius:999,padding:"1px 5px",lineHeight:1.2,flexShrink:0}},paneBadge):null,
        h("input",{value:editVal,onClick:function(ev){ev.stopPropagation();},onChange:function(ev){setEditVal(ev.target.value);},onBlur:function(ev){commit(ev.target.value);},onKeyDown:function(ev){if(ev.key==="Enter"){commit(ev.target.value);ev.target.blur();}else if(ev.key==="Escape"){setEditVal(dispVal);ev.target.blur();}},style:{flex:1,fontFamily:"monospace",fontSize:12,background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:3,padding:"1px 4px",minWidth:0}}),
        h("span",{style:{fontSize:11,color:"var(--muted)",flexShrink:0}},dispUnit),
        h("button",{title:"Remove this reference line.",onClick:function(ev){ev.stopPropagation();if(p.setRefLines)p.setRefLines(function(prev){return (prev||[]).filter(function(r){return r.id!==rl.id;});});},style:{background:"none",border:"none",color:"#f55",cursor:"pointer",fontSize:13,padding:0,lineHeight:"1"}},"x")
      )
    ];

    if(rl.type==="v"){
      visibleTraceRows.forEach(function(tr,i){
        var np=nearestPoint(tr,rl.value,null,null);
        if(!np||!isFinite(np.amp))return;
        block.push(h(MR,{key:"rlv-"+rl.id+"-"+tr.name,label:getTraceLabel(tr)||tr.name,value:formatScalarWithUnit(np.amp,yU,{digits:2}),vc:C.tr&&C.tr.length?C.tr[i%C.tr.length]:undefined,hlColor:C.tr&&C.tr.length?C.tr[i%C.tr.length]:undefined}));
      });
    }else{
      visibleTraceRows.forEach(function(tr,i){
        var hits=findHorizontalCrossings(tr,rl.value,zoom);
        hits.forEach(function(freq,hitIdx){
          block.push(h(MR,{key:"rlh-hit-"+rl.id+"-"+tr.name+"-"+hitIdx,label:(getTraceLabel(tr)||tr.name)+(hits.length>1?(" #"+(hitIdx+1)):""),value:fmtF(freq,true),vc:C.tr&&C.tr.length?C.tr[i%C.tr.length]:undefined,hlColor:C.tr&&C.tr.length?C.tr[i%C.tr.length]:undefined}));
        });
      });
    }

    return h("div",{onClick:function(){if(p.onSelect)p.onSelect(rl.id,rl.paneId||null);},style:{marginBottom:6,padding:"4px 6px",background:selected?(col+"11"):"var(--card)",border:"1px solid "+(selected?col:"var(--border)"),borderRadius:4,cursor:"pointer"}},block);
  }
  function TopBar(props){
    var p=withAppProps(props);
    function dotSep(key){
      return h("span",{key:key,style:{color:"var(--dim)",fontSize:14,lineHeight:1,padding:"0 2px",userSelect:"none"}},"\u00B7");
    }
    var files=p.files||[];
    var btns=[];
    if(p.hasData){
      btns.push(h(Btn,{key:"io-panel",className:"io-glow",active:p.showImportExportPanel,soft:true,color:p.C&&p.C.accent,title:"Open or close the import/export panel on the right side.",onClick:p.toggleImportExportPanel},"Import / Export"));
      btns.push(dotSep("sep-imp"));
      btns.push(h(Btn,{key:"panel",active:p.showSidebar,soft:true,color:p.C&&p.C.tr?p.C.tr[0]:undefined,title:"Show or hide the left sidebar with traces, markers, metadata, and lines.",onClick:function(){if(p.setShowSidebar)p.setShowSidebar(function(prev){return !prev;});}},"Panel"));
      btns.push(h(Btn,{key:"marker-tools",active:p.showMarkerTools,soft:true,color:p.C&&p.C.tr?p.C.tr[3]:undefined,title:"Show or hide marker controls in the graph toolbar.",onClick:function(){if(p.setShowMarkerTools)p.setShowMarkerTools(function(prev){return !prev;});}},"Marker"));
      btns.push(h(Btn,{key:"pane-tools",active:p.showPaneTools,soft:true,color:p.C&&p.C.tr?p.C.tr[1]:undefined,title:"Show or hide pane controls for multi-pane layout and fitting.",onClick:function(){if(p.setShowPaneTools)p.setShowPaneTools(function(prev){return !prev;});}},"Pane"));
      btns.push(h(Btn,{key:"search-tools",active:p.showSearchTools,soft:true,color:p.C&&p.C.tr?p.C.tr[2]:undefined,title:"Show or hide peak, minimum, and search-direction controls.",onClick:function(){if(p.setShowSearchTools)p.setShowSearchTools(function(prev){return !prev;});}},"Search"));
      btns.push(h(Btn,{key:"line-tools",active:p.showLineTools,soft:true,color:p.C&&p.C.refV,title:"Show or hide reference line controls.",onClick:function(){if(p.setShowLineTools)p.setShowLineTools(function(prev){return !prev;});}},"Lines"));
      btns.push(h(Btn,{key:"view-tools",active:p.showViewTools,soft:true,color:p.C&&p.C.accent,title:"Show or hide view controls such as Zoom All, X/div, Y/div, and resets.",onClick:function(){if(p.setShowViewTools)p.setShowViewTools(function(prev){return !prev;});}},"View"));
      btns.push(dotSep("sep-view"));
      btns.push(h(Btn,{key:"dots",active:p.showDots,soft:true,color:p.C&&p.C.md,title:"Show or hide plotted sample dots on top of the trace lines.",onClick:function(){if(p.setShowDots)p.setShowDots(function(prev){return !prev;});}},"Dots"));
      btns.push(h(Btn,{key:"dt",active:p.showDT,soft:true,color:p.C&&p.C.tr?p.C.tr[4]:undefined,title:"Show or hide the raw data table for the selected trace.",onClick:function(){if(p.setShowDT)p.setShowDT(function(prev){return !prev;});}},"Data"));
      (p.analysisButtons||[]).forEach(function(item,idx){
        if(idx===0)btns.push(dotSep("sep-analysis"));
        btns.push(h(Btn,{key:item.id,active:item.active,soft:true,color:item.color,title:item.tooltip||item.title,onClick:item.onClick},item.title));
      });
      btns.push(dotSep("sep-clear"));
      btns.push(h("button",{key:"clr",className:"clr-btn",title:"Remove all imported files, traces, markers, and analysis results from the current workspace.",onClick:function(){if(window.confirm("Clear all files and traces?")&&p.clearAllFiles)p.clearAllFiles();},style:{background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:400,whiteSpace:"nowrap",lineHeight:"1.4"}},"Clear All"));
    }else{
      btns.push(h(Btn,{key:"open-empty-io",className:"io-glow",color:p.C&&p.C.accent,title:"Open the import/export panel on the right side.",onClick:p.toggleImportExportPanel},"Import / Export"));
    }
    return h("div",{
      style:{background:"var(--card)",borderBottom:"1px solid var(--border)",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",flexShrink:0}
    },
      h("svg",{width:22,height:22,viewBox:"0 0 24 24",fill:"none"},
        h("rect",{x:2,y:4,width:20,height:16,rx:2,stroke:"var(--accent)",strokeWidth:1.5}),
        h("polyline",{points:"4,16 7,10 10,14 13,8 16,12 19,6 22,11",fill:"none",stroke:"var(--trace1)",strokeWidth:1.5})
      ),
      h("span",{style:{fontWeight:700,fontSize:14}},"Mergen Scope"),
      h("div",{style:{flex:1}}),
      btns.length?h("div",{style:{display:"flex",gap:5,flexWrap:"wrap"}},btns):null
    );
  }

  function FooterHintItem(props){
    var p=withAppProps(props);
    return h("div",{
      style:{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 10px",border:"1px solid var(--border)",borderRadius:999,background:"var(--card)",fontSize:12,lineHeight:1.2,boxShadow:"0 1px 0 rgba(0,0,0,0.03)"}
    },
      h("span",{style:{fontWeight:700,color:"var(--text)",whiteSpace:"nowrap"}},p.action),
      h("span",{style:{color:"var(--muted)",whiteSpace:"nowrap"}},p.effect)
    );
  }

  function FooterBar(props){
    var p=withAppProps(props);
    if(!p.hasData)return null;
    var hints=[
      {action:"L-click",effect:"select / place"},
      {action:"L-drag",effect:"move marker / ref line"},
      {action:"R-drag",effect:"X zoom / pan"},
      {action:"Wheel",effect:"Y zoom"},
      {action:"Shift + Wheel",effect:"Y pan"},
      {action:"Middle click",effect:"reset X + Y"}
    ];
    return h("div",{style:{padding:"10px 12px 12px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:8,alignItems:"center",flexShrink:0,background:"linear-gradient(to bottom, transparent, rgba(0,0,0,0.015))"}},
      h("div",{style:{fontSize:11,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",color:"var(--muted)"}},"Controls"),
      h("div",{style:{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:8,maxWidth:980}},
        hints.map(function(item){return h(FooterHintItem,{key:item.action,action:item.action,effect:item.effect});})
      )
    );
  }
  function SidebarPanel(props){
    var p=withAppProps(props);
    if(typeof p.render==="function")return p.render();

    var items=[];
    var files=p.files||[];
    var mKeys=p.mKeys||[];
    var stats=p.stats||{};
    var allTr=p.allTr||[];
    var panes=p.panes||[];
    var markers=p.markers||[];
    var refLines=p.refLines||[];
    var C=p.C||{};
    var activePane=(panes.find(function(pane){return pane.id===p.activePaneId;})||{title:"Pane 1"});
    var getTraceByName=p.getTraceByName||function(name){return allTr.find(function(tr){return tr.name===name;})||null;};
    var tracePaneMap=p.tracePaneMap||{};
    var hasTouchstoneFiles=files.some(function(file){return isTouchstoneFile(file);});

    items.push(h("div",{key:"sf",style:{display:"flex",alignItems:"center",gap:8,marginBottom:8,marginTop:0}},
      h("div",{style:{fontSize:11,textTransform:"uppercase",color:"var(--muted)",letterSpacing:1}},"Files ("+files.length+")"),
      h("div",{style:{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}},
        h("button",{title:"Show or hide the marker list in the left sidebar.",onClick:function(){if(p.setShowMarkers)p.setShowMarkers(function(prev){return !prev;});},style:{background:p.showMarkers?(colorWithAlpha(C.tr&&C.tr[2]?C.tr[2]:"var(--accent)",0.14)||"transparent"):"transparent",border:"1px solid "+(p.showMarkers?(C.tr&&C.tr[2]?C.tr[2]:"var(--accent)"):"var(--border)"),padding:"5px 10px",color:p.showMarkers?(C.tr&&C.tr[2]?C.tr[2]:"var(--accent)"):"var(--muted)",fontWeight:500,cursor:"pointer",fontSize:12,whiteSpace:"nowrap",lineHeight:"1.4",borderRadius:6}},"Markers"),
        hasTouchstoneFiles?h("button",{title:"Show or hide all Touchstone S-parameter controls in the left sidebar.",onClick:function(){if(p.setShowTouchstoneControls)p.setShowTouchstoneControls(function(prev){return !prev;});},style:{background:p.showTouchstoneControls?(colorWithAlpha(C.accent||"var(--accent)",0.14)||"transparent"):"transparent",border:"1px solid "+(p.showTouchstoneControls?(C.accent||"var(--accent)"):"var(--border)"),padding:"5px 10px",color:p.showTouchstoneControls?(C.accent||"var(--accent)"):"var(--muted)",fontWeight:500,cursor:"pointer",fontSize:12,whiteSpace:"nowrap",lineHeight:"1.4",borderRadius:6}},"Sij"):null,
        h("button",{title:"Show or hide imported file metadata and per-trace summary stats.",onClick:function(){if(p.setShowMeta)p.setShowMeta(function(prev){return !prev;});},style:{background:p.showMeta?(colorWithAlpha(C.tr&&C.tr[0]?C.tr[0]:"var(--accent)",0.14)||"transparent"):"transparent",border:"1px solid "+(p.showMeta?(C.tr&&C.tr[0]?C.tr[0]:"var(--accent)"):"var(--border)"),padding:"5px 10px",color:p.showMeta?(C.tr&&C.tr[0]?C.tr[0]:"var(--accent)"):"var(--muted)",fontWeight:500,cursor:"pointer",fontSize:12,whiteSpace:"nowrap",lineHeight:"1.4",borderRadius:6}},"Metadata")
      )
    ));

    files.forEach(function(f,idx){
      items.push(h("div",{key:"f-"+f.id,style:{fontSize:12,padding:"2px 0",display:"flex",alignItems:"center",gap:4}},
        h("span",{style:{flex:1,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text)"}},f.fileName),
        isTouchstoneFile(f)?h("span",{style:{fontSize:10,color:p.C&&p.C.accent?p.C.accent:"var(--accent)",border:"1px solid "+(p.C&&p.C.accent?p.C.accent:"var(--accent)"),borderRadius:999,padding:"1px 6px",lineHeight:1.2,whiteSpace:"nowrap"}},formatTouchstoneFamilyBadge(f)):null,
        h("span",{style:{color:"var(--dim)",fontSize:10}},(f.traces||[]).length+" tr"),
        h("button",{title:"Remove this imported file and all of its traces.",onClick:function(){if(p.removeFile)p.removeFile(f.id);},style:{background:"none",border:"none",color:"#f55",cursor:"pointer",fontSize:13,padding:0,lineHeight:"1"}},"\u00D7")
      ));
      if(p.showMeta){
        items.push(h(Sec,{key:"meta-"+f.id},"Metadata \u00B7 "+f.fileName));
        mKeys.forEach(function(k){
          if(f.meta&&f.meta[k]!==undefined)items.push(h(MR,{key:"m-"+f.id+"-"+k,label:k,value:f.meta[k]}));
        });
        if(isTouchstoneFile(f)){
          var touchstoneRows=getTouchstoneSummaryRows(f);
          if(touchstoneRows.length){
            items.push(h(Sec,{key:"ts-"+f.id},"Touchstone"));
            touchstoneRows.forEach(function(row){
              items.push(h(MR,{key:"ts-"+f.id+"-"+row.label,label:row.label,value:row.value}));
            });
          }
        }
      }
      if(p.showTouchstoneControls&&isTouchstoneFile(f)){
        items.push(h(TouchstoneMatrixPicker,{
          key:"touchstone-picker-"+f.id,
          file:f,
          fileId:f.id,
          C:C,
          touchstoneStateByFileId:p.touchstoneStateByFileId,
          touchstoneState:p.touchstoneState,
          onSetActiveFamily:p.onTouchstoneSetActiveFamily,
          onSetFamilyView:p.onTouchstoneSetFamilyView,
          onSetExpanded:p.onTouchstoneSetExpanded,
          onToggleCell:p.onTouchstoneToggleCell,
          onApplyPreset:p.onTouchstoneApplyPreset,
          onClearFileViews:p.onTouchstoneClearFileViews
        }));
      }
      if(idx<files.length-1)items.push(h("div",{key:"sep-"+f.id,style:{height:8}}));
    });

    if(p.showMeta){
      items.push(h(Sec,{key:"stmeta"},"Trace Metadata"));
      Object.entries(stats).forEach(function(entry){
        var name=entry[0],st=entry[1];
        var dn=allTr.find(function(t){return t.name===name;});
        items.push(h(Sec,{key:"ss-"+name},(dn&&dn.dn)||name));
        items.push(h(MR,{key:"sn-"+name,label:"Points",value:st.n}));
        items.push(h(MR,{key:"sp-"+name,label:"Peak",value:formatScalarWithUnit(st.pk.amp,p.yU||"",{digits:2})}));
        items.push(h(MR,{key:"spf-"+name,label:"Peak Freq",value:fmtF(st.pk.freq,true)}));
        items.push(h(MR,{key:"smn-"+name,label:"Min",value:formatScalarWithUnit(st.mn.amp,p.yU||"",{digits:2})}));
        items.push(h(MR,{key:"sd-"+name,label:"\u0394",value:st.delta.toFixed(2)+" dB"}));
      });
    }

    items.push(h(Sec,{key:"pane-sec"},"Panes"));
    items.push(h("div",{key:"pane-summary",style:{fontSize:11,color:"var(--muted)",lineHeight:1.4,marginBottom:8}},
      "Active: "+activePane.title+(p.selectedTraceName?(" \u00B7 Selected trace: "+(getTraceLabel(getTraceByName(p.selectedTraceName))||p.selectedTraceName)):"")+(p.dragTraceName?(" \u00B7 Dragging: "+(getTraceLabel(getTraceByName(p.dragTraceName))||p.dragTraceName)):"")
    ));

    if(panes.length>1){
      items.push(h("div",{
        key:"pane-actions",
        style:{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}
      },
        h("button",{title:"Fit the active pane vertically to the traces currently shown in it.",onClick:function(){if(p.fitPane)p.fitPane(p.activePaneId);},style:{padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.accent,borderRadius:4,cursor:"pointer",fontSize:11}},"Fit Active"),
        h("button",{title:"Fit every pane vertically to the traces visible in that pane.",onClick:p.fitAllPanes,style:{padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:C.accent,borderRadius:4,cursor:"pointer",fontSize:11}},"Fit All"),
        h("button",{title:"Remove all traces from the active pane and move them back to the remaining layout.",onClick:function(){if(panes.length<2)return;if(p.resetYZ)p.resetYZ(p.activePaneId);if(p.clearPane)p.clearPane(p.activePaneId);},disabled:panes.length<2,style:{padding:"5px 8px",background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:4,cursor:panes.length<2?"not-allowed":"pointer",fontSize:11,opacity:panes.length<2?0.55:1}},"Clear Active")
      ));
    }

    items.push(h(Sec,{key:"st"},"Traces ("+allTr.length+")"));
    allTr.forEach(function(tr,i){
      items.push(h(TraceRow,{key:"tr-"+tr.name,tr:tr,i:i,vis:p.vis,setVis:p.setVis,C:C,traceColorMap:p.traceColorMap,paneMode:p.paneMode,tracePaneId:p.getTracePaneId?p.getTracePaneId(tr.name):null,selectedTraceName:p.selectedTraceName,onSelectTrace:p.selectTrace||p.onSelectTrace,onDragTraceStart:p.onTraceDragStart,onDragTraceEnd:p.onTraceDragEnd,onRemove:p.removeTrace?function(){p.removeTrace(tr.name);}:null}));
    });

    if(p.showMarkers&&markers.length){
      items.push(h(Sec,{key:"sm"},"Markers ("+markers.length+")"));
      markers.forEach(function(m,i){
        items.push(h(MarkerItem,{key:"mk-"+i,marker:m,index:i,markers:markers,yU:p.yU,rmMkr:p.rmMkr,mcMap:p.mcMap,C:C,traceColorMap:p.traceColorMap,setMarkers:p.setMarkers,allTr:allTr,zoom:p.zoom,getTraceByName:getTraceByName,getTraceFile:p.getTraceFile,getTracePaneId:p.getTracePaneId,getPaneRenderMode:p.getPaneRenderMode,selectedMkrIdx:p.selectedMkrIdx,onSelect:function(idx){if(p.setSelectedRefLineId)p.setSelectedRefLineId(null);if(p.setSelectedMkrIdx)p.setSelectedMkrIdx(idx);}}));
      });
    }

    var groupedRefLines={};
    var sidebarRefLines=[];
    refLines.forEach(function(line){
      if(!line)return;
      var key=line.groupId||("line-"+line.id);
      if(!groupedRefLines[key]){
        groupedRefLines[key]=line;
        sidebarRefLines.push(line);
        return;
      }
      if(p.selectedRefLineId!==null&&p.selectedRefLineId!==undefined&&line.id===p.selectedRefLineId){
        groupedRefLines[key]=line;
        var idx=sidebarRefLines.findIndex(function(item){return (item.groupId||("line-"+item.id))===key;});
        if(idx!==-1)sidebarRefLines[idx]=line;
      }
    });

    if(sidebarRefLines.length){
      items.push(h(Sec,{key:"srl"},"Ref Lines ("+sidebarRefLines.length+")"));
      sidebarRefLines.forEach(function(rl){
        items.push(h(RefLineItem,{key:"rl-"+rl.id,refLine:rl,refLines:refLines,allTr:allTr,vis:p.vis,zoom:p.zoom,yU:p.yU,setRefLines:p.setRefLines,C:C,selectedRefLineId:p.selectedRefLineId,getTracePaneId:function(traceName){return p.getTracePaneId?p.getTracePaneId(traceName):null;},onSelect:function(id,paneId){if(p.setSelectedMkrIdx)p.setSelectedMkrIdx(null);if(p.setSelectedRefLineId)p.setSelectedRefLineId(id);if(p.setActivePaneId&&paneId)p.setActivePaneId(paneId);}}));
      });
      items.push(h("button",{key:"rl-clr",className:"clr-btn",title:"Remove every reference line from every pane.",onClick:function(){if(p.setSelectedRefLineId)p.setSelectedRefLineId(null);if(p.setRefLines)p.setRefLines([]);},style:{width:"100%",padding:"6px 10px",background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600,marginTop:4}},"Clear All Lines"));
    }

    if(markers.length){
      items.push(h("div",{key:"mk-bottom-wrap",style:{height:12}}));
      items.push(h("button",{key:"mk-bottom",className:"clr-btn",title:"Remove every marker from the current workspace.",onClick:p.clearMarkers,style:{width:"100%",padding:"6px 10px",background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600,marginTop:4}},"Clear All Markers"));
    }

    return h("div",{style:{width:260,background:"var(--card)",borderRight:"1px solid var(--border)",padding:12,overflowY:"auto",flexShrink:0}},items);
  }
  function ToolbarStrip(props){
    var p=withAppProps(props);
    if(typeof p.render==="function")return p.render();
    var allTr=p.allTr||[];
    if(!allTr.some(function(t){return t&&Array.isArray(t.data)&&t.data.length>0;}))return null;

    var C=p.C||{};
    var toolbarYBase=sanitizeYDomain(p.yZoom)||getSafeYRangeFromData(allTr,p.vis||{},p.zoom||null);
    var toolbarYTicks=toolbarYBase?makeYTicksFromDomain(toolbarYBase):null;
    var cData=p.cData||[];
    var toolbarXTicks=cData.length?makeNiceTicks({min:cData[0].fs,max:cData[cData.length-1].fs},11):null;
    var selectedMarker=p.selectedMarker!==undefined?p.selectedMarker:((p.markers||[])[p.selectedMkrIdx]||null);
    var paneTraces=(Array.isArray(p.paneTraces)&&p.paneTraces.length)?p.paneTraces:allTr;
    var markerTraceOptions=paneTraces.filter(function(tr){
      return tr&&Array.isArray(tr.data)&&tr.data.length&&(p.vis?p.vis[tr.name]:true);
    });
    var markerTraceValue=p.markerTrace&&p.markerTrace!=="__auto__"?p.markerTrace:"__auto__";

    function fmtDivValue(step,unit){
      if(!isFinite(step))return "--";
      var decimals=step>=100?0:step>=10?1:step>=1?2:step>=0.1?3:step>=0.01?4:5;
      return step.toFixed(decimals)+" "+unit+"/div";
    }

    function group(title,children,color){
      var tint=color||"var(--border)";
      return h("div",{style:{display:"flex",alignItems:"center",gap:5,padding:"6px 8px",border:"1px solid "+(color?(tint+"44"):"var(--border)"),borderRadius:8,background:color?(tint+"0f"):"var(--card)",flexWrap:"wrap"}},
        h("span",{style:{fontSize:11,color:color||"var(--dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginRight:4}},title),
        children
      );
    }

    var xDivLabel=p.toolbarXDivLabel||((toolbarXTicks&&toolbarXTicks.length>1)?fmtDivValue(Math.abs(toolbarXTicks[1]-toolbarXTicks[0]),p.fUnit||"Hz"):"--");
    var yDivLabel=p.toolbarYDivLabel||((toolbarYTicks&&toolbarYTicks.length>1)?fmtDivValue(Math.abs(toolbarYTicks[1]-toolbarYTicks[0]),p.yU||""):"--");
    var panes=p.panes||[];
    var paneButtons=panes.map(function(pane,idx){
      return h(Btn,{key:"pac-"+pane.id,active:p.activePaneId===pane.id,color:C.tr&&C.tr.length?C.tr[idx%C.tr.length]:undefined,title:"Make "+pane.title+" the active pane for marker, search, and line actions.",onClick:function(){if(p.setActivePaneId)p.setActivePaneId(pane.id);}},pane.title);
    });

    var row1=[];
    if(p.showMarkerTools)row1.push(group("Marker",[
      h(Btn,{key:"bn",active:p.mkrMode==="normal"&&!p.refMode&&!p.newMarkerArmed,color:C.mn,title:"Place or move a normal marker on the active pane.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setSelectedRefLineId)p.setSelectedRefLineId(null);if(p.interactionCtl&&p.interactionCtl.selectNormal)p.interactionCtl.selectNormal();else{if(p.setMkrMode)p.setMkrMode("normal");if(p.setRefMode)p.setRefMode(null);}},style:{background:p.mkrMode==="normal"&&!p.refMode&&!p.newMarkerArmed?(colorWithAlpha(C.mn||"var(--accent)",0.10)||"var(--card)"):"transparent"}},"Normal"),
      h(Btn,{key:"bd",active:p.mkrMode==="delta"&&!p.refMode,color:C.md,title:"Create delta markers referenced to another marker.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.interactionCtl&&p.interactionCtl.selectDelta)p.interactionCtl.selectDelta();else{if(p.setMkrMode)p.setMkrMode("delta");if(p.setRefMode)p.setRefMode(null);if((p.markers||[]).length>0&&p.dRef===null&&p.setDRef)p.setDRef(0);}}},"Delta"),
      h("div",{key:"mtrace-wrap",style:{display:"flex",alignItems:"center",gap:4,padding:"3px 6px",border:"1px solid var(--border)",borderRadius:6,background:"var(--bg)",minWidth:210,maxWidth:320}},
        h("span",{style:{fontSize:11,color:"var(--dim)",fontWeight:700,whiteSpace:"nowrap"}},"Trace"),
        h("select",{
          value:markerTraceValue,
          title:"Choose marker target trace from the active pane.",
          onChange:function(ev){if(p.setMarkerTrace)p.setMarkerTrace(ev.target.value||"__auto__");},
          style:{flex:1,minWidth:120,background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,padding:"2px 6px",fontSize:11}
        },
          h("option",{value:"__auto__"},"Auto (Active Pane)"),
          markerTraceOptions.map(function(tr){
            var label=getTraceLabel(tr)||tr.name;
            return h("option",{key:"mto-"+tr.name,value:tr.name},label);
          })
        )
      ),
      h(Btn,{key:"bnew",active:p.newMarkerArmed,color:C.accent,title:"Arm one-shot new-marker placement on the next chart click.",onClick:function(){if(p.setSelectedRefLineId)p.setSelectedRefLineId(null);if(p.setRefMode)p.setRefMode(null);if(p.setMkrMode)p.setMkrMode("normal");if(p.setNewMarkerArmed)p.setNewMarkerArmed(function(prev){return !prev;});}},"New Marker"),
      h(Btn,{key:"bun",color:C.accent,title:"Clear the currently selected marker or reference line.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setSelectedMkrIdx)p.setSelectedMkrIdx(null);if(p.setSelectedRefLineId)p.setSelectedRefLineId(null);},disabled:(p.selectedMkrIdx===null||p.selectedMkrIdx===undefined)&&(p.selectedRefLineId===null||p.selectedRefLineId===undefined)},"Unselect")
    ],C.tr&&C.tr[3]));

    if(p.showPaneTools)row1.push(group("Pane",[
      h(Btn,{key:"padd",color:C.tr&&C.tr.length?C.tr[Math.min(panes.length,C.tr.length-1)]:undefined,title:"Add another stacked pane, up to four panes total.",onClick:function(){if(p.setPaneMode)p.setPaneMode(Math.min(4,panes.length+1));},disabled:panes.length>=4},"+ Pane"),
      h(Btn,{key:"prem",color:"#f64",title:"Remove the last pane and move its traces back into the remaining panes.",onClick:function(){if(panes.length>1&&p.setPaneMode)p.setPaneMode(panes.length-1);},disabled:panes.length<=1},"- Pane"),
      paneButtons,
      p.hasTouchstoneFiles?h("select",{key:"prm",value:p.activePaneRenderMode||"cartesian",onChange:function(ev){if(p.setActivePaneRenderMode)p.setActivePaneRenderMode(ev.target.value);},style:{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,padding:"4px 6px",fontSize:12,maxWidth:130}},(p.availablePaneRenderModes||["cartesian"]).map(function(mode){
        var label=mode==="smith"?"Smith":(mode==="smith-inverted"?"Inv Smith":"Cartesian");
        return h("option",{key:mode,value:mode},label);
      })):null,
      h(Btn,{key:"pfitall",color:C.accent,title:"Fit every pane vertically to the traces shown in that pane.",onClick:p.fitAllPanes,disabled:!p.hasData},"Fit All")
    ],C.tr&&C.tr[1]));

    if(p.showSearchTools)row1.push(group("Search",[
      h(Btn,{key:"bp",color:C.mp,title:"Find the strongest peak on the selected trace or active pane.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setRefMode)p.setRefMode(null);if(p.peakSrch)p.peakSrch();}},"Peak"),
      h(Btn,{key:"bnp",color:C.mp,title:"Step to the next peak in the current search direction.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setRefMode)p.setRefMode(null);if(p.nxtPeak)p.nxtPeak();},disabled:!(p.markers||[]).length&&!allTr.length},"Next Peak"),
      h(Btn,{key:"bm",color:C.mn,title:"Find the minimum point on the selected trace or active pane.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setRefMode)p.setRefMode(null);if(p.minSrch)p.minSrch();}},"Min"),
      h(Btn,{key:"bnm",color:C.mn,title:"Step to the next minimum in the current search direction.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setRefMode)p.setRefMode(null);if(p.nxtMin)p.nxtMin();},disabled:!(p.markers||[]).length&&!allTr.length},"Next Min"),
      h(Btn,{key:"sdir",active:true,color:p.searchDirection==="right"?"#8b3dbb":"#ff6699",title:"Toggle search direction between increasing and decreasing frequency.",onClick:function(){if(p.setSearchDirection)p.setSearchDirection(function(prev){return prev==="right"?"left":"right";});}},p.searchDirection==="right"?"Dir: L -> R":"Dir: L <- R"),
      p.mkrMode==="delta"&&(p.markers||[]).length>0&&!p.refMode?h("select",{key:"ds",value:p.dRef??0,onChange:function(ev){if(p.setDRef)p.setDRef(Number(ev.target.value));},style:{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,padding:"3px 6px",fontSize:12}},(p.markers||[]).map(function(_,i){return h("option",{key:i,value:i},"Ref: M"+(i+1));})):null
    ],C.tr&&C.tr[2]));

    if(p.showLineTools)row1.push(group("Lines",[
      h(Btn,{key:"rv",active:p.refMode==="v",color:C.refV,title:"Place a vertical reference line at a frequency position.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setRefMode)p.setRefMode(p.refMode==="v"?null:"v");}},"V-Line"),
      h(Btn,{key:"rh",active:p.refMode==="h",color:C.refH,title:"Place a horizontal reference line at an amplitude level.",onClick:function(){if(p.setNewMarkerArmed)p.setNewMarkerArmed(false);if(p.setRefMode)p.setRefMode(p.refMode==="h"?null:"h");}},"H-Line"),
      h(Btn,{key:"lock-lines",active:p.lockLinesAcrossPanes,color:C.refV,title:p.lockLinesAcrossPanes?"Create linked lines across all panes.":"Create new lines only in the active pane.",onClick:function(){if(p.setLockLinesAcrossPanes)p.setLockLinesAcrossPanes(function(prev){return !prev;});}},p.lockLinesAcrossPanes?"Lock: All Panes":"Lock: Active Pane")
    ],C.refV));

    if(p.showViewTools)row1.push(group("View",[
      h(Btn,{key:"zall",active:p.zoomAll,color:C.accent,title:p.zoomAll?"Keep right-click X zoom and pan shared across all panes.":"Limit right-click X zoom and pan to the active pane only.",onClick:function(){if(p.setZoomAll)p.setZoomAll(function(prev){return !prev;});}},"Zoom All"),
      h("div",{key:"xdb",style:{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",border:"1px solid var(--border)",borderRadius:6,minWidth:132,background:"var(--bg)"}},
        h("span",{style:{fontSize:11,color:"var(--dim)",fontWeight:700}},"X/div"),
        h("span",{style:{fontSize:12,fontFamily:"monospace",color:"var(--text)"}} ,xDivLabel)
      ),
      h("div",{key:"ydb",style:{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",border:"1px solid var(--border)",borderRadius:6,minWidth:132,background:"var(--bg)"}},
        h("span",{style:{fontSize:11,color:"var(--dim)",fontWeight:700}},"Y/div"),
        h("span",{style:{fontSize:12,fontFamily:"monospace",color:"var(--text)"}} ,yDivLabel)
      ),
      p.yZoom?h(Btn,{key:"yr",color:"#f64",title:"Reset the active pane vertical zoom back to its automatic fit.",onClick:p.resetYZ},"Reset Y"):null,
      h(Btn,{key:"xr",color:"#f64",title:p.zoomAll?"Reset the shared horizontal zoom for all panes.":"Reset the active pane horizontal zoom only.",onClick:function(){if(p.zoom&&p.setZoom)p.setZoom(null);},disabled:!p.zoom},"Reset X")
    ],C.accent));

    var status=[];
    if(p.interactionCtl&&p.interactionCtl.hint)status.push(h("span",{key:"rms",style:{fontSize:11,color:p.refMode?(p.refMode==="h"?C.refH:C.refV):C.md,fontWeight:600}},p.interactionCtl.hint));
    if(p.newMarkerArmed)status.push(h("span",{key:"nma",style:{fontSize:11,color:C.accent,fontWeight:600}},"Click chart to place a new marker"));
    if(selectedMarker)status.push(h("span",{key:"selm",style:{fontSize:11,color:C.accent,fontWeight:600}},"Selected marker: "+(selectedMarker.label||("M"+(p.selectedMkrIdx+1)))));
    if(p.selectedRefLineId!==null&&p.selectedRefLineId!==undefined){
      var selLine=(p.refLines||[]).find(function(line){return line&&line.id===p.selectedRefLineId;});
      if(selLine)status.push(h("span",{key:"sell",style:{fontSize:11,color:selLine.type==="h"?C.refH:C.refV,fontWeight:600}},"Selected line: "+(selLine.type==="h"?"H":"V")+"-"+selLine.id+" (drag chart to move)"));
    }

    return h("div",{style:{display:"flex",flexDirection:"column",gap:6,padding:"6px 12px",borderBottom:"1px solid var(--border)",flexShrink:0}},
      h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},row1),
      status.length?h("div",{style:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",minHeight:18}},status):null
    );
  }
  function ImportExportPanel(props){
    var p=withAppProps(props);
    if(typeof p.render==="function")return p.render();
    var visible=p.visible;
    if(visible===undefined)visible=p.showImportExportPanel;
    if(visible===false)return null;
    var C=p.C||{};
    var AnalysisFeatureCard=getFeatureCard();
    var hasData=!!p.hasData;
    var files=p.files||[];
    var allTr=p.allTr||[];
    var panes=p.panes||[];
    var activePane=(panes.find(function(pane){return pane.id===p.activePaneId;})||{title:"Pane 1"});
    return h("div",{key:"import-export-stack",style:{display:"flex",flexDirection:"column",gap:8}},
      h(AnalysisFeatureCard,{key:"import-export-card",first:true,title:"Import / Export",color:C.accent,description:"Import files, round-trip full workspaces, and export chart or analysis bundles from one place. Touchstone imports will expose S/Y/Z matrix selections and stability views once wired."}),
      h("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        h(Btn,{color:C.tr&&C.tr[2],title:hasData?"Import one or more local trace files, including Touchstone network files, and add them to the current workspace.":"Import one or more local trace files, including Touchstone network files, into the workspace.",onClick:function(){var ref=hasData?p.iRef:p.fRef;ref=ref&&ref.current?ref.current:ref;if(ref&&ref.click)ref.click();}},"Import"),
        h(Btn,{soft:true,color:C.accent,title:"Replace the current workspace with a saved workspace JSON file.",onClick:p.openWorkspace},"Open Workspace"),
        h(Btn,{soft:true,color:C.tr&&C.tr[4],title:"Save the current workspace state as a portable JSON file.",onClick:p.exportWorkspace||p.saveWorkspace,disabled:!hasData},"Save Workspace"),
        h(Btn,{soft:true,color:C.tr&&C.tr[1],title:"Export raw traces, derived traces, markers, reference lines, current analysis traces, saved analysis results, and Touchstone-backed derived views as JSON.",onClick:p.exportTraceData||p.exportData,disabled:!hasData},"Export JSON"),
        h(Btn,{soft:true,color:(C.tr&&C.tr[5])||C.accent,title:"Export the current chart view as a higher-resolution PNG image.",onClick:p.exportChartPng,disabled:!hasData},"PNG"),
        h(Btn,{soft:true,color:C.refV,title:"Export the current chart view as a pure-graph SVG image.",onClick:p.exportChartSvg,disabled:!hasData},"SVG")
      ),
      h("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
        h("button",{className:"clr-btn",title:"Remove all imported files, traces, markers, and analysis results from the current workspace.",onClick:function(){if(hasData&&window.confirm("Clear all files and traces?")&&p.clearAllFiles)p.clearAllFiles();},disabled:!hasData,style:{background:"transparent",border:"1px solid var(--border)",color:"var(--muted)",borderRadius:6,padding:"6px 10px",cursor:hasData?"pointer":"not-allowed",fontSize:12,fontWeight:500,whiteSpace:"nowrap",lineHeight:"1.4",opacity:hasData?1:0.45,width:"100%"}},"Clear Workspace")
      ),
      hasData?h("div",{style:{fontSize:11,color:"var(--muted)",lineHeight:1.5}},"Files: "+files.length+" \u00B7 Traces: "+allTr.length+" \u00B7 Active pane: "+activePane.title):null
    );
  }

  function DataTablePanel(props){
    var p=withAppProps(props);
    if(typeof p.render==="function")return p.render();
    var visible=p.visible;
    if(visible===undefined)visible=p.showDT;
    if(!visible||!p.hasData)return null;
    var AnalysisFeatureCard=getFeatureCard();
    var allTr=p.allTr||[];
    var tr=p.dataTableTrace||allTr.find(function(t){return t.name===p.dtTrace;})||null;
    var data=p.dataTableRows||((tr&&p.getVisibleTraceData)?p.getVisibleTraceData(tr,p.zoom):tr?getVisibleTraceData(tr,p.zoom):[]);
    var C=p.C||{};
    return h(AnalysisFeatureCard,{key:"data-table-card",title:"Data Table",color:C.tr&&C.tr[4],description:"Inspect the currently visible points for a selected trace in the active zoom range."},
      h("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:8}},
        h("span",{style:{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:0.6}},"Trace"),
        h("select",{value:p.dtTrace||"",onChange:function(ev){if(p.setDtTrace)p.setDtTrace(ev.target.value);},style:{marginLeft:"auto",maxWidth:"100%",background:"var(--bg)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:4,fontSize:11,padding:"3px 6px"}},
          allTr.map(function(t){return h("option",{key:t.name,value:t.name},getTraceLabel(t)||t.name);})
        )
      ),
      h("div",{style:{padding:"4px 10px",border:"1px solid var(--border)",borderBottom:"none",borderRadius:"6px 6px 0 0",display:"flex",fontSize:11,fontWeight:700,color:"var(--muted)",background:"var(--bg)"}},
        h("span",{style:{flex:1}},"#"),
        h("span",{style:{flex:3,textAlign:"right"}},"Freq"),
        h("span",{style:{flex:2,textAlign:"right"}},"Amp")
      ),
      h("div",{style:{maxHeight:320,overflowY:"auto",border:"1px solid var(--border)",borderRadius:"0 0 6px 6px",background:"var(--card)"}},
        (data||[]).map(function(d,i){
          return h("div",{key:i,style:{display:"flex",padding:"2px 10px",fontSize:11,fontFamily:"monospace",borderBottom:"1px solid var(--bg)",background:i%2===0?"transparent":"var(--da)"}},
            h("span",{style:{flex:1,color:"var(--dim)"}},i+1),
            h("span",{style:{flex:3,textAlign:"right",color:"var(--text)"}},Number(d.freq).toFixed(1)),
            h("span",{style:{flex:2,textAlign:"right",color:"var(--damp)"}},formatScalarWithUnit(Number(d.amp),p.yU||"",{digits:3}))
          );
        })
      )
    );
  }

  global.AppShell={
    Btn:Btn,
    SidebarPane:SidebarPane,
    RightPanelStack:RightPanelStack,
    ChartPane:ChartPane,
    TouchstoneMatrixPicker:TouchstoneMatrixPicker,
    TraceRow:TraceRow,
    MarkerItem:MarkerItem,
    RefLineItem:RefLineItem,
    TopBar:TopBar,
    FooterHintItem:FooterHintItem,
    FooterBar:FooterBar,
    SidebarPanel:SidebarPanel,
    ToolbarStrip:ToolbarStrip,
    ImportExportPanel:ImportExportPanel,
    DataTablePanel:DataTablePanel
  };
})(window);
