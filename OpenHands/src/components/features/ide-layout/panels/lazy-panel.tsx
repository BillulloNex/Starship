import React, { Suspense } from "react";
import { LoadingSpinner } from "#/components/shared/loading-spinner";

/** Suspense boundary shared by the IDE's lazily loaded panels. */
export function LazyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#141414]">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <LoadingSpinner size="small" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
