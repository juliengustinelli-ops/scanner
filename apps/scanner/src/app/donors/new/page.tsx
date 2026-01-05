"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewDonorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      address: formData.get("address"),
      envelopeNumber: formData.get("envelopeNumber"),
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
    };

    try {
      const res = await fetch("/api/donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create donor");
      }

      router.push("/donors");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <Link href="/donors" className="text-[#722f37] hover:underline">
          &larr; Back to Parishioners
        </Link>
      </div>

      <div className="bg-white rounded shadow p-8">
        <h1 className="text-2xl text-[#722f37] mb-6">Add New Parishioner</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
              placeholder="e.g., John & Mary Smith"
            />
          </div>

          <div>
            <label
              htmlFor="envelopeNumber"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Envelope Number *
            </label>
            <input
              type="text"
              id="envelopeNumber"
              name="envelopeNumber"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
              placeholder="e.g., ENV-001"
            />
          </div>

          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Address *
            </label>
            <input
              type="text"
              id="address"
              name="address"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
              placeholder="e.g., 123 Oak Street, Springfield, IL"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#722f37] text-white py-3 rounded hover:bg-[#4a1c24] transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Add Parishioner"}
            </button>
            <Link
              href="/donors"
              className="flex-1 text-center py-3 border-2 border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
