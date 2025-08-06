import { useState, useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import Quagga from "quagga";
import Quagga2 from "@ericblade/quagga2";
import React from "react";
import "./tailwind.output.css";

// Options
const OPTIONS = [
  { label: "Native", key: "native" },
  { label: "zxing", key: "zxing" },
  { label: "quagga", key: "quagga" },
  { label: "quagga 2", key: "quagga2" },
];

export default function App() {
  const [selected, setSelected] = useState("native");
  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-2">
      {/* Option Tabs */}
      <div className="flex w-full max-w-md gap-2 mb-4 sticky top-0 bg-white border-b z-10">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
              ${
                selected === opt.key
                  ? "bg-black text-white border-black"
                  : "bg-gray-100 text-black border-gray-200"
              }`}
            onClick={() => setSelected(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="w-full max-w-md flex-1 flex flex-col items-center justify-start">
        {selected === "native" && <NativeEANScanner />}
        {selected === "zxing" && <ZxingEANScanner />}
        {selected === "quagga" && <QuaggaEANScanner />}
        {selected === "quagga2" && <Quagga2EANScanner />}
      </div>
    </div>
  );
}

// 1. Native BarcodeDetector
function NativeEANScanner() {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let stream;

    async function run() {
      if (!("BarcodeDetector" in window)) {
        setError("BarcodeDetector API not supported on this browser.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
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
                setResult(barcodes[0].rawValue);
                setScanning(false);
                return;
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
      // eslint-disable-next-line
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // eslint-disable-next-line
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setScanning(true);
  };

  return (
    <ScannerWrapper
      title="Native Barcode Detection"
      note="Uses BarcodeDetector API"
    >
      <ResultField result={result} error={error} />
      <video
        ref={videoRef}
        className="w-full rounded-lg aspect-video bg-black"
      />
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
    </ScannerWrapper>
  );
}

// 2. ZXing
function ZxingEANScanner() {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);

  useEffect(() => {
    if (!scanning) return;
    let active = true;
    codeReaderRef.current = new BrowserMultiFormatReader();
    codeReaderRef.current.decodeFromVideoDevice(
      null,
      videoRef.current,
      (res, err) => {
        if (!active || !scanning) return;
        if (res) {
          setResult(res.getText());
          setScanning(false);
          codeReaderRef.current.reset();
        }
        if (err && err.name !== "NotFoundException") setError(err.message);
      }
    );
    return () => {
      active = false;
      // eslint-disable-next-line
      codeReaderRef.current?.reset();
    };
    // eslint-disable-next-line
  }, [scanning]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setScanning(true);
  };

  return (
    <ScannerWrapper title="ZXing EAN Scanner" note="Uses @zxing/library">
      <ResultField result={result} error={error} />
      <video
        ref={videoRef}
        className="w-full rounded-lg aspect-video bg-black"
      />
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
    </ScannerWrapper>
  );
}

// 3. Quagga
function QuaggaEANScanner() {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    if (!scanning) return;
    let active = true;

    setTimeout(() => {
      Quagga.init(
        {
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector("#quagga-container"),
            constraints: { facingMode: "environment" },
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
          setResult(data.codeResult.code);
          setScanning(false);
          Quagga.stop();
          Quagga.offDetected();
        }
      });
    }, 100);

    return () => {
      active = false;
      try {
        Quagga.stop();
        Quagga.offDetected();
      } catch (e) {}
    };
  }, [scanning]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setScanning(true);
  };

  return (
    <ScannerWrapper title="Quagga EAN Scanner" note="Uses quagga">
      <ResultField result={result} error={error} />
      <div
        id="quagga-container"
        className="w-full rounded-lg aspect-video bg-black"
      />
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
    </ScannerWrapper>
  );
}

// 4. Quagga2
function Quagga2EANScanner() {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    if (!scanning) return;
    let active = true;
    setTimeout(() => {
      Quagga2.init(
        {
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector("#quagga2-container"),
            constraints: { facingMode: "environment" },
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
          setResult(data.codeResult.code);
          setScanning(false);
          Quagga2.stop();
          Quagga2.offDetected();
        }
      });
    }, 100);

    return () => {
      active = false;
      try {
        Quagga2.stop();
        Quagga2.offDetected();
      } catch (e) {}
    };
  }, [scanning]);

  const handleScanAgain = () => {
    setResult("");
    setError("");
    setScanning(true);
  };

  return (
    <ScannerWrapper title="Quagga2 EAN Scanner" note="Uses @ericblade/quagga2">
      <ResultField result={result} error={error} />
      <div
        id="quagga2-container"
        className="w-full rounded-lg aspect-video bg-black"
      />
      {!scanning && (
        <button
          className="mt-4 px-4 py-2 rounded bg-black text-white font-semibold"
          onClick={handleScanAgain}
        >
          Scan again
        </button>
      )}
    </ScannerWrapper>
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
