(function(global){
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;

  function ImportWizardModal(props){
    var wizard = props.wizard;
    var suggested = wizard.suggestedConfig || {};
    var lines = wizard.previewLines || [];

    var _d = useState(suggested.delimiter||","), delimiter = _d[0], setDelimiter = _d[1];
    var _s = useState(suggested.skipRows||0), skipRows = _s[0], setSkipRows = _s[1];
    var _x = useState(suggested.xCol||0), xCol = _x[0], setXCol = _x[1];
    var _y = useState(suggested.yCols||[1]), yCols = _y[0], setYCols = _y[1];
    var _dom = useState(suggested.domain||"time"), domain = _dom[0], setDomain = _dom[1];

    var cols = useMemo(function(){
      if(lines.length===0) return [];
      var s = lines[0].split(delimiter);
      return s.map(function(_,i){return i;});
    },[lines, delimiter]);

    var headers = useMemo(function(){
      if(skipRows>0 && lines.length>=skipRows){
        return lines[skipRows-1].split(delimiter).map(function(s){return s.trim()});
      }
      return cols.map(function(c){return "Col "+c;});
    }, [lines, skipRows, delimiter, cols]);

    var handleConfirm = function(){
      props.onConfirm(wizard.fileName, {
        delimiter: delimiter, skipRows: skipRows, xCol: Number(xCol), yCols: yCols.map(Number),
        xMult:1, yMult:1, domain:domain, headers:headers
      });
    };

    var modalStyle = {
      position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.8)", zIndex:9999,
      display:"flex", alignItems:"center", justifyContent:"center"
    };
    var innerStyle = {
      background:"var(--card)", padding:24, borderRadius:8, width:600, border:"1px solid var(--border)",
      color:"var(--text)"
    };
    var selectStyle = { background:"var(--bg)", color:"var(--text)", border:"1px solid var(--border)", padding:4, marginLeft:8 };

    return h("div", {style:modalStyle},
      h("div", {style:innerStyle},
        h("h2", {style:{marginTop:0}}, "Import Wizard: " + wizard.fileName),
        h("div", {style:{display:"flex", flexDirection:"column", gap:12}},
          h("div", null,
            h("label", null, "Domain:"),
            h("select", {value:domain, onChange:function(e){setDomain(e.target.value);}, style:selectStyle},
               h("option", {value:"time"}, "Oscilloscope Time-Domain"),
               h("option", {value:"frequency"}, "Frequency Spectrum")
            )
          ),
          h("div", null,
            h("label", null, "Delimiter:"),
            h("select", {value:delimiter, onChange:function(e){setDelimiter(e.target.value);}, style:selectStyle},
              h("option", {value:","}, "Comma (,)"),
              h("option", {value:";"}, "Semicolon (;)"),
              h("option", {value:"\t"}, "Tab")
            )
          ),
          h("div", null,
            h("label", null, "Skip Headers (Rows): "),
            h("input", {type:"number", min:0, value:skipRows, onChange:function(e){setSkipRows(Number(e.target.value))}, style:selectStyle})
          ),
          h("div", null,
            h("label", null, "X-Axis Column: "),
            h("select", {value:xCol, onChange:function(e){setXCol(Number(e.target.value))}, style:selectStyle},
              cols.map(function(c){ return h("option", {key:c, value:c}, headers[c]||("Col "+c)); })
            )
          ),
          h("div", null,
            h("label", null, "Y-Axis Column(s) (Cmd/Ctrl click for multiple): "),
            h("select", {multiple:true, value:yCols, onChange:function(e){
              var opts = e.target.options; var val=[]; 
              for(var i=0;i<opts.length;i++){ if(opts[i].selected) val.push(Number(opts[i].value)); }
              setYCols(val);
            }, style:Object.assign({}, selectStyle, {height:100, display:"block", marginTop:4})},
              cols.filter(function(c){return c!==xCol;}).map(function(c){ return h("option", {key:c, value:c}, headers[c]||("Col "+c)); })
            )
          ),
          h("div", {style:{marginTop:16, display:"flex", justifyContent:"flex-end", gap:12}},
             h("button", {onClick:function(){props.onCancel(wizard.fileName);}, style:{padding:"6px 16px", cursor:"pointer", background:"var(--bg)", color:"var(--text)", border:"1px solid var(--border)"}}, "Cancel"),
             h("button", {onClick:handleConfirm, style:{padding:"6px 16px", cursor:"pointer", background:"var(--accent)", color:"#fff", border:"none"}}, "Import File")
          )
        )
      )
    );
  }

  global.ImportWizardComponents = {
    ImportWizardModal: ImportWizardModal
  };

})(window);
