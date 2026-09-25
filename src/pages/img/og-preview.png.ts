// The social preview image (og:image and twitter:image on every page), drawn at
// build time from summary.json so its figures follow every release. It used to
// be a PNG in public/, which kept the figures of the day it was made ("620K
// editors" long after the data said otherwise), out of reach of
// scripts/check-figures.mjs, which reads text, not images.
//
// sharp (with librsvg) comes with Astro, which installs it for its own image
// service; without it this import fails the build rather than ship no image.
// Text is set in DejaVu Sans, present on the ubuntu build runner.
import type { APIRoute } from "astro";
import sharp from "sharp";
import summary from "../../../public/api/summary.json";
import { fmt, thousandsAtLeast } from "../../lib/figures";

const W = 1200;
const H = 630;
const FONT = "DejaVu Sans, Verdana, Arial, Helvetica, sans-serif";

/** Faint background dots, from a fixed seed so every build draws the same image. */
function dots(count: number): string {
  let seed = 20260925;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: count }, () => {
    const [x, y] = [(rand() * W).toFixed(1), (rand() * H).toFixed(1)];
    const [r, o] = [(1 + rand() * 1.4).toFixed(1), (0.06 + rand() * 0.18).toFixed(2)];
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#94a3b8" fill-opacity="${o}"/>`;
  }).join("");
}

function card(i: number, value: string, label: string, color: string): string {
  const x = 75 + i * 250;
  return `
    <rect x="${x}" y="425" width="230" height="140" rx="10" fill="#ffffff" fill-opacity="0.07"/>
    <rect x="${x + 23}" y="443" width="104" height="4" rx="2" fill="${color}"/>
    <text x="${x + 35}" y="498" font-size="34" font-weight="bold" fill="#ffffff">${value}</text>
    <text x="${x + 35}" y="531" font-size="16" fill="#7c8aa0">${label}</text>`;
}

export function previewSvg(): string {
  const cards = [
    [thousandsAtLeast(summary.total_records, "total_records"), "positions", "#4c6ef5"],
    [thousandsAtLeast(summary.unique_editors, "unique_editors"), "editors", "#e64980"],
    [thousandsAtLeast(summary.unique_journals, "unique_journals"), "journals", "#37b24d"],
    [fmt(summary.unique_countries, "unique_countries"), "countries", "#f59f00"],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="0.47" stop-color="#1e3a5f"/>
      <stop offset="1" stop-color="#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${dots(260)}
  <rect x="25" y="45" width="22" height="540" rx="3" fill="#4c6ef5"/>
  <rect x="735" y="25" width="450" height="100" rx="16" fill="#4768e5"/>
  <text x="960" y="81" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">openeditors-plus.org</text>
  <text x="100" y="182" font-size="66" font-weight="bold" fill="#ffffff">Open Editors</text>
  <text x="100" y="266" font-size="66" font-weight="bold" fill="#748ffc">Plus</text>
  <text x="100" y="333" font-size="24" fill="#94a3b8">The largest open dataset of who edits</text>
  <text x="100" y="383" font-size="24" fill="#94a3b8">academic journals worldwide</text>
  ${cards.map(([value, label, color], i) => card(i, value, label, color)).join("")}
  <text x="1150" y="610" font-size="13" fill="#64748b" text-anchor="end">CC0  |  Zenodo</text>
</svg>`;
}

export const GET: APIRoute = async () => {
  const png = await sharp(Buffer.from(previewSvg())).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
