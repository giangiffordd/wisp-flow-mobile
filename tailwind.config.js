/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./navigation/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#6D28D9",
        "primary-dark": "#5B21B6",
        "primary-light": "#8B5CF6",
        background: "#0F0F0F",
        surface: "#1A1A1A",
        "surface-light": "#F5F5F5",
        muted: "#6B7280",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
