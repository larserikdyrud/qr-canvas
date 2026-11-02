import { QrStudio } from "./components/QrStudio";

export function App() {
  return (
    <main className="min-h-dvh px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto mb-10 w-full max-w-5xl space-y-3">
        <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">QR Canvas</p>
        <h1 className="max-w-xl text-4xl leading-tight font-medium tracking-tight text-ink sm:text-5xl">
          QR codes you can draw on
        </h1>
        <p className="max-w-lg text-base text-ink-soft">
          Paste an address or type a message. Adjust shape, colours, margin, mask and more. Draw pixels straight into
          the code and see whether it still scans. Download as PNG or SVG.
        </p>
      </div>
      <QrStudio />
      <p className="mx-auto mt-12 w-full max-w-5xl text-sm text-muted">
        Everything happens in your browser. Your text and logo never leave your device.
      </p>
    </main>
  );
}
