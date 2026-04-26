export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-12 w-[360px] rounded-full" />
        <div className="skeleton h-5 w-[320px] rounded-full" />
      </header>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
          }}
        >
          <div className="skeleton h-3 w-28 rounded-full" />
          <div className="mt-8 skeleton h-20 w-44 rounded-[24px]" />
          <div className="mt-6 flex flex-col gap-3">
            <div className="skeleton h-4 w-full rounded-full" />
            <div className="skeleton h-4 w-11/12 rounded-full" />
            <div className="skeleton h-4 w-4/5 rounded-full" />
          </div>
        </div>

        <div
          className="rounded-3xl p-8"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
          }}
        >
          <div className="skeleton h-3 w-28 rounded-full" />
          <div className="mt-8 h-[240px] rounded-[24px] skeleton" />
        </div>
      </section>

      <section
        className="rounded-3xl p-8"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-line)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-32 rounded-full" />
          <div className="skeleton h-3 w-16 rounded-full" />
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <div className="skeleton h-16 w-full rounded-2xl" />
          <div className="skeleton h-16 w-full rounded-2xl" />
          <div className="skeleton h-16 w-full rounded-2xl" />
        </div>
      </section>
    </div>
  );
}
