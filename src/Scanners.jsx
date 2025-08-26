import React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import Quagga from "quagga";
import Quagga2 from "@ericblade/quagga2";
import { Html5Qrcode } from "html5-qrcode";

// Options
const OPTIONS = [
  { label: "Native", key: "native" },
  { label: "zxing", key: "zxing" },
  { label: "quagga", key: "quagga" },
  { label: "quagga 2", key: "quagga2" },
  { label: "html5-qrcode", key: "html5qrcode" },
];

const Scanners = () => {
  const [selected, setSelected] = useState("native");
  const [scannedValues, setScannedValues] = useState([]);
  const [switchingScanner, setSwitchingScanner] = useState(false);

  const addScannedValue = (value, scanner) => {
    const newEntry = {
      value,
      scanner,
      timestamp: new Date().toLocaleTimeString(),
      id: Date.now() + Math.random(),
    };
    setScannedValues(prev => [newEntry, ...prev]);
  };

  const clearScannedValues = () => {
    setScannedValues([]);
  };

  const handleScannerSwitch = async (newScanner) => {
    if (newScanner === selected) return;
    
    setSwitchingScanner(true);
    // Small delay to allow current scanner to cleanup
    setTimeout(() => {
      setSelected(newScanner);
      setSwitchingScanner(false);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-2">
      {/* Option Tabs */}
      <div className="flex w-full max-w-md gap-1 mb-4 sticky top-0 bg-white border-b z-10">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium border transition-colors
              ${
                selected === opt.key
                  ? "bg-black text-white border-black"
                  : "bg-gray-100 text-black border-gray-200"
              }
              ${switchingScanner ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => handleScannerSwitch(opt.key)}
            disabled={switchingScanner}
          >
            {opt.label}
          </button>
        ))}
      </div>
      
      {/* Scanned Values List */}
      <ScannedValuesList 
        values={scannedValues} 
        onClear={clearScannedValues}
      />
      
      <div className="w-full max-w-md flex-1 flex flex-col items-center justify-start">
        {switchingScanner ? (
          <div className="w-full p-4 rounded-xl border mt-4 flex flex-col items-center text-center">
            <div className="text-lg font-semibold mb-2">Switching Scanner...</div>
            <div className="animate-pulse w-full h-64 bg-gray-200 rounded-lg"></div>
          </div>
        ) : (
          <>
            {selected === "native" && <NativeEANScanner key="native" onScanSuccess={addScannedValue} />}
            {selected === "zxing" && <ZxingEANScanner key="zxing" onScanSuccess={addScannedValue} />}
            {selected === "quagga" && <QuaggaEANScanner key="quagga" onScanSuccess={addScannedValue} />}
            {selected === "quagga2" && <Quagga2EANScanner key="quagga2" onScanSuccess={addScannedValue} />}
            {selected === "html5qrcode" && <Html5QrcodeEANScanner key="html5qrcode" onScanSuccess={addScannedValue} />}
          </>
        )}
      </div>
    </div>
  );
};

export default Scanners;

// 1. Native BarcodeDetector
function NativeEANScanner({ onScanSuccess }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const lastDetectionAttempt = useRef(0);
  const noDetectionCount = useRef(0);

  const applyZoom = useCallback(async (newZoom) => {
    if (!streamRef.current || !supportsZoom) return;
    
    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      await videoTrack.applyConstraints({
        advanced: [{ zoom: newZoom }]
      });
      setZoomLevel(newZoom);
    } catch (err) {
      console.warn("Failed to apply zoom:", err);
    }
  }, [supportsZoom]);

  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let stream;
    // Capture videoRef.current at the beginning of the effect
    const videoElement = videoRef.current;

    async function run() {
      if (!("BarcodeDetector" in window)) {
        setError("BarcodeDetector API not supported on this browser.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            zoom: { ideal: zoomLevel }
          },
        });
        streamRef.current = stream;
        
        // Check zoom capabilities
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.zoom) {
          setSupportsZoom(true);
          setMaxZoom(capabilities.zoom.max || 3);
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8"],
        });
        async function detectLoop() {
          if (stopped || !scanning) return;
          if (videoRef.current?.readyState >= 2) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length) {
                const detectedValue = barcodes[0].rawValue;
                setResult(detectedValue);
                onScanSuccess && onScanSuccess(detectedValue, "Native");
                setScanning(false);
                return;
              } else {
                // Auto zoom logic
                const now = Date.now();
                if (now - lastDetectionAttempt.current > 2000) { // Try every 2 seconds
                  noDetectionCount.current++;
                  lastDetectionAttempt.current = now;
                  
                  if (supportsZoom && noDetectionCount.current % 3 === 0 && zoomLevel < maxZoom) {
                    const newZoom = Math.min(zoomLevel + 0.5, maxZoom);
                    await applyZoom(newZoom);
                  }
                }
              }
            } catch (e) {}
          }
          requestAnimationFrame(detectLoop);
        }
        detectLoop();
      } catch (err) {
        setError("Camera error: " + err.message);
      }
    }
    run();
    return () => {
      stopped = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
      // Use the captured videoElement from the beginning of the effect
      if (videoElement) {
        videoElement.srcObject = null;
        videoElement.load();
      }
    };
  }, [scanning, zoomLevel, applyZoom, maxZoom, onScanSuccess, supportsZoom]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setZoomLevel(1);
    noDetectionCount.current = 0;
    lastDetectionAttempt.current = 0;
    setScanning(true);
  };

  const handleZoomChange = (newZoom) => {
    applyZoom(newZoom);
  };

  return (
    <ScannerWrapper
      title="Native Barcode Detection"
      note="Uses BarcodeDetector API"
    >
      <ResultField result={result} error={error} />
      {supportsZoom && (
        <div className="mt-4 w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Zoom: {zoomLevel.toFixed(1)}x
          </label>
          <input
            type="range"
            min="1"
            max={maxZoom}
            step="0.1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!scanning}
          />
        </div>
      )}
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
      <video
        ref={videoRef}
        className="w-full rounded-lg aspect-video bg-black mt-4"
      />
    </ScannerWrapper>
  );
}

// 2. ZXing
function ZxingEANScanner({ onScanSuccess }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const streamRef = useRef(null);
  const lastDetectionAttempt = useRef(0);
  const noDetectionCount = useRef(0);

  const applyZoom = useCallback(async (newZoom) => {
    if (!streamRef.current || !supportsZoom) return;
    
    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      await videoTrack.applyConstraints({
        advanced: [{ zoom: newZoom }]
      });
      setZoomLevel(newZoom);
    } catch (err) {
      console.warn("Failed to apply zoom:", err);
    }
  }, [supportsZoom]);

  useEffect(() => {
    if (!scanning) return;
    let active = true;
    
    const initZoom = async () => {
      try {
        // Get camera stream to check zoom capabilities
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            zoom: { ideal: zoomLevel }
          }
        });
        streamRef.current = stream;
        
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.zoom) {
          setSupportsZoom(true);
          setMaxZoom(capabilities.zoom.max || 3);
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Failed to initialize zoom:", err);
      }
    };
    
    initZoom();
    
    codeReaderRef.current = new BrowserMultiFormatReader();
    
    let detectionInterval;
    
    codeReaderRef.current.decodeFromVideoDevice(
      null,
      videoRef.current,
      (res, err) => {
        if (!active || !scanning) return;
        if (res) {
          const detectedValue = res.getText();
          setResult(detectedValue);
          onScanSuccess && onScanSuccess(detectedValue, "ZXing");
          setScanning(false);
          codeReaderRef.current.reset();
          if (detectionInterval) clearInterval(detectionInterval);
        } else {
          // Auto zoom logic for no detection
          const now = Date.now();
          if (now - lastDetectionAttempt.current > 2000) {
            noDetectionCount.current++;
            lastDetectionAttempt.current = now;
            
            if (supportsZoom && noDetectionCount.current % 3 === 0 && zoomLevel < maxZoom) {
              const newZoom = Math.min(zoomLevel + 0.5, maxZoom);
              applyZoom(newZoom);
            }
          }
        }
        if (err && err.name !== "NotFoundException") setError(err.message);
      }
    );
    
    return () => {
      active = false;
      if (detectionInterval) clearInterval(detectionInterval);
      if (codeReaderRef.current) {
        try {
          codeReaderRef.current.reset();
        } catch (e) {}
        codeReaderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, [scanning, zoomLevel, applyZoom, maxZoom, onScanSuccess, supportsZoom]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setZoomLevel(1);
    noDetectionCount.current = 0;
    lastDetectionAttempt.current = 0;
    setScanning(true);
  };

  const handleZoomChange = (newZoom) => {
    applyZoom(newZoom);
  };

  return (
    <ScannerWrapper title="ZXing EAN Scanner" note="Uses @zxing/library">
      <ResultField result={result} error={error} />
      {supportsZoom && (
        <div className="mt-4 w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Zoom: {zoomLevel.toFixed(1)}x
          </label>
          <input
            type="range"
            min="1"
            max={maxZoom}
            step="0.1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!scanning}
          />
        </div>
      )}
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
      <video
        ref={videoRef}
        className="w-full rounded-lg aspect-video bg-black mt-4"
      />
    </ScannerWrapper>
  );
}

// 3. Quagga
function QuaggaEANScanner({ onScanSuccess }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const streamRef = useRef(null);
  const lastDetectionAttempt = useRef(0);
  const noDetectionCount = useRef(0);

  useEffect(() => {
    if (!scanning) return;
    let active = true;

    const initWithZoom = async () => {
      try {
        // Check zoom capabilities
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            zoom: { ideal: zoomLevel }
          }
        });
        streamRef.current = stream;
        
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.zoom) {
          setSupportsZoom(true);
          setMaxZoom(capabilities.zoom.max || 3);
        }
        
        stream.getTracks().forEach(track => track.stop()); // Stop initial stream
      } catch (err) {
        console.warn("Failed to check zoom capabilities:", err);
      }
      
      // Initialize Quagga with zoom constraints
      Quagga.init(
        {
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector("#quagga-container"),
            constraints: { 
              facingMode: "environment",
              zoom: { ideal: zoomLevel }
            },
            area: { top: "10%", right: "10%", left: "10%", bottom: "10%" },
          },
          locator: { patchSize: "medium", halfSample: true },
          decoder: { readers: ["ean_reader", "ean_8_reader"] },
          locate: true,
        },
        (err) => {
          if (err) {
            setError("Quagga init error: " + err.message);
            return;
          }
          Quagga.start();
        }
      );
      
      Quagga.onDetected((data) => {
        if (active && data.codeResult && data.codeResult.code) {
          const detectedValue = data.codeResult.code;
          setResult(detectedValue);
          onScanSuccess && onScanSuccess(detectedValue, "Quagga");
          setScanning(false);
          Quagga.stop();
          Quagga.offDetected();
        } else {
          // Auto zoom logic
          const now = Date.now();
          if (now - lastDetectionAttempt.current > 2000) {
            noDetectionCount.current++;
            lastDetectionAttempt.current = now;
            
            if (supportsZoom && noDetectionCount.current % 3 === 0 && zoomLevel < maxZoom) {
              const newZoom = Math.min(zoomLevel + 0.5, maxZoom);
              setZoomLevel(newZoom);
            }
          }
        }
      });
    };

    setTimeout(initWithZoom, 100);

    return () => {
      active = false;
      try {
        Quagga.stop();
        Quagga.offDetected();
        Quagga.offProcessed();
      } catch (e) {}
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, [scanning, zoomLevel, maxZoom, onScanSuccess, supportsZoom]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setZoomLevel(1);
    noDetectionCount.current = 0;
    lastDetectionAttempt.current = 0;
    setScanning(true);
  };

  const handleZoomChange = (newZoom) => {
    setZoomLevel(newZoom);
  };

  return (
    <ScannerWrapper title="Quagga EAN Scanner" note="Uses quagga">
      <ResultField result={result} error={error} />
      {supportsZoom && (
        <div className="mt-4 w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Zoom: {zoomLevel.toFixed(1)}x
          </label>
          <input
            type="range"
            min="1"
            max={maxZoom}
            step="0.1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!scanning}
          />
        </div>
      )}
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
      <div
        id="quagga-container"
        className="w-full rounded-lg aspect-video bg-black mt-4"
      />
    </ScannerWrapper>
  );
}

// 4. Quagga2
function Quagga2EANScanner({ onScanSuccess }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const streamRef = useRef(null);
  const lastDetectionAttempt = useRef(0);
  const noDetectionCount = useRef(0);

  useEffect(() => {
    if (!scanning) return;
    let active = true;

    const initWithZoom = async () => {
      try {
        // Check zoom capabilities
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            zoom: { ideal: zoomLevel }
          }
        });
        streamRef.current = stream;
        
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.zoom) {
          setSupportsZoom(true);
          setMaxZoom(capabilities.zoom.max || 3);
        }
        
        stream.getTracks().forEach(track => track.stop()); // Stop initial stream
      } catch (err) {
        console.warn("Failed to check zoom capabilities:", err);
      }
      
      // Initialize Quagga2 with zoom constraints
      Quagga2.init(
        {
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector("#quagga2-container"),
            constraints: { 
              facingMode: "environment",
              zoom: { ideal: zoomLevel }
            },
            area: { top: "10%", right: "10%", left: "10%", bottom: "10%" },
          },
          locator: { patchSize: "medium", halfSample: true },
          decoder: { readers: ["ean_reader", "ean_8_reader"] },
          locate: true,
        },
        (err) => {
          if (err) {
            setError("Quagga2 init error: " + err.message);
            return;
          }
          Quagga2.start();
        }
      );
      
      Quagga2.onDetected((data) => {
        if (active && data.codeResult && data.codeResult.code) {
          const detectedValue = data.codeResult.code;
          setResult(detectedValue);
          onScanSuccess && onScanSuccess(detectedValue, "Quagga2");
          setScanning(false);
          Quagga2.stop();
          Quagga2.offDetected();
        } else {
          // Auto zoom logic
          const now = Date.now();
          if (now - lastDetectionAttempt.current > 2000) {
            noDetectionCount.current++;
            lastDetectionAttempt.current = now;
            
            if (supportsZoom && noDetectionCount.current % 3 === 0 && zoomLevel < maxZoom) {
              const newZoom = Math.min(zoomLevel + 0.5, maxZoom);
              setZoomLevel(newZoom);
            }
          }
        }
      });
    };

    setTimeout(initWithZoom, 100);

    return () => {
      active = false;
      try {
        Quagga2.stop();
        Quagga2.offDetected();
        Quagga2.offProcessed();
      } catch (e) {}
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, [scanning, zoomLevel, maxZoom, onScanSuccess, supportsZoom]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setZoomLevel(1);
    noDetectionCount.current = 0;
    lastDetectionAttempt.current = 0;
    setScanning(true);
  };

  const handleZoomChange = (newZoom) => {
    setZoomLevel(newZoom);
  };

  return (
    <ScannerWrapper title="Quagga2 EAN Scanner" note="Uses @ericblade/quagga2">
      <ResultField result={result} error={error} />
      {supportsZoom && (
        <div className="mt-4 w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Zoom: {zoomLevel.toFixed(1)}x
          </label>
          <input
            type="range"
            min="1"
            max={maxZoom}
            step="0.1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!scanning}
          />
        </div>
      )}
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
      <div
        id="quagga2-container"
        className="w-full rounded-lg aspect-video bg-black mt-4"
      />
    </ScannerWrapper>
  );
}

// 5. HTML5-QRCode Scanner
function Html5QrcodeEANScanner({ onScanSuccess }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const scannerRef = useRef(null);
  const lastDetectionAttempt = useRef(0);
  const noDetectionCount = useRef(0);

  const applyZoom = useCallback(async (newZoom) => {
    if (!scannerRef.current || !supportsZoom) return;
    
    try {
      // For HTML5-QRCode, we need to access the video element directly
      const videoElement = document.querySelector("#html5-qrcode-reader video");
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject;
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await videoTrack.applyConstraints({
            advanced: [{ zoom: newZoom }]
          });
          setZoomLevel(newZoom);
        }
      }
    } catch (err) {
      console.warn("Failed to apply zoom:", err);
    }
  }, [supportsZoom]);

  useEffect(() => {
    if (!scanning) return;
    let active = true;
    let autoZoomInterval;

    const startScanning = async () => {
      try {
        scannerRef.current = new Html5Qrcode("html5-qrcode-reader");
        
        await scannerRef.current.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (active) {
              setResult(decodedText);
              onScanSuccess && onScanSuccess(decodedText, "HTML5-QRCode");
              // Reset auto zoom counters on successful scan
              lastDetectionAttempt.current = 0;
              noDetectionCount.current = 0;
              setScanning(false);
            }
          },
          (errorMessage) => {
            // Only log actual errors, not detection failures
            if (errorMessage && !errorMessage.includes("NotFoundException")) {
              console.warn("HTML5-QRCode error:", errorMessage);
            }
          }
        );

        // Check zoom capabilities using correct HTML5-QRCode API
        // Add delay to ensure video element is ready
        setTimeout(async () => {
          try {
            const videoElement = document.querySelector("#html5-qrcode-reader video");
            if (videoElement && videoElement.srcObject) {
              const stream = videoElement.srcObject;
              const videoTrack = stream.getVideoTracks()[0];
              if (videoTrack && videoTrack.getCapabilities) {
                const capabilities = videoTrack.getCapabilities();
                if (capabilities && capabilities.zoom) {
                  setSupportsZoom(true);
                  setMaxZoom(capabilities.zoom.max || 5);
                }
              }
            }
          } catch (capabilityError) {
            // Zoom capabilities check failed, but scanner still works
            console.warn("Could not check zoom capabilities:", capabilityError);
          }
        }, 500);

        // Auto zoom logic for HTML5-QRCode scanner
        autoZoomInterval = setInterval(() => {
          if (!active || !scanning) {
            clearInterval(autoZoomInterval);
            return;
          }
          
          const now = Date.now();
          if (now - lastDetectionAttempt.current > 3000) { // Try every 3 seconds
            noDetectionCount.current++;
            lastDetectionAttempt.current = now;
            
            if (supportsZoom && noDetectionCount.current % 2 === 0 && zoomLevel < maxZoom) {
              const newZoom = Math.min(zoomLevel + 0.5, maxZoom);
              applyZoom(newZoom);
            }
          }
        }, 3000);
      } catch (err) {
        setError("HTML5-QRCode init error: " + err.message);
      }
    };

    startScanning();

    return () => {
      active = false;
      if (autoZoomInterval) {
        clearInterval(autoZoomInterval);
      }
      try {
        if (scannerRef.current) {
          scannerRef.current.stop().catch(() => {});
          scannerRef.current = null;
        }
      } catch (e) {}
    };
  }, [scanning, zoomLevel, applyZoom, maxZoom, onScanSuccess, supportsZoom]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setZoomLevel(1);
    noDetectionCount.current = 0;
    lastDetectionAttempt.current = 0;
    setScanning(true);
  };

  const handleZoomChange = (newZoom) => {
    applyZoom(newZoom);
  };

  return (
    <ScannerWrapper title="HTML5-QRCode Scanner" note="Uses html5-qrcode">
      <ResultField result={result} error={error} />
      {supportsZoom && (
        <div className="mt-4 w-full max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Zoom: {zoomLevel.toFixed(1)}x
          </label>
          <input
            type="range"
            min="1"
            max={maxZoom}
            step="0.1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={!scanning}
          />
        </div>
      )}
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
      <div
        id="html5-qrcode-reader"
        className="w-full rounded-lg aspect-video bg-black mt-4"
      />
    </ScannerWrapper>
  );
}

// Scanned Values List Component
function ScannedValuesList({ values, onClear }) {
  if (values.length === 0) return null;

  return (
    <div className="w-full max-w-md mb-4 bg-gray-50 rounded-lg p-3">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Scanned Values ({values.length})
        </h3>
        <button
          onClick={onClear}
          className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Clear All
        </button>
      </div>
      <div className="max-h-32 overflow-y-auto space-y-2">
        {values.map((item) => (
          <div key={item.id} className="bg-white rounded p-2 text-xs">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-mono text-black break-all">{item.value}</div>
                <div className="text-gray-500 mt-1">
                  {item.scanner} • {item.timestamp}
                </div>
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText(item.value)}
                className="ml-2 text-blue-500 hover:text-blue-700 text-xs"
                title="Copy to clipboard"
              >
                Copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// UI helpers
function ScannerWrapper({ title, note, children }) {
  return (
    <div className="w-full p-4 rounded-xl border mt-4 flex flex-col items-center text-center">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-gray-600 text-sm mb-2">{note}</p>
      {children}
    </div>
  );
}

function ResultField({ result, error }) {
  return (
    <>
      <div style={{ fontSize: "20px", fontWeight: 600 }}>{result}</div>
      {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
    </>
  );
}
