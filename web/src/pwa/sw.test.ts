import { describe, expect, it, vi } from "vitest"

type SwFetchEvent = {
  request: {
    method: string
    mode: string
    url: string
    destination?: string
  }
  respondWith: (response: Promise<Response> | Response) => void
}

async function loadServiceWorker(options?: {
  fetchImpl?: (input: unknown) => Promise<Response>
  cacheMatch?: (key: unknown) => Promise<Response | undefined>
}) {
  const listeners = new Map<string, (event: unknown) => void>()
  const cache = {
    addAll: vi.fn(async () => {}),
    put: vi.fn(async () => {}),
    match: vi.fn(async (key: unknown) => options?.cacheMatch?.(key)),
  }

  const selfScope = {
    location: { href: "https://app.example/sw.js?build=test", origin: "https://app.example" },
    registration: { scope: "https://app.example/" },
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (name: string, listener: (event: unknown) => void) => {
      listeners.set(name, listener)
    },
    skipWaiting: vi.fn(),
  }

  vi.stubGlobal("self", selfScope)
  vi.stubGlobal("caches", {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  })
  vi.stubGlobal("fetch", options?.fetchImpl ?? (async () => new Response("ok", { status: 200 })))
  vi.resetModules()
  await import("../../public/sw.js")

  const fetchListener = listeners.get("fetch")
  if (!fetchListener) {
    throw new Error("fetch listener is not registered")
  }

  const messageListener = listeners.get("message")
  if (!messageListener) {
    throw new Error("message listener is not registered")
  }

  return { cache, fetchListener, messageListener, selfScope }
}

describe("service worker navigation fallback", () => {
  it("falls back to cached app shell when navigate fetch returns non-ok", async () => {
    const cachedShell = new Response("<html>cached shell</html>", { status: 200 })
    const { fetchListener } = await loadServiceWorker({
      fetchImpl: async () => new Response("not found", { status: 404 }),
      cacheMatch: async (key) => (key === "https://app.example/" ? cachedShell : undefined),
    })

    let responsePromise: Promise<Response> | null = null
    const event: SwFetchEvent = {
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://app.example/logs/detail",
      },
      respondWith: (response) => {
        responsePromise = Promise.resolve(response)
      },
    }

    fetchListener(event)
    expect(responsePromise).not.toBeNull()
    const response = await responsePromise!
    expect(response).toBe(cachedShell)
    vi.unstubAllGlobals()
  })
})

describe("service worker update activation", () => {
  it("calls skipWaiting when receiving SKIP_WAITING message", async () => {
    const { messageListener, selfScope } = await loadServiceWorker()

    messageListener({
      data: { type: "SKIP_WAITING" },
    })

    expect(selfScope.skipWaiting).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
