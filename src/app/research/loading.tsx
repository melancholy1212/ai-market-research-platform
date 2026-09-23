import { Bone } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading research history">
      <Bone className="h-7 w-48" />
      <Bone className="mt-2 h-4 w-64" />
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <Bone className="h-5 w-2/3" />
            <Bone className="mt-3 h-4 w-full" />
            <Bone className="mt-1.5 h-4 w-4/5" />
            <Bone className="mt-3 h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
