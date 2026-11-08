import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          50: "#f4f7f4",
          100: "#e3ebe3",
          200: "#c8d8c8",
          300: "#a0bca0",
          400: "#739b74",
          500: "#537e55",
          600: "#406442",
          700: "#345036",
          800: "#2c412d",
          900: "#253626",
        },
        terracotta: {
          50: "#fdf6f3",
          100: "#fbeae4",
          200: "#f7d7cc",
          300: "#f0bba8",
          400: "#e69376",
          500: "#da6f4b",
          600: "#c95630",
          700: "#a84424",
          800: "#8b3a21",
          900: "#73331f",
        },
        cream: {
          50: "#fdfcf9",
          100: "#faf6ee",
          200: "#f3ead8",
        }
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "Times", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;

