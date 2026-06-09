import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import rythmLogo from "@/assets/amexlogo.svg"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      url: "/docs",
      title: (
        <>
          <img
            src={(rythmLogo as { src: string }).src}
            alt=""
            className="size-6 rounded"
          />
          Rythm Docs
        </>
      ),
    },
    links: [
      {
        type: "main",
        text: "Back to Rythm",
        url: "/dashboard",
        active: "none",
      },
    ],
    themeSwitch: {
      enabled: true,
    },
  }
}
