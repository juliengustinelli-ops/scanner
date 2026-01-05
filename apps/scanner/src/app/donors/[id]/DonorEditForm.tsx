"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Donor {
  _id: string;
  name: string;
  address: string;
  envelopeNumber: string;
  phone?: string;
  email?: string;
}

export default function DonorEditForm({ donor }: { donor: Donor }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      address: formData.get("address"),
      envelopeNumber: formData.get("envelopeNumber"),
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
    };

    try {
      const res = await fetch(`/api/donors/${donor._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update donor");
      }

      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded">
          Parishioner updated successfully!
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          defaultValue={donor.name}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="envelopeNumber"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Envelope Number
        </label>
        <input
          type="text"
          id="envelopeNumber"
          name="envelopeNumber"
          defaultValue={donor.envelopeNumber}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="address"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Address
        </label>
        <input
          type="text"
          id="address"
          name="address"
          defaultValue={donor.address}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
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
            defaultValue={donor.phone || ""}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
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
            defaultValue={donor.email || ""}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#722f37] focus:border-transparent outline-none"
          />
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-[#722f37] text-white px-6 py-2 rounded hover:bg-[#4a1c24] transition-colors disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
