/** @type {import('tailwindcss').Config} */
const withOpacity = (variableName) => `rgb(var(${variableName}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
      extend: {
          colors: {
              "primary-fixed-dim": withOpacity("--color-primary-fixed-dim"),
              "primary": withOpacity("--color-primary"),
              "primary-light": withOpacity("--color-primary-light"),
              "on-primary": withOpacity("--color-on-primary"),
              "tertiary": withOpacity("--color-tertiary"),
              "background": withOpacity("--color-background"),
              "surface": withOpacity("--color-surface"),
              "surface-variant": withOpacity("--color-surface-variant"),
              "surface-container-lowest": withOpacity("--color-surface-container-lowest"),
              "surface-container-low": withOpacity("--color-surface-container-low"),
              "surface-container": withOpacity("--color-surface-container"),
              "surface-container-high": withOpacity("--color-surface-container-high"),
              "surface-container-highest": withOpacity("--color-surface-container-highest"),
              "on-surface": withOpacity("--color-on-surface"),
              "on-surface-variant": withOpacity("--color-on-surface-variant"),
              "outline-variant": withOpacity("--color-outline-variant"),
              "outline": withOpacity("--color-outline"),
              "error": withOpacity("--color-error"),
              "error-container": withOpacity("--color-error-container"),
              "on-error-container": withOpacity("--color-on-error-container")
          },
          fontFamily: {
              sans: ["Bahnschrift", "system-ui", "sans-serif"],
              display: ["Bahnschrift", "system-ui", "sans-serif"],
              headline: ["Bahnschrift", "system-ui", "sans-serif"],
              body: ["Bahnschrift", "system-ui", "sans-serif"]
          },
      },
  },
  plugins: [],
}
