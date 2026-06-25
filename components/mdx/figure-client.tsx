"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";

import styles from "./figure.module.css";

type Props = {
  src?: string;
  srcDark?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  /** Inline-SVG-Markup (server-sanitisiert) für theme-adaptives Rendern. */
  inlineLight?: string | null;
  inlineDark?: string | null;
};

export function FigureClient({
  src,
  srcDark,
  alt,
  caption,
  width = 1200,
  height = 720,
  inlineLight,
  inlineDark,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      document.body.style.overflow = "";
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  function openZoom() {
    if (!dialogRef.current) return;
    document.body.style.overflow = "hidden";
    dialogRef.current.showModal();
  }
  function closeZoom() {
    dialogRef.current?.close();
  }

  if (!src) {
    return (
      <figure className={styles.figure}>
        <div className={styles.placeholder} aria-hidden>
          Platzhalter
        </div>
        {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
      </figure>
    );
  }

  const altText = alt ?? caption ?? "";
  const isSvgUrl = (s?: string) => !!s?.toLowerCase().endsWith(".svg");
  const hasDarkVariant = !!(inlineDark || srcDark);

  // Ein einzelner Medien-Knoten (Inline-SVG bevorzugt, sonst <img>/<Image>).
  function mediaNode(which: "light" | "dark", zoom: boolean) {
    const inline = which === "light" ? inlineLight : inlineDark;
    const url = which === "light" ? src : srcDark;
    if (inline) {
      return (
        <span
          className={`${styles.svgInline}${zoom ? ` ${styles.svgInlineZoom}` : ""}`}
          role="img"
          aria-label={altText}
          // server-sanitisiert (DOMPurify, svg-Profil) → sicher inline
          dangerouslySetInnerHTML={{ __html: inline }}
        />
      );
    }
    if (!url) return null;
    const cls = zoom ? styles.dialogImage : styles.image;
    if (isSvgUrl(url)) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt={altText} className={cls} loading="lazy" />;
    }
    return (
      <Image
        src={url}
        alt={altText}
        width={zoom ? width * 2 : width}
        height={zoom ? height * 2 : height}
        className={cls}
        sizes={zoom ? "100vw" : undefined}
      />
    );
  }

  // Light-only oder Light+Dark (per [data-theme] geswappt).
  function media(zoom: boolean) {
    if (!hasDarkVariant) return mediaNode("light", zoom);
    return (
      <>
        <span className={styles.lightOnly}>{mediaNode("light", zoom)}</span>
        <span className={styles.darkOnly}>{mediaNode("dark", zoom)}</span>
      </>
    );
  }

  return (
    <>
      <figure className={styles.figure}>
        <button
          type="button"
          className={styles.imgButton}
          onClick={openZoom}
          aria-label="Bild vergrößern"
        >
          {media(false)}
          <span className={styles.zoomHint} aria-hidden>
            Klicken zum Vergrößern
          </span>
        </button>
        {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
      </figure>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeZoom();
        }}
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={closeZoom}
          aria-label="Schließen"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
        <div className={styles.dialogInner}>
          {media(true)}
          {caption && <p className={styles.dialogCaption}>{caption}</p>}
        </div>
      </dialog>
    </>
  );
}
