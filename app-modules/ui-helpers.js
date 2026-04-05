(function(global){
  var React=global.React;
  var h=React.createElement;
  var useState=React.useState;
  var useEffect=React.useEffect;

  function fmtF(hz){
    if(typeof hz!=="number"||!isFinite(hz))return "--";
    var a=Math.abs(hz);
    if(a>=1e9)return(hz/1e9).toFixed(6)+" GHz";
    if(a>=1e6)return(hz/1e6).toFixed(3)+" MHz";
    if(a>=1e3)return(hz/1e3).toFixed(3)+" kHz";
    return hz.toFixed(1)+" Hz";
  }

  function isSecondUnit(unit){
    var key=String(unit||"").trim().toLowerCase();
    return key==="s"||key==="sec"||key==="secs"||key==="second"||key==="seconds";
  }

  function isSiemensUnit(unit){
    var raw=String(unit||"").trim();
    var key=raw.toLowerCase();
    return raw==="S"||key==="siemens";
  }

  function isOhmUnit(unit){
    var key=String(unit||"").trim().toLowerCase();
    return key==="ohm"||key==="ohms"||key==="omega";
  }

  function trimFixedNumber(text){
    var s=String(text==null?"":text);
    if(s.indexOf(".")===-1)return s;
    s=s.replace(/(\.[0-9]*?)0+$/,"$1");
    s=s.replace(/\.$/,"");
    return s;
  }

  function formatEngineeringValue(value,baseUnit,digits){
    var n=Number(value);
    if(!isFinite(n))return "--";
    if(n===0)return "0 "+baseUnit;
    var abs=Math.abs(n);
    var table=[
      {factor:1e12,prefix:"T"},
      {factor:1e9,prefix:"G"},
      {factor:1e6,prefix:"M"},
      {factor:1e3,prefix:"k"},
      {factor:1,prefix:""},
      {factor:1e-3,prefix:"m"},
      {factor:1e-6,prefix:"u"},
      {factor:1e-9,prefix:"n"},
      {factor:1e-12,prefix:"p"}
    ];
    var choice=table[table.length-1];
    for(var i=0;i<table.length;i++){
      if(abs>=table[i].factor){
        choice=table[i];
        break;
      }
    }
    var scaled=n/choice.factor;
    var txt=trimFixedNumber(scaled.toFixed(digits));
    return txt+" "+choice.prefix+baseUnit;
  }

  function formatScalarWithUnit(value,unit,opts){
    opts=opts||{};
    var n=Number(value);
    var unitText=String(unit||"").trim();
    var digits=isFinite(Number(opts.digits))?Math.max(0,Math.floor(Number(opts.digits))):3;
    if(!isFinite(n))return "--";
    if(!opts.disableEngineering&&(isSiemensUnit(unitText)||isOhmUnit(unitText))){
      var base=isSiemensUnit(unitText)?"S":"Ohm";
      var eng=formatEngineeringValue(n,base,digits);
      if(opts.valueOnly)return eng.split(" ")[0];
      return eng;
    }
    if(isSecondUnit(unitText)&&!opts.disableEngineering){
      var abs=Math.abs(n);
      var preferred=String(opts.preferredUnit||"").trim().toLowerCase();
      var factor=1;
      var displayUnit="s";
      var displayDigits=6;
      if(preferred==="ms"||preferred==="us"||preferred==="ns"||preferred==="ps"||preferred==="s"){
        displayUnit=preferred;
        factor=displayUnit==="ms"?1e3:displayUnit==="us"?1e6:displayUnit==="ns"?1e9:displayUnit==="ps"?1e12:1;
        displayDigits=displayUnit==="s"?6:3;
      } else {
        if(abs>=1e-3&&abs<1){factor=1e3;displayUnit="ms";displayDigits=3;}
        else if(abs>=1e-6&&abs<1e-3){factor=1e6;displayUnit="us";displayDigits=3;}
        else if(abs>=1e-9&&abs<1e-6){factor=1e9;displayUnit="ns";displayDigits=3;}
        else if(abs>0&&abs<1e-9){factor=1e12;displayUnit="ps";displayDigits=3;}
      }
      var scaled=(n*factor).toFixed(displayDigits);
      return opts.valueOnly?scaled:(scaled+" "+displayUnit);
    }
    var base=n.toFixed(digits);
    if(opts.valueOnly)return base;
    return unitText?(base+" "+unitText):base;
  }

  function cssv(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function useTheme(){
    function read(){
      return {
        tr:[cssv("--trace1"),cssv("--trace2"),cssv("--trace3"),cssv("--trace4"),cssv("--trace5"),cssv("--trace6")],
        dr:[cssv("--derived1"),cssv("--derived2"),cssv("--derived3"),cssv("--derived4"),cssv("--derived5"),cssv("--derived6")],
        mn:cssv("--mkr-n"),md:cssv("--mkr-d"),mp:cssv("--mkr-p"),
        accent:cssv("--accent"),muted:cssv("--muted"),dim:cssv("--dim"),text:cssv("--text"),
        bg:cssv("--bg"),card:cssv("--card"),border:cssv("--border"),
        tipBg:cssv("--tip-bg"),tipBd:cssv("--tip-bd"),grid:cssv("--grid"),
        dAlt:cssv("--da"),dAmp:cssv("--damp"),noiseTr:cssv("--noise-tr"),ip3C:cssv("--ip3-color"),
        refV:cssv("--refline"),refH:cssv("--refline-h"),cross:cssv("--crosshair")
      };
    }
    var state=useState(read);
    useEffect(function(){
      var mq=window.matchMedia("(prefers-color-scheme:dark)");
      var update=function(){requestAnimationFrame(function(){state[1](read());});};
      mq.addEventListener("change",update);
      return function(){mq.removeEventListener("change",update);};
    },[]);
    return state[0];
  }

  function MR(props){
    var value=props.value;
    var display=(typeof value==="object"&&value&&value.value!==undefined)?value.value.toLocaleString()+" "+(value.unit||""):String(value);
    return h("div",{style:{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid var(--border)"}},
      h("span",{style:{color:props.hlColor||"var(--muted)",fontSize:12}},props.label),
      h("span",{style:{color:props.vc||"var(--text)",fontSize:12,fontFamily:"monospace"}},display));
  }

  function Sec(props){
    return h("div",{style:{fontSize:11,textTransform:"uppercase",color:"var(--muted)",letterSpacing:1,marginBottom:8,marginTop:props.first?0:16}},props.children);
  }

  function SavedNoiseResultItem(props){
    var r=props.r,C=props.C;
    var params=r.parameters||{},values=r.values||{};
    return h("div",{style:{marginBottom:8,padding:"6px",border:"1px solid var(--border)",borderRadius:6,background:"var(--da)"}},
      h("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
        h("span",{style:{color:C.noiseTr,fontWeight:700,fontSize:11,flex:1}},r.traceLabel||r.sourceTraceName||"-"),
        h("button",{onClick:function(){props.onRemove(r.id);},style:{background:"none",border:"none",color:"#f55",cursor:"pointer",fontSize:13,padding:0,lineHeight:"1"}},"×")
      ),
      h(MR,{label:"Trace",value:r.traceLabel||r.sourceTraceName||r.sourceTraceId||"-",vc:C.noiseTr}),
      h(MR,{label:"Filter",value:params.filterLabel||params.filter||"-"}),
      h(MR,{label:"Peak",value:(values.peak||0).toFixed(2)+" dBm/Hz"}),
      h(MR,{label:"Avg",value:(values.avg||0).toFixed(2)+" dBm/Hz"}),
      h(MR,{label:"Min",value:(values.min||0).toFixed(2)+" dBm/Hz"})
    );
  }

  function SavedIP3ResultItem(props){
    var r=props.r,C=props.C,yU=props.yU;
    var params=r.parameters||{},values=r.values||{};
    var gain=params.gain;
    return h("div",{style:{marginBottom:8,padding:"6px",border:"1px solid var(--border)",borderRadius:6,background:"var(--da)"}},
      h("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
        h("span",{style:{color:C.ip3C,fontWeight:700,fontSize:11,flex:1}},fmtF(values.f1||0,true)+" / "+fmtF(values.f2||0,true)),
        h("button",{onClick:function(){props.onRemove(r.id);},style:{background:"none",border:"none",color:"#f55",cursor:"pointer",fontSize:13,padding:0,lineHeight:"1"}},"×")
      ),
      h(MR,{label:"Trace",value:r.traceLabel||r.sourceTraceName||r.sourceTraceId||"-",vc:C.ip3C}),
      h(MR,{label:"OIP3 avg",value:(values.oip3_avg||0).toFixed(2)+" "+yU}),
      h(MR,{label:"OIP3 lower",value:(values.oip3_l||0).toFixed(2)+" "+yU}),
      h(MR,{label:"OIP3 upper",value:(values.oip3_u||0).toFixed(2)+" "+yU}),
      gain!=null?h(MR,{label:"IIP3 avg",value:((values.oip3_avg||0)-gain).toFixed(2)+" "+yU}):null
    );
  }

  global.UIHelpers={
    fmtF:fmtF,
    formatScalarWithUnit:formatScalarWithUnit,
    useTheme:useTheme,
    MR:MR,
    Sec:Sec,
    SavedNoiseResultItem:SavedNoiseResultItem,
    SavedIP3ResultItem:SavedIP3ResultItem
  };
})(window);
