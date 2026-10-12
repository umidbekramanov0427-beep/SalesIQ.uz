import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { trail } from "./lib/session-trail";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Every failed save/action goes to the visits report as something the
    // user tried to do (the error text says what went wrong).
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        const message = error instanceof Error ? error.message : String(error);
        const key = mutation.options.mutationKey;
        trail(
          "failed",
          message,
          undefined,
          key ? { action: JSON.stringify(key).slice(0, 120) } : undefined,
        );
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
