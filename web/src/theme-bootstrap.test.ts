import { describe, expect, it } from "vitest"
import indexHtml from "../index.html?raw"

function extractInlineBootstrapScript(html: string) {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
  if (!match?.[1]) {
    throw new Error("inline bootstrap script not found in index.html")
  }
  return match[1]
}

describe("index theme bootstrap script", () => {
  it("does not throw when matchMedia is unavailable", () => {
    const script = extractInlineBootstrapScript(indexHtml)

    const themeMeta = {
      content: "#0b1326",
      setAttribute(name: string, value: string) {
        if (name === "content") {
          this.content = value
        }
      },
    }

    const documentElement = {
      dataset: {} as Record<string, string>,
      classList: {
        toggle(className: string, enabled: boolean) {
          if (className === "dark") {
            documentElement.dataset.darkClassEnabled = enabled ? "1" : "0"
          }
        },
      },
    }

    const mockWindow = {
      localStorage: {
        getItem: () => "system",
      },
      matchMedia: undefined as undefined | ((query: string) => { matches: boolean }),
    }

    const mockDocument = {
      documentElement,
      querySelector: () => themeMeta,
    }

    expect(() => {
      const bootstrap = new Function("window", "document", script)
      bootstrap(mockWindow, mockDocument)
    }).not.toThrow()

    expect(documentElement.dataset.theme).toBe("light")
    expect(documentElement.dataset.themePreference).toBe("system")
    expect(documentElement.dataset.darkClassEnabled).toBe("0")
    expect(themeMeta.content).toBe("#f0f3fa")
  })
})
