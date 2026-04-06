(function(global){
  function guessColumnDomain(headerName) {
    var h = String(headerName || "").toLowerCase().trim();
    if (h.indexOf("freq") !== -1 || h.indexOf("hz") !== -1 || h.indexOf("mhz") !== -1) return "frequency";
    if (h.indexOf("time") !== -1 || h.indexOf("s") === 0 || h.indexOf("ms") === 0 || h.indexOf("ns") === 0 || h === "t") return "time";
    return null;
  }

  function peekFileText(text) {
    if (!text) return { lines: [], isBinary: false };
    var asStr = String(text);
    // Rough binary check
    if (asStr.indexOf('\0') !== -1) return { lines: [], isBinary: true };
    
    var lines = asStr.split(/\r?\n/);
    var preview = lines.slice(0, 100); 
    return { lines: preview, isBinary: false };
  }

  function classify(fileText, fileName) {
    var ext = String(fileName || "").split('.').pop().toLowerCase();
    var isTouchstone = /^s\d+p$/.test(ext);
    
    if (isTouchstone) {
      return {
        domain: "network",
        format: "touchstone",
        confidence: 1.0
      };
    }

    var peek = peekFileText(fileText);
    if (peek.isBinary) {
      return {
        domain: "unknown",
        format: "binary",
        confidence: 1.0
      };
    }

    // Default heuristics
    var likelyDomain = "frequency"; // mergen-scope defaults to spectrum
    var conf = 0.5;

    // Fast RS-DAT detector
    if (peek.lines.length > 0 && peek.lines[0].indexOf("R&S") !== -1) {
      return {
        domain: "frequency",
        format: "rs-dat",
        confidence: 0.95
      };
    }

    // Attempt to guess via headers in CSV-like structures
    for (var i=0; i < Math.min(20, peek.lines.length); i++) {
        var line = peek.lines[i];
        var parts = line.split(/[;,\t]/);
        if (parts.length >= 2) {
            var col0Domain = guessColumnDomain(parts[0]);
            if (col0Domain) {
                likelyDomain = col0Domain;
                conf = 0.8;
                break;
            }
        }
    }

    // Distinguish generic tabular vs known DAT 
    // We treat generic data uniformly.
    var isTabular = (ext === "csv" || ext === "txt" || ext === "dat");

    return {
      domain: likelyDomain,
      format: isTabular ? "tabular" : "unknown",
      confidence: conf
    };
  }

  global.FileClassifier = {
    classify: classify,
    guessColumnDomain: guessColumnDomain
  };
})(window);
