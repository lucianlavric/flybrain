import type { Metadata } from "next";
import { TasteApp } from "@/components/TasteApp";

export const metadata: Metadata = {
  title: "sound taste",
  description:
    "Play tones and music at a simulated fruit fly and score approach versus avoidance.",
};

export default function TastePage() {
  return <TasteApp />;
}
