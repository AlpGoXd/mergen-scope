(function(global){
  var FSH=global.FileStoreHelpers||{};
  var TM=global.TraceModel||{};
  var AH=global.AnalysisHelpers||{};
  var normalizeTraceData=FSH.normalizeTraceData||function(data){return Array.isArray(data)?data:[];};
  var getTraceId=TM.getTraceId||function(trace){return trace?(trace.id||trace.name||null):null;};
  var getTraceLabel=TM.getTraceLabel||function(trace){return trace?(trace.dn||trace.name||trace.id||""):"";};
  var getTraceSourceIds=TM.getTraceSourceIds||function(trace){return Array.isArray(trace&&trace.sourceTraceIds)?trace.sourceTraceIds.filter(Boolean):[];};
  var ENBW=AH.ENBW||{};

  function cloneDataPoints(data){
    return normalizeTraceData(data).map(function(point){
      return {freq:Number(point.freq),amp:Number(point.amp)};
    }).filter(function(point){
      return isFinite(point.freq)&&isFinite(point.amp);
    });
  }

  function cloneNetworkSource(networkSource){
    if(!networkSource||typeof networkSource!=="object")return null;
    var next={};
    ["parentFileId","family","view","row","col","metric"].forEach(function(key){
      if(networkSource[key]!==undefined&&networkSource[key]!==null)next[key]=networkSource[key];
    });
    return Object.keys(next).length?next:null;
  }

  function cloneTraceForExport(trace,extra){
    if(!trace)return null;
    extra=extra||{};
    var networkSource=cloneNetworkSource(extra.networkSource||trace.networkSource||null);
    var metadata=extra.metadata&&typeof extra.metadata==="object"?Object.assign({},extra.metadata):{};
    var next={
      id:getTraceId(trace),
      name:trace.name||null,
      label:getTraceLabel(trace)||trace.name||trace.id||null,
      kind:trace.kind||"raw",
      exportCategory:extra.exportCategory||"trace",
      operationType:trace.operationType||null,
      sourceTraceIds:getTraceSourceIds(trace),
      sourceTraceName:extra.sourceTraceName||trace.sourceTraceName||null,
      fileId:trace.fileId!=null?trace.fileId:null,
      fileName:trace.fileName||trace.file||null,
      paneId:trace.paneId||null,
      mode:trace.mode||"",
      detector:trace.detector||"",
      units:trace.units&&typeof trace.units==="object"?Object.assign({},trace.units):{x:null,y:null},
      metadata:metadata,
      data:cloneDataPoints(trace.data)
    };
    if(networkSource){
      next.networkSource=networkSource;
      next.metadata.networkSource=networkSource;
    }
    return next;
  }

  function cloneResult(result){
    if(!result||typeof result!=="object")return null;
    var next=Object.assign({},result);
    next.parameters=result.parameters&&typeof result.parameters==="object"?Object.assign({},result.parameters):{};
    if(next.parameters.roles&&typeof next.parameters.roles==="object"){
      next.parameters.roles=Object.assign({},next.parameters.roles);
    }
    next.values=result.values&&typeof result.values==="object"?Object.assign({},result.values):{};
    return next;
  }

  function cloneMarkersForExport(markers){
    return (Array.isArray(markers)?markers:[]).map(function(marker,index){
      if(!marker||!marker.trace||!isFinite(marker.freq)||!isFinite(marker.amp))return null;
      return {
        id:marker.id!=null?marker.id:("marker-"+(index+1)),
        trace:marker.trace,
        freq:Number(marker.freq),
        amp:Number(marker.amp),
        type:marker.type||"normal",
        label:marker.label||null,
        refIdx:(marker.refIdx!==undefined&&marker.refIdx!==null&&isFinite(marker.refIdx))?Math.round(Number(marker.refIdx)):null
      };
    }).filter(Boolean);
  }

  function cloneReferenceLinesForExport(refLines){
    return (Array.isArray(refLines)?refLines:[]).map(function(line,index){
      if(!line||!isFinite(line.value)||(line.type!=="h"&&line.type!=="v"))return null;
      return {
        id:line.id!=null?line.id:("line-"+(index+1)),
        type:line.type,
        value:Number(line.value),
        label:line.label||null,
        paneId:line.paneId||null,
        groupId:line.groupId||null
      };
    }).filter(Boolean);
  }

  function sanitizeFileNameSegment(value){
    return String(value||"export")
      .trim()
      .replace(/[\\/:*?"<>|]+/g,"-")
      .replace(/\s+/g,"-")
      .replace(/-+/g,"-")
      .replace(/^-+|-+$/g,"")
      .toLowerCase()||"export";
  }

  function buildTimestampedDownloadName(prefix,extension){
    var now=new Date();
    function pad(value){
      return String(value).padStart(2,"0");
    }
    return sanitizeFileNameSegment(prefix)+"-"+now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+"-"+pad(now.getHours())+pad(now.getMinutes())+pad(now.getSeconds())+"."+String(extension||"txt").replace(/^\.+/,"");
  }

  function downloadBlobFile(blob,fileName){
    var urlApi=global.URL||global.webkitURL;
    if(!urlApi||!urlApi.createObjectURL)throw new Error("This browser does not support file downloads.");
    var link=global.document.createElement("a");
    var url=urlApi.createObjectURL(blob);
    link.href=url;
    link.download=fileName;
    link.style.display="none";
    global.document.body.appendChild(link);
    link.click();
    global.setTimeout(function(){
      if(link.parentNode)link.parentNode.removeChild(link);
      urlApi.revokeObjectURL(url);
    },0);
  }

  function downloadJsonFile(fileName,payload){
    downloadBlobFile(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),fileName);
  }

  function buildNoisePsdTraceExport(npsdStats,noiseFilter){
    if(!npsdStats||!npsdStats.src||!Array.isArray(npsdStats.data)||!npsdStats.data.length)return null;
    var src=npsdStats.src;
    var filterKey=(typeof noiseFilter==="string"&&ENBW[noiseFilter])?noiseFilter:"gaussian";
    var filterMeta=ENBW[filterKey]||{};
    var srcUnits=src.units&&typeof src.units==="object"?src.units:{x:null,y:null};
    var yUnit=srcUnits.y?String(srcUnits.y).trim():"";
    if(yUnit&&yUnit.indexOf("/Hz")===-1)yUnit=yUnit+"/Hz";
    if(!yUnit)yUnit="dB/Hz";
    return cloneTraceForExport({
      id:"analysis-noise-psd-"+String(src.id||src.name||"trace"),
      name:"analysis_noise_psd_"+String(src.name||src.id||"trace"),
      dn:(getTraceLabel(src)||src.name||"Trace")+" [Noise PSD]",
      kind:"analysis",
      operationType:"noise-psd",
      sourceTraceIds:getTraceSourceIds(src),
      sourceTraceName:src.name||null,
      fileId:src.fileId!=null?src.fileId:null,
      fileName:src.fileName||src.file||null,
      paneId:src.paneId||null,
      mode:src.mode||"",
      detector:src.detector||"",
      units:{x:srcUnits.x||"Hz",y:yUnit},
      data:npsdStats.data,
      networkSource:src.networkSource||null
    },{
      exportCategory:"analysis-trace",
      sourceTraceName:src.name||null,
      metadata:{
        filter:filterKey,
        filterLabel:filterMeta.label||filterKey,
        rbw:isFinite(npsdStats.rbw)?Number(npsdStats.rbw):null,
        peak:npsdStats.peak&&isFinite(npsdStats.peak.amp)?Number(npsdStats.peak.amp):null,
        min:npsdStats.min&&isFinite(npsdStats.min.amp)?Number(npsdStats.min.amp):null,
        average:isFinite(npsdStats.avg)?Number(npsdStats.avg):null
      }
    });
  }

  function buildTraceExportPackage(options){
    options=options||{};
    var traces=(options.allTr||[]).map(function(trace){
      return cloneTraceForExport(trace,{
        exportCategory:"trace",
        metadata:{
          visible:!!(options.vis&&trace&&trace.name&&options.vis[trace.name]),
          selected:!!(options.selectedTraceName&&trace&&trace.name===options.selectedTraceName),
          paneId:trace&&trace.name&&options.tracePaneMap?options.tracePaneMap[trace.name]||trace.paneId||null:trace&&trace.paneId||null
        }
      });
    }).filter(Boolean);
    var analysisTraces=[];
    var noiseTrace=buildNoisePsdTraceExport(options.npsdStats,options.noiseFilter);
    if(noiseTrace)analysisTraces.push(noiseTrace);
    return {
      format:"mergen-scope-data-export",
      version:2,
      exportedAt:options.exportedAt||new Date().toISOString(),
      traceCount:traces.length,
      analysisTraceCount:analysisTraces.length,
      _commentSavedNoiseResults:"// HERE ARE NOISE MEASUREMENTS",
      savedNoiseResults:(options.savedNoiseResults||[]).map(cloneResult).filter(Boolean),
      _commentSavedIP3Results:"// HERE ITS IP3 MEASUREMENTS",
      savedIP3Results:(options.savedIP3Results||[]).map(cloneResult).filter(Boolean),
      _commentMarkers:"// HERE MARKERS",
      markers:cloneMarkersForExport(options.markers),
      _commentReferenceLines:"// HERE REFERENCE LINES",
      referenceLines:cloneReferenceLinesForExport(options.referenceLines),
      context:{
        paneCount:Array.isArray(options.panes)?options.panes.length:null,
        activePaneId:options.activePaneId||null,
        selectedTraceName:options.selectedTraceName||null,
        visibleTraceNames:(options.allTr||[]).filter(function(trace){
          return !!(trace&&trace.name&&options.vis&&options.vis[trace.name]);
        }).map(function(trace){return trace.name;}),
        hiddenTraceNames:(options.allTr||[]).filter(function(trace){
          return !!(trace&&trace.name&&options.vis&&!options.vis[trace.name]);
        }).map(function(trace){return trace.name;}),
        noiseSource:options.noiseSource||null,
        noiseFilter:options.noiseFilter||null
      },
      _commentTraceData:"// TRACE DATA STARTS HERE",
      traces:traces,
      analysisTraces:analysisTraces
    };
  }

  function pickExportBackgroundColor(element, fallbackColor){
    if(fallbackColor)return String(fallbackColor);
    var node=element;
    while(node&&node.nodeType===1){
      var computed=global.getComputedStyle?global.getComputedStyle(node):null;
      var color=computed?computed.backgroundColor:"";
      if(color&&color!=="transparent"&&color!=="rgba(0, 0, 0, 0)"&&color!=="rgba(0,0,0,0)")return color;
      node=node.parentElement||null;
    }
    return "#ffffff";
  }

  function escapeXml(value){
    return String(value==null?"":value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&apos;");
  }

  function inlineComputedStyles(sourceNode,targetNode){
    if(!sourceNode||!targetNode||sourceNode.nodeType!==1||targetNode.nodeType!==1)return;
    var computed=global.getComputedStyle?global.getComputedStyle(sourceNode):null;
    if(computed){
      var styleText="";
      for(var i=0;i<computed.length;i++){
        var prop=computed[i];
        styleText+=prop+":"+computed.getPropertyValue(prop)+";";
      }
      if(styleText)targetNode.setAttribute("style",styleText);
    }
    var tagName=sourceNode.tagName?sourceNode.tagName.toLowerCase():"";
    if(tagName==="input"||tagName==="textarea"||tagName==="select"){
      targetNode.setAttribute("value",sourceNode.value||"");
    }
    if(tagName==="svg"){
      if(!targetNode.getAttribute("xmlns"))targetNode.setAttribute("xmlns","http://www.w3.org/2000/svg");
      if(!targetNode.getAttribute("xmlns:xlink"))targetNode.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");
    }
    var sourceChildren=sourceNode.childNodes||[];
    var targetChildren=targetNode.childNodes||[];
    for(var j=0;j<sourceChildren.length;j++){
      inlineComputedStyles(sourceChildren[j],targetChildren[j]);
    }
  }

  function cloneElementWithInlineStyles(element){
    var clone=element.cloneNode(true);
    inlineComputedStyles(element,clone);
    clone.setAttribute("xmlns","http://www.w3.org/1999/xhtml");
    return clone;
  }

  function buildElementExportSnapshot(element,options){
    if(!element)throw new Error("Nothing is available to export.");
    var rect=element.getBoundingClientRect();
    var width=Math.max(1,Math.round(rect.width));
    var height=Math.max(1,Math.round(rect.height));
    if(!(width>0&&height>0))throw new Error("The chart is not ready to export yet.");
    var serializer=new XMLSerializer();
    var clone=cloneElementWithInlineStyles(element);
    var body=serializer.serializeToString(clone);
    var title=escapeXml(options&&options.title?options.title:"Mergen Scope Chart Export");
    var markup='<?xml version="1.0" encoding="UTF-8"?>'+
      '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+" "+height+'">'+
      "<title>"+title+"</title>"+
      '<foreignObject x="0" y="0" width="100%" height="100%">'+body+"</foreignObject></svg>";
    return {markup:markup,width:width,height:height};
  }

  function exportElementAsSvgFile(element,fileName,options){
    var snapshot=buildElementExportSnapshot(element,options);
    downloadBlobFile(new Blob([snapshot.markup],{type:"image/svg+xml;charset=utf-8"}),fileName);
  }

  function exportElementAsPngFile(element,fileName,options){
    var snapshot=buildElementExportSnapshot(element,options);
    var scale=Math.max(1,Math.round(options&&options.scale?options.scale:2));
    return new Promise(function(resolve,reject){
      var blob=new Blob([snapshot.markup],{type:"image/svg+xml;charset=utf-8"});
      var urlApi=global.URL||global.webkitURL;
      if(!urlApi||!urlApi.createObjectURL){
        reject(new Error("This browser does not support image export."));
        return;
      }
      var url=urlApi.createObjectURL(blob);
      var img=new Image();
      img.onload=function(){
        try{
          var canvas=global.document.createElement("canvas");
          canvas.width=snapshot.width*scale;
          canvas.height=snapshot.height*scale;
          var ctx=canvas.getContext("2d");
          if(!ctx)throw new Error("Unable to create a canvas export context.");
          ctx.imageSmoothingEnabled=true;
          if("imageSmoothingQuality" in ctx)ctx.imageSmoothingQuality="high";
          ctx.setTransform(scale,0,0,scale,0,0);
          ctx.fillStyle=pickExportBackgroundColor(element,options&&options.backgroundColor);
          ctx.fillRect(0,0,snapshot.width,snapshot.height);
          ctx.drawImage(img,0,0,snapshot.width,snapshot.height);
          canvas.toBlob(function(pngBlob){
            urlApi.revokeObjectURL(url);
            if(!pngBlob){
              reject(new Error("Unable to render a PNG export."));
              return;
            }
            try{
              downloadBlobFile(pngBlob,fileName);
              resolve();
            }catch(err){
              reject(err);
            }
          },"image/png");
        }catch(err){
          urlApi.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror=function(){
        urlApi.revokeObjectURL(url);
        reject(new Error("Unable to render the chart for PNG export."));
      };
      img.src=url;
    });
  }

  function exportSvgMarkupAsPngFile(markup,width,height,fileName,options){
    var scale=Math.max(1,Math.round(options&&options.scale?options.scale:2));
    return new Promise(function(resolve,reject){
      var blob=new Blob([String(markup||"")],{type:"image/svg+xml;charset=utf-8"});
      var urlApi=global.URL||global.webkitURL;
      if(!urlApi||!urlApi.createObjectURL){
        reject(new Error("This browser does not support image export."));
        return;
      }
      var url=urlApi.createObjectURL(blob);
      var img=new Image();
      img.onload=function(){
        try{
          var canvas=global.document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(width||1))*scale;
          canvas.height=Math.max(1,Math.round(height||1))*scale;
          var ctx=canvas.getContext("2d");
          if(!ctx)throw new Error("Unable to create a canvas export context.");
          ctx.imageSmoothingEnabled=true;
          if("imageSmoothingQuality" in ctx)ctx.imageSmoothingQuality="high";
          ctx.setTransform(scale,0,0,scale,0,0);
          ctx.fillStyle=(options&&options.backgroundColor)||"#ffffff";
          ctx.fillRect(0,0,Math.max(1,Math.round(width||1)),Math.max(1,Math.round(height||1)));
          ctx.drawImage(img,0,0,Math.max(1,Math.round(width||1)),Math.max(1,Math.round(height||1)));
          canvas.toBlob(function(pngBlob){
            urlApi.revokeObjectURL(url);
            if(!pngBlob){
              reject(new Error("Unable to render a PNG export."));
              return;
            }
            try{
              downloadBlobFile(pngBlob,fileName);
              resolve();
            }catch(err){
              reject(err);
            }
          },"image/png");
        }catch(err){
          urlApi.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror=function(){
        urlApi.revokeObjectURL(url);
        reject(new Error("Unable to render the chart for PNG export."));
      };
      img.src=url;
    });
  }

  global.ExportHelpers={
    cloneTraceForExport:cloneTraceForExport,
    buildNoisePsdTraceExport:buildNoisePsdTraceExport,
    buildTraceExportPackage:buildTraceExportPackage,
    cloneMarkersForExport:cloneMarkersForExport,
    cloneReferenceLinesForExport:cloneReferenceLinesForExport,
    sanitizeFileNameSegment:sanitizeFileNameSegment,
    buildTimestampedDownloadName:buildTimestampedDownloadName,
    downloadBlobFile:downloadBlobFile,
    downloadJsonFile:downloadJsonFile,
    exportElementAsSvgFile:exportElementAsSvgFile,
    exportElementAsPngFile:exportElementAsPngFile,
    exportSvgMarkupAsPngFile:exportSvgMarkupAsPngFile
  };
})(window);
