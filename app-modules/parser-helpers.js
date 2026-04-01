(function(global){
  var TM=global.TraceModel||{};
  var FSH=global.FileStoreHelpers||{};
  var TSH=global.TouchstoneMathHelpers||{};
  var makeTrace=TM.makeTrace||function(prefix,fileName,traceName){return {name:prefix+traceName,dn:prefix+traceName,fileName:fileName,data:[]};};
  var dedupeParsedTraces=FSH.dedupeParsedTraces||function(traces){return traces||[];};
  var normalizeTraceData=FSH.normalizeTraceData||function(data){return data||[];};
  var cx=TSH.cx||function(re,im){return {re:isFinite(re)?Number(re):0,im:isFinite(im)?Number(im):0};};
  var touchstonePairToComplex=TSH.touchstonePairToComplex||function(dataFormat,a,b){
    var fmt=String(dataFormat||"MA").trim().toUpperCase();
    if(fmt==="RI")return cx(a,b);
    if(fmt==="DB")return cx(Math.pow(10,Number(a)/20)*Math.cos(Number(b)*Math.PI/180),Math.pow(10,Number(a)/20)*Math.sin(Number(b)*Math.PI/180));
    var mag=Number(a),ang=Number(b)*Math.PI/180;
    return cx(mag*Math.cos(ang),mag*Math.sin(ang));
  };
  var buildMatrixOrder=TSH.buildMatrixOrder||function(portCount,matrixFormat){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    var fmt=String(matrixFormat||"full").trim().toLowerCase();
    var order=[];
    var row,col;
    if(fmt==="lower"){
      for(row=0;row<n;row++){
        for(col=0;col<=row;col++)order.push({row:row,col:col});
      }
      return order;
    }
    if(fmt==="upper"){
      for(row=0;row<n;row++){
        for(col=row;col<n;col++)order.push({row:row,col:col});
      }
      return order;
    }
    for(row=0;row<n;row++){
      for(col=0;col<n;col++)order.push({row:row,col:col});
    }
    return order;
  };
  var normalizeReferenceArray=TSH.normalizeReferenceArray||function(referenceOhms,portCount){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    if(Array.isArray(referenceOhms)){
      if(referenceOhms.length===1){
        var single=Number(referenceOhms[0]);
        if(!isFinite(single)||single<=0)return null;
        var rep=[];
        for(var i=0;i<n;i++)rep.push(single);
        return rep;
      }
      if(referenceOhms.length!==n)return null;
      var out=[];
      for(var j=0;j<referenceOhms.length;j++){
        var value=Number(referenceOhms[j]);
        if(!isFinite(value)||value<=0)return null;
        out.push(value);
      }
      return out;
    }
    var scalar=Number(referenceOhms);
    if(!isFinite(scalar)||scalar<=0)return null;
    var arr=[];
    for(var k=0;k<n;k++)arr.push(scalar);
    return arr;
  };
  var expandOrderedValuesToMatrix=TSH.expandOrderedValuesToMatrix||function(portCount,matrixFormat,values){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    var fmt=String(matrixFormat||"full").trim().toLowerCase();
    var order=buildMatrixOrder(n,fmt);
    if(!Array.isArray(values)||values.length!==order.length)return null;
    var matrix=[];
    for(var row=0;row<n;row++){
      var line=[];
      for(var col=0;col<n;col++)line.push(cx(0,0));
      matrix.push(line);
    }
    for(var i=0;i<order.length;i++){
      var entry=order[i];
      var value=values[i]||cx(0,0);
      matrix[entry.row][entry.col]=cx(value.re,value.im);
      if(fmt!=="full"&&entry.row!==entry.col)matrix[entry.col][entry.row]=cx(value.re,value.im);
    }
    return matrix;
  };
  var getTouchstoneFileBaseName=TSH.getTouchstoneFileBaseName||function(fileName){
    var name=String(fileName||"").replace(/^.*[\\/]/,"");
    return name.replace(/\.[^.]+$/,"")||name||"touchstone";
  };
  var _fc=0;

  function resetParserFileCounter(){
    _fc=0;
  }

  function syncParserFileCounter(files){
    var nextCount=Array.isArray(files)?files.length:0;
    if(nextCount>_fc)_fc=nextCount;
  }

  function nearestPoint(tr,freq,left,right){
    if(!tr||!tr.data||!tr.data.length||!isFinite(freq))return null;
    var data=tr.data;
    var lo=0,hi=data.length-1,mid;
    if(left!=null||right!=null){
      while(lo<data.length&&left!=null&&data[lo].freq<left)lo++;
      while(hi>=0&&right!=null&&data[hi].freq>right)hi--;
      if(lo>hi)return null;
    }
    while(lo<hi){
      mid=(lo+hi)>>1;
      if(data[mid].freq<freq)lo=mid+1; else hi=mid;
    }
    var idx=lo;
    var best=data[idx],bestDist=Math.abs(data[idx].freq-freq);
    if(idx>0){
      var p=data[idx-1],d=Math.abs(p.freq-freq);
      if(d<bestDist){best=p;bestDist=d;idx=idx-1;}
    }
    if(idx+1<data.length){
      var n=data[idx+1],d2=Math.abs(n.freq-freq);
      if(d2<bestDist){best=n;bestDist=d2;idx=idx+1;}
    }
    if(data.length>1){
      var prev=idx>0?data[idx-1]:null;
      var next=idx+1<data.length?data[idx+1]:null;
      var localStep=Math.min(
        prev?Math.abs(best.freq-prev.freq):Infinity,
        next?Math.abs(next.freq-best.freq):Infinity
      );
      if(!isFinite(localStep)||localStep<=0){
        var span=Math.abs(data[data.length-1].freq-data[0].freq);
        localStep=data.length>1?span/(data.length-1):Infinity;
      }
      var maxDist=isFinite(localStep)&&localStep>0?localStep*2.5:Infinity;
      if(bestDist>maxDist)return null;
    }
    return best;
  }

  function getFirstNonCommentLine(text){
    var lines=String(text||"").split(/\r?\n/);
    for(var i=0;i<lines.length;i++){
      var line=lines[i].replace(/^\uFEFF/,"").trim();
      if(!line)continue;
      if(line.charAt(0)==="!")continue;
      return line;
    }
    return "";
  }

  function isTouchstoneFileName(fileName){
    return /\.(s\d+p)$/i.test(String(fileName||""));
  }

  function getTouchstonePortCountFromFileName(fileName){
    var match=String(fileName||"").match(/\.s(\d+)p$/i);
    return match?Math.max(1,parseInt(match[1],10)):null;
  }

  function looksLikeTouchstoneText(text){
    var first=getFirstNonCommentLine(text);
    if(!first)return false;
    if(/^\[Version\]/i.test(first))return true;
    if(/^\[(Number of Ports|Reference|Network Data|Matrix Format|End)\]/i.test(first))return true;
    if(/^#/i.test(first))return true;
    return false;
  }

  function detectImportedFileFormat(text,fileName){
    if(isTouchstoneFileName(fileName))return "touchstone";
    if(looksLikeTouchstoneText(text))return "touchstone";
    return "rs-dat";
  }

  function parseRSDat(text,fileName){
    _fc++;
    var prefix=fileName.replace(/\.[^.]+$/,'')+" ";
    var lines=text.split(/\r?\n/),meta={},traces=[],cur=null,inData=false,hadTraceDecl=false;
    for(var i=0;i<lines.length;i++){
      var trimmed=lines[i].trim();
      if(!trimmed){if(inData)inData=false;continue;}
      var parts=trimmed.split(';').map(function(s){return s.trim();});
      if(inData&&cur){
        var nums=parts.filter(function(s){return s!=='';}).map(Number);
        if(nums.length>=2&&nums.every(function(n){return !isNaN(n);})){cur.data.push({freq:nums[0],amp:nums[1]});continue;}
        if(nums.length===1&&!isNaN(nums[0])){cur.data.push({amp:nums[0]});continue;}
        inData=false;
      }
      if(/^Trace$/i.test(parts[0])&&parts[1]&&/^\d+$/.test(parts[1])){
        hadTraceDecl=true;
        cur=makeTrace(prefix,fileName,"Tr"+parts[1],_fc);
        traces.push(cur);
        continue;
      }
      if(/^Trace Mode$/i.test(parts[0])&&cur){cur.mode=parts[1]||'';continue;}
      if(/^Detector$/i.test(parts[0])&&cur){cur.detector=parts[1]||'';continue;}
      if(/^Values$/i.test(parts[0])){
        inData=true;
        if(!cur){
          cur=makeTrace(prefix,fileName,"Tr"+(traces.length+1),_fc);
          traces.push(cur);
        }
        continue;
      }
      if(parts.length>=2&&/^[a-zA-Z]/.test(parts[0])){
        var nv=parseFloat(parts[1]);
        meta[parts[0]]=!isNaN(nv)&&parts[1]!==''?{value:nv,unit:parts[2]||''}:parts[1];
      }
    }
    if(traces.length===0&&!hadTraceDecl){
      cur=makeTrace(prefix,fileName,'Tr1',_fc);
      for(var j=0;j<lines.length;j++){
        var p=lines[j].trim().split(';').filter(function(s){return s.trim()!=='';}).map(Number);
        if(p.length>=2&&p.every(function(n){return !isNaN(n);})){cur.data.push({freq:p[0],amp:p[1]});}
        else if(p.length===1&&!isNaN(p[0])&&cur.data.length>0)cur.data.push({amp:p[0]});
      }
      if(cur.data.length>0)traces.push(cur);
    }
    traces=dedupeParsedTraces(traces.filter(function(t){return t.data.length>0;}));
    var sf=meta["Start"]&&meta["Start"].value||0;
    var ef=meta["Stop"]&&meta["Stop"].value||0;
    traces.forEach(function(tr){
      if(tr.data.length>0&&tr.data[0].freq===undefined){
        var n=tr.data.length;
        tr.data.forEach(function(d,idx){d.freq=sf+(idx/Math.max(n-1,1))*(ef-sf);});
      }
      tr.data=normalizeTraceData(tr.data);
      tr.units={
        x:(meta["StartXAxis"]&&meta["StartXAxis"].unit)||(meta["StopXAxis"]&&meta["StopXAxis"].unit)||(meta["Center Freq"]&&meta["Center Freq"].unit)||"Hz",
        y:(meta["Ref Level"]&&meta["Ref Level"].unit)||"dBm"
      };
    });
    traces=dedupeParsedTraces(traces.filter(function(t){return t.data&&t.data.length>0;}));
    return {format:"rs-dat",meta:meta,traces:traces};
  }

  function parseTouchstoneOptionLine(trimmed,state){
    var tokens=trimmed.slice(1).trim().split(/\s+/).filter(Boolean);
    if(!tokens.length)return;
    for(var i=0;i<tokens.length;i++){
      var token=tokens[i];
      var upper=token.toUpperCase();
      if(upper==="HZ"||upper==="KHZ"||upper==="MHZ"||upper==="GHZ"){
        state.freqUnit=upper==="HZ"?"Hz":upper==="KHZ"?"kHz":upper==="MHZ"?"MHz":"GHz";
        continue;
      }
      if(upper==="S"||upper==="Y"||upper==="Z"||upper==="G"||upper==="H"){
        state.parameterType=upper;
        continue;
      }
      if(upper==="DB"||upper==="MA"||upper==="RI"){
        state.dataFormat=upper;
        continue;
      }
      if(upper==="R"){
        i++;
        if(i>=tokens.length)throw new Error("Touchstone option line is missing a reference value after R.");
        var ref=Number(tokens[i]);
        if(!isFinite(ref)||ref<=0)throw new Error("Touchstone reference resistance must be a real positive number.");
        state.optionReference=ref;
        continue;
      }
      throw new Error("Unsupported Touchstone option token: "+token);
    }
    if(state.parameterType!=="S"){
      throw new Error("Unsupported Touchstone parameter type '"+state.parameterType+"'. Only S-parameters are supported.");
    }
  }

  function parseTouchstoneKeyword(trimmed,state){
    var match=trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    if(!match)return false;
    var keyword=match[1].trim().toLowerCase();
    var arg=match[2].trim();
    if(keyword==="version"){
      state.version=2;
      state.versionString=arg||"2.0";
      return true;
    }
    if(keyword==="number of ports"){
      var portCount=parseInt(arg,10);
      if(!isFinite(portCount)||portCount<=0)throw new Error("Touchstone [Number of Ports] must be a positive integer.");
      state.portCount=portCount;
      return true;
    }
    if(keyword==="reference"){
      var refs=arg.split(/\s+/).filter(Boolean).map(Number);
      if(!refs.length)throw new Error("Touchstone [Reference] must include at least one real positive value.");
      refs.forEach(function(value){
        if(!isFinite(value)||value<=0)throw new Error("Touchstone [Reference] values must be real positive numbers.");
      });
      state.referenceOhms=refs;
      return true;
    }
    if(keyword==="network data"){
      state.inNetworkData=true;
      return true;
    }
    if(keyword==="end"){
      state.ended=true;
      return true;
    }
    if(keyword==="matrix format"){
      var fmt=arg.trim().toLowerCase();
      if(fmt!=="full"&&fmt!=="upper"&&fmt!=="lower")throw new Error("Unsupported Touchstone matrix format '"+arg+"'.");
      state.matrixFormat=fmt;
      return true;
    }
    if(keyword==="number of frequencies"){
      var count=parseInt(arg,10);
      if(isFinite(count)&&count>0)state.expectedFrequencyCount=count;
      return true;
    }
    if(keyword==="mixed-mode order"){
      throw new Error("Mixed-mode Touchstone files are not supported yet.");
    }
    return true;
  }

  function extractNumbersFromLine(trimmed){
    if(!trimmed)return [];
    return trimmed.split(/\s+/).filter(Boolean).map(Number).filter(function(n){return isFinite(n);});
  }

  function parseTouchstone(text,fileName){
    _fc++;
    text=String(text||"");
    fileName=String(fileName||"touchstone.s2p");
    var lines=text.split(/\r?\n/);
    var comments=[];
    var state={
      version:1,
      versionString:"1.0",
      portCount:getTouchstonePortCountFromFileName(fileName),
      parameterType:"S",
      dataFormat:"MA",
      freqUnit:"GHz",
      optionReference:50,
      referenceOhms:null,
      matrixFormat:"full",
      inNetworkData:false,
      ended:false,
      sawOptionLine:false,
      expectedFrequencyCount:null
    };
    var dataTokens=[];
    for(var i=0;i<lines.length;i++){
      var raw=lines[i].replace(/^\uFEFF/,"");
      var commentIndex=raw.indexOf("!");
      if(commentIndex>=0){
        var comment=raw.slice(commentIndex+1).trim();
        if(comment)comments.push(comment);
        raw=raw.slice(0,commentIndex);
      }
      var trimmed=raw.trim();
      if(!trimmed||state.ended)continue;
      if(trimmed.charAt(0)==="["){
        parseTouchstoneKeyword(trimmed,state);
        continue;
      }
      if(trimmed.charAt(0)==="#"){
        parseTouchstoneOptionLine(trimmed,state);
        state.sawOptionLine=true;
        continue;
      }
      if(!state.sawOptionLine){
        throw new Error("Touchstone data encountered before the option line.");
      }
      dataTokens=dataTokens.concat(extractNumbersFromLine(trimmed));
    }
    if(!state.sawOptionLine)throw new Error("Touchstone file is missing an option line.");
    if(!state.portCount)throw new Error("Unable to determine the Touchstone port count.");
    if(getTouchstonePortCountFromFileName(fileName)&&getTouchstonePortCountFromFileName(fileName)!==state.portCount){
      throw new Error("Touchstone port count does not match the file extension.");
    }
    if(state.referenceOhms==null){
      state.referenceOhms=[state.optionReference];
    }
    state.referenceOhms=normalizeReferenceArray(state.referenceOhms,state.portCount);
    if(!state.referenceOhms)throw new Error("Unsupported Touchstone reference format. Provide one real positive reference or one real positive value per port.");
    var order=buildMatrixOrder(state.portCount,state.matrixFormat);
    var expectedPerSample=1+(order.length*2);
    if(!dataTokens.length){
      return {
        format:"touchstone",
        meta:{
          "Format":"Touchstone",
          "Version":state.versionString,
          "Port Count":state.portCount,
          "Parameter Type":state.parameterType,
          "Data Format":state.dataFormat,
          "Frequency Unit":state.freqUnit,
          "Reference":state.referenceOhms.length===1?state.referenceOhms[0]:(state.referenceOhms.join(", "))
        },
        touchstoneNetwork:{
          parameterType:state.parameterType,
          portCount:state.portCount,
          referenceOhms:state.referenceOhms.slice(),
          freqUnit:state.freqUnit,
          dataFormat:state.dataFormat,
          comments:comments.slice(),
          samples:[],
          matrixFormat:state.matrixFormat,
          version:state.version
        },
        traces:[]
      };
    }
    var samples=[];
    var idx=0;
    var freqScaleMap={Hz:1,kHz:1e3,MHz:1e6,GHz:1e9};
    while(idx<dataTokens.length){
      if(idx+expectedPerSample>dataTokens.length){
        throw new Error("Incomplete Touchstone network data at frequency sample "+(samples.length+1)+".");
      }
      var freqValue=dataTokens[idx++];
      var freqScale=freqScaleMap[state.freqUnit]||1e9;
      var freqHz=freqValue*freqScale;
      var values=[];
      for(var j=0;j<order.length;j++){
        var first=dataTokens[idx++];
        var second=dataTokens[idx++];
        values.push(touchstonePairToComplex(state.dataFormat,first,second));
      }
      var matrix=expandOrderedValuesToMatrix(state.portCount,state.matrixFormat,values);
      if(!matrix)throw new Error("Unable to reconstruct the Touchstone network matrix.");
      samples.push({freq:freqHz,sMatrix:matrix});
    }
    if(state.expectedFrequencyCount!=null&&state.expectedFrequencyCount!==samples.length){
      throw new Error("Touchstone [Number of Frequencies] does not match the parsed sample count.");
    }
    var meta={
      "Format":"Touchstone",
      "Version":state.versionString,
      "Port Count":state.portCount,
      "Parameter Type":state.parameterType,
      "Data Format":state.dataFormat,
      "Frequency Unit":state.freqUnit,
      "Reference":state.referenceOhms.length===1?state.referenceOhms[0]:(state.referenceOhms.join(", "))
    };
    return {
      format:"touchstone",
      meta:meta,
      touchstoneNetwork:{
        parameterType:state.parameterType,
        portCount:state.portCount,
        referenceOhms:state.referenceOhms.slice(),
        freqUnit:state.freqUnit,
        dataFormat:state.dataFormat,
        comments:comments.slice(),
        samples:samples,
        matrixFormat:state.matrixFormat,
        version:state.version
      },
      traces:[]
    };
  }

  function parseImportedFile(text,fileName){
    if(detectImportedFileFormat(text,fileName)==="touchstone"){
      return parseTouchstone(text,fileName);
    }
    return parseRSDat(text,fileName);
  }

  function parseMeasurementFile(text,fileName){
    return parseImportedFile(text,fileName);
  }

  global.ParserHelpers={
    resetParserFileCounter:resetParserFileCounter,
    syncParserFileCounter:syncParserFileCounter,
    nearestPoint:nearestPoint,
    parseRSDat:parseRSDat,
    getFirstNonCommentLine:getFirstNonCommentLine,
    isTouchstoneFileName:isTouchstoneFileName,
    getTouchstonePortCountFromFileName:getTouchstonePortCountFromFileName,
    looksLikeTouchstoneText:looksLikeTouchstoneText,
    detectImportedFileFormat:detectImportedFileFormat,
    parseTouchstone:parseTouchstone,
    parseImportedFile:parseImportedFile,
    parseMeasurementFile:parseMeasurementFile
  };
})(window);
