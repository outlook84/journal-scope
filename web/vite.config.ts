import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

type ProxyRequest = {
  socket: {
    setTimeout: (timeout: number) => void
    setNoDelay: (noDelay?: boolean) => void
    setKeepAlive: (enable?: boolean) => void
  }
}

type ProxyIncomingRequest = {
  headers: {
    accept?: string
  }
}

type ProxyEvents = {
  on: (
    event: "proxyReq",
    listener: (proxyReq: ProxyRequest, req: ProxyIncomingRequest, res: unknown) => void,
  ) => void
}

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: "asset-manifest.json",
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(`${Date.now()}`),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3030",
        changeOrigin: true,
        configure: (proxy, _options) => {
          const proxyEvents = proxy as unknown as ProxyEvents
          proxyEvents.on("proxyReq", (proxyReq, req, _res) => {
            if (req.headers.accept === "text/event-stream") {
              proxyReq.socket.setTimeout(0)
              proxyReq.socket.setNoDelay(true)
              proxyReq.socket.setKeepAlive(true)
            }
          })
        },
      },
    },
  },
})
