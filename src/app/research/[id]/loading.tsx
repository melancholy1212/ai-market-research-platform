import { Bone } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading research">
      <Bone className="h-4 w-32" />
      <Bone className="mt-5 h-8 w-2/3" />
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="bg-surface px-4 py-3">
            <Bone className="h-3 w-20" />
            <Bone className="mt-2 h-6 w-10" />
          </div>
        ))}
      </div>
      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
        <div className="space-y-4">
          <Bone className="h-6 w-32" />
          <Bone className="h-40 w-full" />
          <Bone className="h-6 w-32" />
          <Bone className="h-64 w-full" />
        </div>
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
