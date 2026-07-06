"use client";

// Bildergalerie zum Durchklicken (SPEC §11): Karussell mit Vor/Zurück + Thumbnails.
import { useState } from "react";

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-muted text-sm text-muted-foreground">
        kein Bild
      </div>
    );
  }
  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[index]} alt={alt} className="aspect-[4/3] w-full object-cover" />
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Vorheriges Bild"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-card/85 px-3 py-2 text-lg leading-none shadow-sm backdrop-blur-sm transition-colors hover:bg-card"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Nächstes Bild"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-card/85 px-3 py-2 text-lg leading-none shadow-sm backdrop-blur-sm transition-colors hover:bg-card"
            >
              ›
            </button>
            <div className="absolute bottom-3 right-3 rounded-full bg-card/85 px-2 py-1 text-xs tabular-nums backdrop-blur-sm">
              {index + 1} / {images.length}
            </div>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              className={`shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${
                i === index ? "ring-primary" : "ring-transparent opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-16 w-20 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
