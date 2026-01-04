"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function BarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startScanner = async () => {
    if (!containerRef.current) return;

    setError(null);
    setResult(null);

    try {
      const scanner = new Html5Qrcode("scanner-container");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          setResult(decodedText);
          stopScanner();
        },
        () => {}
      );

      setIsScanning(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start camera"
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Ignore stop errors
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div
        id="scanner-container"
        ref={containerRef}
        className="w-full aspect-square bg-zinc-900 rounded-lg overflow-hidden"
      />

      {!isScanning ? (
        <button
          onClick={startScanner}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-white font-medium transition-colors hover:bg-blue-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
          Start Scanner
        </button>
      ) : (
        <button
          onClick={stopScanner}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 px-5 text-white font-medium transition-colors hover:bg-red-700"
        >
          Stop Scanner
        </button>
      )}

      {result && (
        <div className="w-full p-4 bg-green-100 dark:bg-green-900 rounded-lg">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Scanned Result:
          </p>
          <p className="mt-1 text-lg font-mono break-all text-green-900 dark:text-green-100">
            {result}
          </p>
        </div>
      )}

      {error && (
        <div className="w-full p-4 bg-red-100 dark:bg-red-900 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
