import Link from "next/link";
import { getAllDonors } from "@/lib/models";

export const dynamic = "force-dynamic";

export default async function DonorsPage() {
  const donors = await getAllDonors();

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl text-[#722f37]">Parishioners</h1>
        <Link
          href="/donors/new"
          className="bg-[#722f37] text-[#d4af37] border-2 border-[#d4af37] px-6 py-2 rounded hover:bg-[#4a1c24] transition-colors"
        >
          + Add Parishioner
        </Link>
      </div>

      <div className="bg-white rounded shadow">
        {donors.length === 0 ? (
          <div className="p-6 text-center text-gray-500 italic">
            No parishioners registered yet.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-sm text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Envelope #</th>
                <th className="px-6 py-3">Address</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {donors.map((donor) => (
                <tr
                  key={donor._id?.toString()}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">
                      {donor.name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-block px-3 py-1 text-sm bg-[#f5f3ef] text-[#722f37] rounded-full">
                      {donor.envelopeNumber}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{donor.address}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">
                    {donor.phone && <div>{donor.phone}</div>}
                    {donor.email && <div>{donor.email}</div>}
                    {!donor.phone && !donor.email && "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/donors/${donor._id}`}
                      className="text-[#722f37] hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
