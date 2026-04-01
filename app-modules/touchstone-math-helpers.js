(function(global){
  function cx(re,im){
    return {
      re:isFinite(re)?Number(re):0,
      im:isFinite(im)?Number(im):0
    };
  }

  function cloneComplex(z){
    return cx(z&&z.re,z&&z.im);
  }

  function add(a,b){
    return cx((a?a.re:0)+(b?b.re:0),(a?a.im:0)+(b?b.im:0));
  }

  function sub(a,b){
    return cx((a?a.re:0)-(b?b.re:0),(a?a.im:0)-(b?b.im:0));
  }

  function mul(a,b){
    a=a||cx(0,0);
    b=b||cx(0,0);
    return cx(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
  }

  function div(a,b){
    a=a||cx(0,0);
    b=b||cx(0,0);
    var denom=b.re*b.re+b.im*b.im;
    if(!isFinite(denom)||denom===0)return null;
    return cx((a.re*b.re+a.im*b.im)/denom,(a.im*b.re-a.re*b.im)/denom);
  }

  function conj(a){
    a=a||cx(0,0);
    return cx(a.re,-a.im);
  }

  function abs(a){
    a=a||cx(0,0);
    return Math.hypot(a.re,a.im);
  }

  function abs2(a){
    a=a||cx(0,0);
    return a.re*a.re+a.im*a.im;
  }

  function fromPolar(magnitude,angleDeg){
    var mag=isFinite(magnitude)?Number(magnitude):0;
    var theta=(isFinite(angleDeg)?Number(angleDeg):0)*Math.PI/180;
    return cx(mag*Math.cos(theta),mag*Math.sin(theta));
  }

  function fromDbAngle(db,angleDeg){
    var mag=Math.pow(10,Number(db)/20);
    if(!isFinite(mag))mag=0;
    return fromPolar(mag,angleDeg);
  }

  function normalizeMatrixFormat(matrixFormat){
    var fmt=String(matrixFormat||"full").trim().toLowerCase();
    if(fmt==="lower"||fmt==="upper"||fmt==="full")return fmt;
    return "full";
  }

  function buildMatrixOrder(portCount,matrixFormat){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    var fmt=normalizeMatrixFormat(matrixFormat);
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
  }

  function makeComplexMatrix(portCount){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    var matrix=[];
    for(var row=0;row<n;row++){
      var line=[];
      for(var col=0;col<n;col++)line.push(cx(0,0));
      matrix.push(line);
    }
    return matrix;
  }

  function cloneComplexMatrix(matrix){
    return (Array.isArray(matrix)?matrix:[]).map(function(row){
      return (Array.isArray(row)?row:[]).map(cloneComplex);
    });
  }

  function matrixIdentity(portCount){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    var matrix=makeComplexMatrix(n);
    for(var i=0;i<n;i++)matrix[i][i]=cx(1,0);
    return matrix;
  }

  function matrixAdd(a,b){
    var n=(a&&a.length)||0;
    var out=makeComplexMatrix(n);
    for(var row=0;row<n;row++){
      for(var col=0;col<n;col++)out[row][col]=add(a[row][col],b[row][col]);
    }
    return out;
  }

  function matrixSubtract(a,b){
    var n=(a&&a.length)||0;
    var out=makeComplexMatrix(n);
    for(var row=0;row<n;row++){
      for(var col=0;col<n;col++)out[row][col]=sub(a[row][col],b[row][col]);
    }
    return out;
  }

  function matrixMultiply(a,b){
    var n=(a&&a.length)||0;
    var out=makeComplexMatrix(n);
    for(var row=0;row<n;row++){
      for(var col=0;col<n;col++){
        var sum=cx(0,0);
        for(var k=0;k<n;k++){
          sum=add(sum,mul(a[row][k],b[k][col]));
        }
        out[row][col]=sum;
      }
    }
    return out;
  }

  function matrixScaleDiagonal(referenceOhms,transform){
    var refs=Array.isArray(referenceOhms)?referenceOhms.map(Number):normalizeReferenceArray(referenceOhms,1);
    if(!refs||!refs.length)return null;
    for(var i=0;i<refs.length;i++){
      if(!isFinite(refs[i])||refs[i]<=0)return null;
    }
    var matrix=makeComplexMatrix(refs.length);
    for(var i=0;i<refs.length;i++){
      var value=transform(refs[i],i);
      if(value==null)return null;
      matrix[i][i]=value;
    }
    return matrix;
  }

  function matrixInverse(matrix){
    var n=(matrix&&matrix.length)||0;
    if(!n)return null;
    var aug=[];
    for(var row=0;row<n;row++){
      var line=[];
      for(var col=0;col<n;col++)line.push(cloneComplex(matrix[row][col]));
      for(var j=0;j<n;j++)line.push(j===row?cx(1,0):cx(0,0));
      aug.push(line);
    }
    for(var pivotCol=0;pivotCol<n;pivotCol++){
      var pivotRow=pivotCol;
      var pivotMag=abs(aug[pivotRow][pivotCol]);
      for(var row2=pivotCol+1;row2<n;row2++){
        var mag=abs(aug[row2][pivotCol]);
        if(mag>pivotMag){
          pivotMag=mag;
          pivotRow=row2;
        }
      }
      if(!isFinite(pivotMag)||pivotMag<=1e-15)return null;
      if(pivotRow!==pivotCol){
        var tmp=aug[pivotCol];
        aug[pivotCol]=aug[pivotRow];
        aug[pivotRow]=tmp;
      }
      var pivot=aug[pivotCol][pivotCol];
      for(var col2=0;col2<2*n;col2++){
        var normalized=div(aug[pivotCol][col2],pivot);
        if(normalized==null)return null;
        aug[pivotCol][col2]=normalized;
      }
      for(var row3=0;row3<n;row3++){
        if(row3===pivotCol)continue;
        var factor=aug[row3][pivotCol];
        if(abs(factor)<=1e-15){
          aug[row3][pivotCol]=cx(0,0);
          continue;
        }
        for(var col3=0;col3<2*n;col3++){
          aug[row3][col3]=sub(aug[row3][col3],mul(factor,aug[pivotCol][col3]));
        }
      }
    }
    var inverse=[];
    for(var row4=0;row4<n;row4++){
      inverse.push(aug[row4].slice(n,2*n).map(cloneComplex));
    }
    return inverse;
  }

  function normalizeReferenceArray(referenceOhms,portCount){
    var hasPortCount=portCount!=null&&isFinite(Number(portCount))&&Number(portCount)>0;
    var n=hasPortCount?Math.max(1,Math.floor(Number(portCount)||0)):0;
    if(Array.isArray(referenceOhms)){
      var refs=referenceOhms.map(Number);
      if(!refs.length)return null;
      for(var idx=0;idx<refs.length;idx++){
        if(!isFinite(refs[idx])||refs[idx]<=0)return null;
      }
      if(hasPortCount&&refs.length===1){
        var rep=[];
        for(var j=0;j<n;j++)rep.push(refs[0]);
        return rep;
      }
      if(hasPortCount&&refs.length!==n)return null;
      return refs;
    }
    var scalar=Number(referenceOhms);
    if(!isFinite(scalar)||scalar<=0)return null;
    if(!hasPortCount)return [scalar];
    var out=[];
    for(var j=0;j<n;j++)out.push(scalar);
    return out;
  }

  function expandOrderedValuesToMatrix(portCount,matrixFormat,values){
    var n=Math.max(1,Math.floor(Number(portCount)||0));
    var fmt=normalizeMatrixFormat(matrixFormat);
    var order=buildMatrixOrder(n,fmt);
    if(!Array.isArray(values)||values.length!==order.length)return null;
    var matrix=makeComplexMatrix(n);
    for(var i=0;i<order.length;i++){
      var entry=order[i];
      var value=cloneComplex(values[i]);
      matrix[entry.row][entry.col]=value;
      if(fmt!=="full"&&entry.row!==entry.col)matrix[entry.col][entry.row]=cloneComplex(value);
    }
    return matrix;
  }

  function touchstonePairToComplex(dataFormat,a,b){
    var fmt=String(dataFormat||"MA").trim().toUpperCase();
    if(fmt==="RI")return cx(a,b);
    if(fmt==="DB")return fromDbAngle(a,b);
    return fromPolar(a,b);
  }

  function convertSMatrixToZMatrix(sMatrix,referenceOhms){
    var n=(sMatrix&&sMatrix.length)||0;
    if(!n)return null;
    var refs=normalizeReferenceArray(referenceOhms,n);
    if(!refs)return null;
    var identity=matrixIdentity(n);
    var plus=matrixAdd(identity,sMatrix);
    var minus=matrixSubtract(identity,sMatrix);
    var minusInv=matrixInverse(minus);
    if(!minusInv)return null;
    var left=matrixScaleDiagonal(refs,function(value){
      return cx(Math.sqrt(value),0);
    });
    if(!left)return null;
    return matrixMultiply(matrixMultiply(left,matrixMultiply(plus,minusInv)),left);
  }

  function convertSMatrixToYMatrix(sMatrix,referenceOhms){
    var n=(sMatrix&&sMatrix.length)||0;
    if(!n)return null;
    var refs=normalizeReferenceArray(referenceOhms,n);
    if(!refs)return null;
    var identity=matrixIdentity(n);
    var minus=matrixSubtract(identity,sMatrix);
    var plus=matrixAdd(identity,sMatrix);
    var plusInv=matrixInverse(plus);
    if(!plusInv)return null;
    var invLeft=matrixScaleDiagonal(refs,function(value){
      return cx(1/Math.sqrt(value),0);
    });
    if(!invLeft)return null;
    return matrixMultiply(matrixMultiply(invLeft,matrixMultiply(minus,plusInv)),invLeft);
  }

  function computeTwoPortStability(sMatrix){
    if(!Array.isArray(sMatrix)||sMatrix.length!==2||!Array.isArray(sMatrix[0])||!Array.isArray(sMatrix[1]))return null;
    var s11=sMatrix[0][0]||cx(0,0);
    var s12=sMatrix[0][1]||cx(0,0);
    var s21=sMatrix[1][0]||cx(0,0);
    var s22=sMatrix[1][1]||cx(0,0);
    var delta=sub(mul(s11,s22),mul(s12,s21));
    var deltaAbs=abs(delta);
    var s12s21=mul(s12,s21);
    var s12s21Abs=abs(s12s21);
    var kNumerator=1-abs2(s11)-abs2(s22)+deltaAbs*deltaAbs;
    var kDenominator=2*s12s21Abs;
    var kFactor;
    if(kDenominator===0)kFactor=kNumerator>=0?Infinity:-Infinity;
    else kFactor=kNumerator/kDenominator;
    var deltaConj=conj(delta);
    var mu1Numerator=1-abs2(s11);
    var mu1Denominator=abs(sub(s22,mul(deltaConj,s11)))+s12s21Abs;
    var mu1=mu1Denominator===0?((mu1Numerator>=0)?Infinity:-Infinity):(mu1Numerator/mu1Denominator);
    var mu2Numerator=1-abs2(s22);
    var mu2Denominator=abs(sub(s11,mul(deltaConj,s22)))+s12s21Abs;
    var mu2=mu2Denominator===0?((mu2Numerator>=0)?Infinity:-Infinity):(mu2Numerator/mu2Denominator);
    return {
      delta:delta,
      deltaAbs:deltaAbs,
      kFactor:kFactor,
      mu1:mu1,
      mu2:mu2,
      unconditional:!!(kFactor>1&&deltaAbs<1)
    };
  }

  function getTouchstoneFileBaseName(fileName){
    var name=String(fileName||"").replace(/^.*[\\/]/,"");
    return name.replace(/\.[^.]+$/,"")||name||"touchstone";
  }

  function buildTouchstoneTraceLabel(fileName,family,row,col,view){
    var base=getTouchstoneFileBaseName(fileName);
    var cell=String(family||"").toUpperCase()+(isFinite(row)?String(row):"")+(isFinite(col)?String(col):"");
    var suffix=String(view||"").trim();
    return [base,cell,suffix].filter(function(part){return !!String(part).trim();}).join(" ");
  }

  global.TouchstoneMathHelpers={
    cx:cx,
    cloneComplex:cloneComplex,
    add:add,
    sub:sub,
    mul:mul,
    div:div,
    conj:conj,
    abs:abs,
    abs2:abs2,
    fromPolar:fromPolar,
    fromDbAngle:fromDbAngle,
    normalizeMatrixFormat:normalizeMatrixFormat,
    buildMatrixOrder:buildMatrixOrder,
    makeComplexMatrix:makeComplexMatrix,
    cloneComplexMatrix:cloneComplexMatrix,
    matrixIdentity:matrixIdentity,
    matrixAdd:matrixAdd,
    matrixSubtract:matrixSubtract,
    matrixMultiply:matrixMultiply,
    matrixScaleDiagonal:matrixScaleDiagonal,
    matrixInverse:matrixInverse,
    normalizeReferenceArray:normalizeReferenceArray,
    expandOrderedValuesToMatrix:expandOrderedValuesToMatrix,
    touchstonePairToComplex:touchstonePairToComplex,
    convertSMatrixToZMatrix:convertSMatrixToZMatrix,
    convertSMatrixToYMatrix:convertSMatrixToYMatrix,
    computeTwoPortStability:computeTwoPortStability,
    getTouchstoneFileBaseName:getTouchstoneFileBaseName,
    buildTouchstoneTraceLabel:buildTouchstoneTraceLabel
  };
})(window);
