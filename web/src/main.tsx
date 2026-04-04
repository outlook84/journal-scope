import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { LocaleProvider } from "./i18n"
import { registerPwa } from "./shared/pwa/pwa-manager"
import { ThemeProvider } from "./theme"
import "./index.css"

registerPwa()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
