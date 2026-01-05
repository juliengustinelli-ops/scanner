import Link from "next/link";
import { getCollectionStats, getDonationsWithDonors } from "@/lib/models";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, donations] = await Promise.all([
    getCollectionStats(),
    getDonationsWithDonors(10),
  ]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <main>
      {/* Banner */}
      <div className="bg-[#722f37] text-white text-center py-10 border-b-4 border-[#d4af37]">
        <h1 className="text-3xl font-normal mb-2">Tithe Collection Management</h1>
        <p className="text-[#e8d5b7] italic">
          &ldquo;Each of you should give what you have decided in your heart to give&rdquo; — 2 Corinthians 9:7
        </p>
      </div>

      {/* Stats */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-white rounded p-7 text-center border-t-4 border-[#d4af37] shadow">
            <div className="text-4xl mb-2">✝️</div>
            <div className="text-4xl text-[#722f37] mb-1">
              {formatCurrency(stats.monthTotal)}
            </div>
            <div className="text-sm text-gray-500 uppercase tracking-wide">
              Monthly Collection
            </div>
          </div>
          <div className="bg-white rounded p-7 text-center border-t-4 border-[#d4af37] shadow">
            <div className="text-4xl mb-2">📨</div>
            <div className="text-4xl text-[#722f37] mb-1">{stats.todayCount}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wide">
              Envelopes Today
            </div>
          </div>
          <div className="bg-white rounded p-7 text-center border-t-4 border-[#d4af37] shadow">
            <div className="text-4xl mb-2">👥</div>
            <div className="text-4xl text-[#722f37] mb-1">{stats.totalDonors}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wide">
              Contributing Families
            </div>
          </div>
        </div>

        {/* Recent Collections */}
        <div className="bg-white rounded shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg text-[#722f37]">Recent Contributions</h2>
            <Link
              href="/scan"
              className="bg-[#722f37] text-[#d4af37] border-2 border-[#d4af37] px-6 py-2 rounded hover:bg-[#4a1c24] transition-colors"
            >
              + New Entry
            </Link>
          </div>

          {donations.length === 0 ? (
            <div className="p-6 text-center text-gray-500 italic">
              No contributions recorded yet. Use the Scanner to add entries.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-sm text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Address</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Method</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((donation) => (
                  <tr
                    key={donation._id?.toString()}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">
                        {donation.donor?.name || "Unknown"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {donation.donor?.envelopeNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {donation.donor?.address || "-"}
                    </td>
                    <td className="px-6 py-4 font-semibold text-[#722f37]">
                      {formatCurrency(donation.amount)}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(donation.date)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-3 py-1 text-sm bg-[#f5f3ef] text-[#722f37] rounded-full capitalize">
                        {donation.method}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 gap-6 mt-6">
          <div className="bg-white rounded shadow p-6">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide mb-2">
              Today&apos;s Total
            </h3>
            <div className="text-3xl text-[#722f37] font-semibold">
              {formatCurrency(stats.todayTotal)}
            </div>
          </div>
          <div className="bg-white rounded shadow p-6">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide mb-2">
              This Week
            </h3>
            <div className="text-3xl text-[#722f37] font-semibold">
              {formatCurrency(stats.weekTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-gray-500 text-sm italic">
        Sacred Heart Parish • Serving our community with faith
      </footer>
    </main>
  );
}
