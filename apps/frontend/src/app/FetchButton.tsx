import Link from "next/link";

export function FetchButton(): JSX.Element {
  return (
    <Link
      href="/manual-fetch"
      className="rounded-md bg-[#1167b1] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0e5a9b]"
    >
      수동 수집
    </Link>
  );
}
