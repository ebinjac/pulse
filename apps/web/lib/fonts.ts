import localFont from "next/font/local"
import { Geist_Mono } from "next/font/google"

export const bentonSans = localFont({
  src: [
    {
      path: "../assets/fonts/benton-sans/benton-sans-light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../assets/fonts/benton-sans/benton-sans-regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../assets/fonts/benton-sans/benton-sans-book.otf",
      weight: "450",
      style: "normal",
    },
    {
      path: "../assets/fonts/benton-sans/benton-sans-medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../assets/fonts/benton-sans/benton-sans-bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-benton-sans",
  display: "swap",
})

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})
