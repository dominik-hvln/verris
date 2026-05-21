import Link from 'next/link';

export function FeatureNotAvailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-[#0a0a0a] p-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-400">{description}</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
      >
        Wróć do panelu
      </Link>
    </div>
  );
}
