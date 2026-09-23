import Link from "next/link";

import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="This research doesn't exist, or the link is wrong."
      action={
        <Link href="/research" className="text-sm font-medium text-accent">
          Go to research history
        </Link>
      }
    />
  );
}
