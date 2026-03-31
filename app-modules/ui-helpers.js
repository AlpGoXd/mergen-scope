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

  function cssv(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function useTheme(){
    function read(){
      return {
        tr:[cssv("--trace1"),cssv("--trace2"),cssv("--trace3"),cssv("--trace4"),cssv("--trace5"),cssv("--trace6")],
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
    useTheme:useTheme,
    MR:MR,
    Sec:Sec,
    SavedNoiseResultItem:SavedNoiseResultItem,
    SavedIP3ResultItem:SavedIP3ResultItem
  };
})(window);
