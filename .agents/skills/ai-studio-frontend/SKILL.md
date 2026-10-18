---
name: ai-studio-frontend
description: >-
  Build high-performance, dark-mode, engineering-grade AI/ML studio frontends (like OCR Lab).
  Use whenever the user asks to build an AI/ML demo, model playground, computer vision inspection
  studio, document parser UI, or interactive inference interface with canvas overlays, split-pane
  inspectors, and live timing metrics.
---

# AI/ML Studio Frontend Engineering Guide

Create production-ready, dark-mode, engineering-grade web interfaces for AI/ML inference, computer vision, and document intelligence pipelines (architected like OCR Lab).

## Core Aesthetic & Philosophy

- **Engineering-Grade Dark Mode**: Professional IDE feel inspired by Linear and Cursor.
  - Backgrounds: `#090a0f` (root), `#11141d` (panels), `#1a202c` (cards), `#2d3748` (borders).
  - Accents: Indigo/Blue (`#4f46e5`, `#38bdf8`), Emerald (`#10b981`), Amber (`#f59e0b`), Violet (`#8b5cf6`).
- **Zero-Fluff Monospace Density**: Compact typography (`font-mono` for metrics/IDs/timings, clean sans-serif for UI labels).
- **Sub-Millisecond Feedback**: Immediate optimistic UI updates, live latency breakdowns, cross-highlighting between canvas and parsed outputs.

---

## 1. Architecture & Tech Stack

- **Bundler & Framework**: Vite + React + TypeScript.
- **Styling**: Tailwind CSS + Lucide React icons (`lucide-react`).
- **Math & Markdown**: KaTeX (for formulas), customized markdown renderer with pipe-table protection.
- **Canvas Rendering**: High-DPI canvas overlay with normalized/scaled bounding box snapping.

```
frontend/
├── src/
│   ├── components/
│   │   ├── StudioView.tsx     # Split-pane: visual canvas overlay + output inspector
│   │   ├── BatchView.tsx      # Multi-file batch converter & progress queue
│   │   ├── AboutView.tsx      # Model specs, architecture diagrams, HF/GitHub links
│   │   ├── TimingBar.tsx      # Execution latency waterfall breakdown
│   │   └── HistoryDrawer.tsx  # Document history list with quick resume & wipe
│   ├── types/
│   │   └── api.ts             # Strict schemas: BoundingBox, Block, PageResult, Timings
│   ├── api/
│   │   └── client.ts          # Typed API caller with abort controller & error handling
│   ├── App.tsx                # Main navigation bar, tabs, and global notifications
│   └── index.css              # Custom scrollbars, glassmorphism, KaTeX styles
```

---

## 2. Mandatory Studio Layout Components

### A. Split-Pane Studio View (`StudioView.tsx`)
1. **Left Canvas (Visual Ground Truth)**:
   - Displays rendered image/page with pan & zoom support.
   - Interactive SVG/Canvas layer drawing bounding boxes:
     - Differentiate block types by color (Headers = Blue, Text = Gray/Cyan, Tables = Violet, Captions = Amber).
     - Hover cross-highlighting: hovering a box highlights the corresponding block in the inspector (and vice-versa).
   - Page carousel / stepper: `< Page X of Y >` with thumbnail slider for multi-page documents.

2. **Right Inspector (Parsed Output)**:
   - **Tabbed Sub-Views**:
     - `Rendered`: Clean formatted Markdown + KaTeX + styled HTML tables.
     - `Plain Text`: Raw text stream with copy-to-clipboard.
     - `Blocks / Layout`: Hierarchical tree of detected blocks with confidence scores and dimensions.
     - `JSON`: Formatted syntax-highlighted JSON for developers.
   - **Export Menu**: One-click download as `.md`, `.txt`, `.json`.

3. **Bottom Telemetry Ribbon (`TimingBar.tsx`)**:
   - Total latency pill (`total_ms`).
   - Waterfall pill badges: `render_ms`, `detection_ms`, `recognition_ms`, `order_ms`, `postprocess_ms`.

4. **Top Ribbon & Control Bar**:
   - File drag-and-drop zone + sample documents catalog dropdown.
   - Model inference toggles: e.g. `Math / LaTeX`, `Reading Order`, `Image OCR`, `DPI`.
   - Action controls: `Re-run Inference`, `Clear History`.

---

## 3. Critical Implementation Gotchas

### 1. KaTeX & Markdown Table Dollar Sign Collision
**Problem**: Naive regex `/\$([^\$]+)\$/g` matches dollar signs in financial tables (e.g., `| $2.40m | $3.50m |`), swallowing table column pipes `|` and corrupting layout.
**Fix**:
```typescript
function renderWithMathAndTables(text: string, enableMath: boolean) {
  if (!enableMath) return renderStandardMarkdown(text);
  // Exclude table rows and ensure no pipes are trapped inside math delimiters
  return text.replace(/(?<!\\)\$(?!\$)([^\$\n\|]+)\$(?!\$)/g, (match, formula) => {
    // Skip if it looks like plain currency (e.g. $100, $2.5m)
    if (/^\s*\d+(\.\d+)?[kmbKMB]?\s*$/.test(formula)) return match;
    try {
      return katex.renderToString(formula.trim(), { throwOnError: false });
    } catch {
      return match;
    }
  });
}
```

### 2. Canvas-to-Preview Coordinate Alignment
**Problem**: Bounding box coordinates from model/EMU often diverge from preview display dimensions.
**Rule**: Always normalize coordinates or map directly using direct canvas pixel dimensions:
```typescript
const scaleX = canvasRef.current.clientWidth / nativeWidth;
const scaleY = canvasRef.current.clientHeight / nativeHeight;
const boxStyle = {
  left: `${box[0] * scaleX}px`,
  top: `${box[1] * scaleY}px`,
  width: `${(box[2] - box[0]) * scaleX}px`,
  height: `${(box[3] - box[1]) * scaleY}px`,
};
```

### 3. Progressive History & Local Caching
- Cache responses indexed by `hash(file_bytes + options_json)`.
- Re-selecting previously visited pages or history items must hit 0ms cache instantly.
- Always provide a `Clear All History` button with confirmation.

---

## 4. Scaffold Workflow Checklist

When requested to build this frontend:
1. `npm create vite@latest frontend -- --template react-ts`
2. Install dependencies: `npm i lucide-react clsx tailwindcss postcss autoprefixer katex`
3. Configure Tailwind with dark-mode theme colors (`slate-900`, `zinc-900`, `indigo-500`).
4. Implement TypeScript definitions (`types/api.ts`).
5. Build `StudioView` (Canvas overlay + Split Inspector).
6. Build `BatchView` (Queue table + progress bar + ZIP download).
7. Build `AboutView` (Architecture specs + model benchmarks).
8. Single-port production integration: build frontend into `frontend/dist` and mount as static root in backend.
