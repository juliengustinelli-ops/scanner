"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";

interface Donor {
  _id: string;
  name: string;
  address: string;
  envelopeNumber: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "check">("cash");
  const [checkNumber, setCheckNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Load donors for search
  useEffect(() => {
    fetch("/api/donors")
      .then((res) => res.json())
      .then(setDonors)
      .catch(console.error);
  }, []);

  // Filter donors based on search
  const filteredDonors = searchQuery
    ? donors.filter(
        (d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.envelopeNumber.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const startScanner = async () => {
    setError("");

    try {
      const scanner = new Html5Qrcode("scanner-container");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Try to find donor by envelope number
          const donor = donors.find(
            (d) =>
              d.envelopeNumber.toLowerCase() === decodedText.toLowerCase() ||
              d.envelopeNumber.includes(decodedText)
          );

          if (donor) {
            setSelectedDonor(donor);
            stopScanner();
          } else {
            // Check if it's an envelope number format
            setSearchQuery(decodedText);
            stopScanner();
          }
        },
        () => {}
      );

      setIsScanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start camera");
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

  const handleSelectDonor = (donor: Donor) => {
    setSelectedDonor(donor);
    setSearchQuery("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDonor || !amount) {
      setError("Please select a donor and enter an amount");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorId: selectedDonor._id,
          amount: parseFloat(amount),
          method,
          checkNumber: method === "check" ? checkNumber : undefined,
          notes: notes || undefined,
          scannedBy: "scanner",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save donation");
      }

      setSuccess(true);

      // Reset form after 2 seconds
      setTimeout(() => {
        setSelectedDonor(null);
        setAmount("");
        setMethod("cash");
        setCheckNumber("");
        setNotes("");
        setSuccess(false);
      }, 2000);

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedDonor(null);
    setSearchQuery("");
    setAmount("");
    setMethod("cash");
    setCheckNumber("");
    setNotes("");
    setError("");
    setSuccess(false);
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl text-[#722f37] text-center mb-6">
        Scan Envelope
      </h1>

      {success ? (
        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-8 text-center">
          <div className="text-5xl mb-4">✓</div>
          <div className="text-xl text-green-700 font-semibold">
            Donation Recorded!
          </div>
          <div className="text-green-600 mt-2">
            ${parseFloat(amount).toFixed(2)} from {selectedDonor?.name}
          </div>
        </div>
      ) : (
        <>
          {/* Scanner Section */}
          {!selectedDonor && (
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div
                id="scanner-container"
                className="w-full aspect-square bg-gray-900 rounded-lg overflow-hidden mb-4"
              />

              {!isScanning ? (
                <button
                  onClick={startScanner}
                  className="w-full bg-[#722f37] text-white py-3 rounded-lg font-medium hover:bg-[#4a1c24] transition-colors flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Start Camera
                </button>
              ) : (
                <button
                  onClick={stopScanner}
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  Stop Camera
                </button>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Manual Search */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or search by name/envelope #
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type to search..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
                />

                {filteredDonors.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {filteredDonors.map((donor) => (
                      <button
                        key={donor._id}
                        onClick={() => handleSelectDonor(donor)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium">{donor.name}</div>
                        <div className="text-sm text-gray-500">
                          {donor.envelopeNumber}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Donation Form */}
          {selectedDonor && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Selected Donor Card */}
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-lg">
                      {selectedDonor.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {selectedDonor.envelopeNumber}
                    </div>
                    <div className="text-sm text-gray-500">
                      {selectedDonor.address}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div className="bg-white rounded-lg shadow p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xl">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 text-2xl border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-lg shadow p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMethod("cash")}
                    className={`py-3 rounded-lg font-medium transition-colors ${
                      method === "cash"
                        ? "bg-[#722f37] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    💵 Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("check")}
                    className={`py-3 rounded-lg font-medium transition-colors ${
                      method === "check"
                        ? "bg-[#722f37] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    📝 Check
                  </button>
                </div>

                {method === "check" && (
                  <input
                    type="text"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder="Check number (optional)"
                    className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
                  />
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-lg shadow p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !amount}
                className="w-full bg-[#722f37] text-white py-4 rounded-lg font-medium text-lg hover:bg-[#4a1c24] transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : "Record Donation"}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
