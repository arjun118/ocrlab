import React, { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import katex from 'katex'
import type { DocumentSummary, PageResult, ProcessOptions } from '../types'

// Configure marked with Github-flavored markdown and soft break support
marked.use({
  breaks: true,
  gfm: true,
})

const BLOCK_COLORS: Record<string, string> = {
  'Section-Header': '#7c3aed',
  'Text': '#0284c7',
  'Table': '#059669',
  'List-Group': '#d97706',
  'Caption': '#db2777',
  'Footnote': '#4b5563',
  'Page-Header': '#9ca3af',
  'Page-Footer': '#9ca3af',
  'Table-Of-Contents': '#2563eb',
  'Form': '#ea580c',
}

interface StudioViewProps {
  onNotify: (msg: string) => void
}

export const StudioView: React.FC<StudioViewProps> = ({ onNotify }) => {
  const [history, setHistory] = useState<DocumentSummary[]>([])
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)
  const [currentDocId, setCurrentDocId] = useState<string | null>(null)
  const [filename, setFilename] = useState<string>('No file loaded')
  const [currentFileType, setCurrentFileType] = useState<string>('pdf')
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(0)
  const [pageData, setPageData] = useState<PageResult | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [convertingAll, setConvertingAll] = useState<boolean>(false)
  const [convertAllSpeed, setConvertAllSpeed] = useState<{ pages: number; sec: number; pps: number } | null>(null)

  const isPPT = currentFileType === 'ppt' || filename.toLowerCase().endsWith('.pptx') || filename.toLowerCase().endsWith('.ppt')

  // Options
  const [options, setOptions] = useState<ProcessOptions>({
    mode: 'auto',
    math: false,
    furniture: false,
    model_order: false,
    image_ocr: true,
    dpi: 200,
    password: null,
  })

  // Overlays & Zoom
  const [showBlocks, setShowBlocks] = useState<boolean>(true)
  const [showLines, setShowLines] = useState<boolean>(false)
  const [showOrder, setShowOrder] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(1.0)

  // Tabs
  const [activeTab, setActiveTab] = useState<'markdown' | 'raw' | 'text' | 'json' | 'telemetry'>('markdown')
  const [fullMarkdown, setFullMarkdown] = useState<string>('')
  const [fullText, setFullText] = useState<string>('')

  // Tooltip
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history')
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch {}
  }

  // Fetch history on mount
  useEffect(() => {
    fetchHistory()
  }, [])

  // Process page when document or page index changes
  const runPageOcr = async (docId: string, pageIdx: number, opts: ProcessOptions) => {
    setLoading(true)
    const isPptDoc = currentFileType === 'ppt' || filename.toLowerCase().endsWith('.pptx') || filename.toLowerCase().endsWith('.ppt')
    onNotify(`Analyzing ${isPptDoc ? 'Slide' : 'Page'} ${pageIdx + 1}...`)
    try {
      const res = await fetch(`/api/document/${docId}/page/${pageIdx}?include_image=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'OCR failed')
      }
      const data: PageResult = await res.json()
      setPageData(data)
      if (data.image_data) {
        setPreviewSrc(data.image_data)
      }
      setFullMarkdown(data.markdown)
      setFullText(data.text)
      onNotify(`${isPptDoc ? 'Slide' : 'Page'} ${pageIdx + 1} analyzed in ${data.timings.total_ms} ms (${data.source})`)
    } catch (e: any) {
      onNotify(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Select document from previous history
  const selectHistoryDoc = async (docId: string) => {
    if (!docId) return
    const doc = history.find((h) => h.doc_id === docId)
    if (!doc) return

    setCurrentDocId(doc.doc_id)
    setCurrentPageIdx(0)
    setTotalPages(doc.total_pages)
    setCurrentFileType(doc.file_type)
    const isPpt = doc.file_type === 'ppt' || doc.filename.toLowerCase().endsWith('.pptx') || doc.filename.toLowerCase().endsWith('.ppt')
    setFilename(`${doc.filename} (${doc.total_pages}${isPpt ? 's' : 'p'})`)
    setConvertAllSpeed(null)
    setPageData(null)
    setFullMarkdown('')
    onNotify(`Switched to previous upload: ${doc.filename}`)
    runPageOcr(doc.doc_id, 0, options)
  }

  // Delete document from history
  const handleDeleteHistory = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/document/${docId}`, { method: 'DELETE' })
      setHistory((prev) => prev.filter((d) => d.doc_id !== docId))
      onNotify('Document removed from history.')
      if (currentDocId === docId) {
        setCurrentDocId(null)
        setCurrentFileType('pdf')
        setFilename('No file loaded')
        setTotalPages(0)
        setCurrentPageIdx(0)
        setPreviewSrc(null)
        setPageData(null)
        setFullMarkdown('')
        setFullText('')
        setConvertAllSpeed(null)
      }
    } catch (err: any) {
      onNotify(`Delete failed: ${err.message}`)
    }
  }

  // Clear all history
  const handleClearAllHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all history and cached documents?')) {
      return
    }
    try {
      const res = await fetch('/api/history', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to clear history')
      setHistory([])
      setCurrentDocId(null)
      setCurrentFileType('pdf')
      setFilename('No file loaded')
      setTotalPages(0)
      setCurrentPageIdx(0)
      setPreviewSrc(null)
      setPageData(null)
      setFullMarkdown('')
      setFullText('')
      setConvertAllSpeed(null)
      onNotify('All history and cached results cleared.')
    } catch (err: any) {
      onNotify(`Clear history failed: ${err.message}`)
    }
  }

  // Upload file
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type.startsWith('image/')) {
      setPreviewSrc(URL.createObjectURL(file))
    }
    setFilename(file.name)
    setConvertAllSpeed(null)
    onNotify(`Uploading ${file.name}...`)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Upload failed')
      }
      const docInfo = await res.json()
      setCurrentDocId(docInfo.doc_id)
      setCurrentPageIdx(0)
      setTotalPages(docInfo.total_pages)
      setCurrentFileType(docInfo.file_type)
      const isPpt = docInfo.file_type === 'ppt' || docInfo.filename.toLowerCase().endsWith('.pptx') || docInfo.filename.toLowerCase().endsWith('.ppt')
      setFilename(`${docInfo.filename} (${docInfo.total_pages}${isPpt ? 's' : 'p'})`)
      runPageOcr(docInfo.doc_id, 0, options)
      fetchHistory()
    } catch (e: any) {
      onNotify(`Upload failed: ${e.message}`)
    }
  }

  // Convert all pages
  const handleConvertAll = async () => {
    if (!currentDocId) return
    setConvertingAll(true)
    const isPptDoc = currentFileType === 'ppt' || filename.toLowerCase().endsWith('.pptx') || filename.toLowerCase().endsWith('.ppt')
    onNotify(`Converting all ${totalPages} ${isPptDoc ? 'slides' : 'pages'} with Indra OCR...`)

    try {
      const res = await fetch(`/api/document/${currentDocId}/convert-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Conversion failed')
      }
      const allData = await res.json()
      const sec = Math.max(0.01, allData.total_time_ms / 1000)
      const pps = Number((allData.total_pages / sec).toFixed(1))
      setConvertAllSpeed({ pages: allData.total_pages, sec, pps })
      setFullMarkdown(allData.markdown)
      setFullText(allData.text)
      setActiveTab('markdown')
      onNotify(`⚡ ${pps} ${isPptDoc ? 'slides' : 'pages'}/sec • Converted all ${allData.total_pages} ${isPptDoc ? 'slides' : 'pages'} in ${sec.toFixed(2)}s!`)
      fetchHistory()
    } catch (e: any) {
      onNotify(`Convert all failed: ${e.message}`)
    } finally {
      setConvertingAll(false)
    }
  }

  // Jump page
  const handleJumpPage = (target: number) => {
    if (!currentDocId) return
    const p = Math.max(0, Math.min(totalPages - 1, target))
    if (p !== currentPageIdx) {
      setCurrentPageIdx(p)
      runPageOcr(currentDocId, p, options)
    }
  }

  // Copy active view
  const handleCopy = () => {
    let text = fullMarkdown
    if (activeTab === 'text') text = fullText
    if (activeTab === 'json') text = JSON.stringify(pageData?.json_data || {}, null, 2)
    navigator.clipboard.writeText(text)
    onNotify('Copied output to clipboard!')
  }

  // Export document
  const handleExport = (fmt: string) => {
    if (!currentDocId) return
    const url = `/api/document/${currentDocId}/export/${fmt}?mode=${options.mode}&math=${options.math}&furniture=${options.furniture}&model_order=${options.model_order}&image_ocr=${options.image_ocr}&dpi=${options.dpi}`
    window.open(url, '_blank')
  }

  // Render markdown with inline LaTeX math and clean list item formatting
  const renderFormattedMarkdown = (raw: string) => {
    if (!raw) return '<em>No text recognized yet.</em>'

    // Separate inline bullets (●, •, etc.) into clean markdown list items ONLY if at line start or after newline
    const bulletFormatted = raw.replace(/(?:\r?\n|^)\s*[•●·▪▫‣]\s*/g, '\n\n* ')

    // Only process LaTeX math if user explicitly enabled math mode
    let mathReplaced = bulletFormatted
    if (options.math) {
      mathReplaced = bulletFormatted.replace(/(?<!\\)\$([^\$\n\|]+)\$/g, (match, eq) => {
        // Skip pure currency like $2.40m, $100, $5.99
        if (/^\s*\d+(?:\.\d+)?[kKmMbB]?\s*$/.test(eq)) {
          return match
        }
        try {
          return katex.renderToString(eq, { throwOnError: false })
        } catch {
          return match
        }
      })
    }

    return marked.parse(mathReplaced, { breaks: true, gfm: true })
  }

  return (
    <>
      {/* Top Configuration & Selection Bar */}
      <div className="control-bar">
        <div className="control-group">
          <button
            type="button"
            className="btn btn-upload-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="nf nf-fa-upload"></i> Upload (PDF/PPT/Image)
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".pdf,image/*,.pptx,.ppt"
            onChange={handleUpload}
          />

          {history.length > 0 && (
            <>
              <span className="label-title">Recent:</span>
              <select
                className="select-dropdown"
                value={currentDocId || ''}
                onChange={(e) => {
                  if (e.target.value === '__clear_all__') {
                    handleClearAllHistory()
                  } else {
                    selectHistoryDoc(e.target.value)
                  }
                }}
              >
                <option value="" disabled>Previous Files ({history.length})...</option>
                {history.map((h) => (
                  <option key={h.doc_id} value={h.doc_id}>
                    {h.filename} ({h.total_pages}{h.file_type === 'ppt' ? 's' : 'p'}) {h.has_full_conversion ? '✓ Full' : ''}
                  </option>
                ))}
                <option value="__clear_all__">🗑️ Clear All History...</option>
              </select>
            </>
          )}
        </div>

        <div className="control-group">
          <span className="label-title">Mode:</span>
          <div className="segmented-control">
            {(['auto', 'ocr', 'text'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={options.mode === m ? 'active' : ''}
                onClick={() => setOptions({ ...options, mode: m })}
              >
                {m === 'auto' ? '⚡ Auto' : m === 'ocr' ? '📷 OCR' : '📄 Text'}
              </button>
            ))}
          </div>

          <label className="checkbox-pill" title="Recognize LaTeX math ($...)">
            <input
              type="checkbox"
              checked={options.math}
              onChange={(e) => setOptions({ ...options, math: e.target.checked })}
            />
            <span><i className="nf nf-md-sigma"></i> Math</span>
          </label>

          <label className="checkbox-pill" title="Keep page running headers and footers">
            <input
              type="checkbox"
              checked={options.furniture}
              onChange={(e) => setOptions({ ...options, furniture: e.target.checked })}
            />
            <span><i className="nf nf-md-table_headers_eye"></i> Headers/Footers</span>
          </label>

          <label className="checkbox-pill" title="OCR images inside digital PDFs or presentation slides">
            <input
              type="checkbox"
              checked={options.image_ocr}
              onChange={(e) => setOptions({ ...options, image_ocr: e.target.checked })}
            />
            <span><i className="nf nf-fa-image"></i> Image OCR</span>
          </label>
        </div>
      </div>

      {/* Dedicated Full-Width Document Navigation Bar */}
      <div className="doc-navbar-full">
        <button
          type="button"
          className={`btn btn-history-toggle ${sidebarOpen ? 'active' : ''}`}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title="Toggle previous uploads sidebar"
        >
          <i className="nf nf-fa-history"></i> History {history.length > 0 ? `(${history.length})` : ''}
        </button>

        <div className="doc-meta-block">
          <i
            className={`nf ${
              isPPT
                ? 'nf-fa-file_powerpoint_o doc-icon-ppt'
                : currentFileType === 'image' || filename.match(/\.(png|jpe?g|webp|bmp|tiff)$/i)
                ? 'nf-fa-file_image_o'
                : 'nf-fa-file_pdf_o'
            } doc-icon-large`}
          ></i>
          <span className="doc-title-text" title={filename}>
            {filename}
          </span>
          <span className="doc-page-count-badge">
            {currentDocId
              ? `${totalPages} ${totalPages === 1 ? (isPPT ? 'Slide' : 'Page') : isPPT ? 'Slides' : 'Pages'}`
              : isPPT
              ? '0 Slides'
              : '0 Pages'}
          </span>
          {convertAllSpeed && (
            <span className="doc-speed-badge" title="Full document conversion throughput">
              <i className="nf nf-md-speedometer"></i> {convertAllSpeed.pps} {isPPT ? 's' : 'p'}/s ({convertAllSpeed.pages}
              {isPPT ? 's' : 'p'} in {convertAllSpeed.sec.toFixed(1)}s)
            </span>
          )}
        </div>

        <div className="doc-nav-center">
          <button
            type="button"
            className="nav-page-btn"
            disabled={!currentDocId || currentPageIdx === 0}
            onClick={() => handleJumpPage(currentPageIdx - 1)}
            title={isPPT ? 'Previous Slide' : 'Previous Page'}
          >
            <i className="nf nf-fa-arrow_left"></i> Prev
          </button>

          <div className="page-counter-box">
            {isPPT ? 'SLIDE' : 'PAGE'}
            <input
              type="number"
              min={currentDocId ? 1 : 0}
              max={totalPages}
              value={currentDocId ? currentPageIdx + 1 : 0}
              onChange={(e) => handleJumpPage(parseInt(e.target.value, 10) - 1)}
              disabled={!currentDocId || totalPages === 0}
              className="page-input-field"
            />
            <span>/ {currentDocId ? totalPages : 0}</span>
          </div>

          <button
            type="button"
            className="nav-page-btn"
            disabled={!currentDocId || currentPageIdx >= totalPages - 1}
            onClick={() => handleJumpPage(currentPageIdx + 1)}
            title={isPPT ? 'Next Slide' : 'Next Page'}
          >
            Next <i className="nf nf-fa-arrow_right"></i>
          </button>

          {totalPages > 1 && (
            <input
              type="range"
              min={1}
              max={totalPages}
              value={currentPageIdx + 1}
              onChange={(e) => handleJumpPage(parseInt(e.target.value, 10) - 1)}
              className="page-slider"
              title={`Scrub ${isPPT ? 'slide' : 'page'} (1 to ${totalPages})`}
            />
          )}
        </div>

        <div className="doc-actions-right">
          <button
            type="button"
            className="btn btn-action-primary"
            disabled={!currentDocId || loading}
            onClick={() => currentDocId && runPageOcr(currentDocId, currentPageIdx, options)}
          >
            <i className={`nf ${loading ? 'nf-fa-spinner' : 'nf-fa-play'}`}></i>{' '}
            {loading ? 'Analyzing...' : isPPT ? 'Run Slide Extraction' : 'Run Page OCR'}
          </button>

          <button
            type="button"
            className="btn btn-action-convert"
            disabled={!currentDocId || convertingAll}
            onClick={handleConvertAll}
            title={isPPT ? 'Convert entire presentation' : 'Convert entire document'}
          >
            <i className={`nf ${convertingAll ? 'nf-fa-spinner' : 'nf-md-file_document_multiple'}`}></i>{' '}
            {convertingAll ? 'Converting...' : isPPT ? `Convert All (${currentDocId ? totalPages : 0}s)` : `Convert All (${currentDocId ? totalPages : 0}p)`}
          </button>
        </div>
      </div>

      {/* Main Workspace with Closable Left History Pane */}
      <div className="workspace-outer">
        {sidebarOpen && (
          <aside className="history-sidebar">
            <div className="history-sidebar-header">
              <h3><i className="nf nf-fa-history"></i> Previous Work ({history.length})</h3>
              <div className="history-header-actions">
                {history.length > 0 && (
                  <button
                    type="button"
                    className="btn-clear-history"
                    onClick={handleClearAllHistory}
                    title="Clear all documents and cache from history"
                  >
                    <i className="nf nf-fa-trash"></i> Clear All
                  </button>
                )}
                <button
                  type="button"
                  className="btn-close-sidebar"
                  onClick={() => setSidebarOpen(false)}
                  title="Close Sidebar"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <p className="history-empty">No previous uploads yet.</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.doc_id}
                    className={`history-card ${currentDocId === h.doc_id ? 'selected' : ''}`}
                    onClick={() => selectHistoryDoc(h.doc_id)}
                  >
                    <div className="history-card-top">
                      <i
                        className={`nf ${
                          h.file_type === 'ppt'
                            ? 'nf-fa-file_powerpoint_o doc-icon-ppt'
                            : h.file_type === 'pdf'
                            ? 'nf-fa-file_pdf_o'
                            : 'nf-fa-file_image_o'
                        } doc-icon`}
                      ></i>
                      <span className="history-card-title" title={h.filename}>{h.filename}</span>
                      <button
                        type="button"
                        className="history-card-del"
                        onClick={(e) => handleDeleteHistory(h.doc_id, e)}
                        title="Delete from history"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="history-card-meta">
                      <span>{h.total_pages} {h.total_pages === 1 ? (h.file_type === 'ppt' ? 'slide' : 'page') : h.file_type === 'ppt' ? 'slides' : 'pages'}</span>
                      <span>{(h.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                      {Boolean(h.has_full_conversion) && (
                        <span className="badge-converted">✓ Converted</span>
                      )}
                      {!h.has_full_conversion && h.cached_pages_count > 0 && (
                        <span className="badge-cached">{h.cached_pages_count}{h.file_type === 'ppt' ? 's' : 'p'} cached</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        <main className="main-workspace">
        {/* Left: Canvas Pane */}
        <section className="pane-canvas">
          {/* Canvas Controls: Overlays & Zoom */}
          <div className="pane-toolbar">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                OVERLAYS:
              </span>
              <label className="checkbox-pill" style={{ padding: '2px 6px' }}>
                <input
                  type="checkbox"
                  checked={showBlocks}
                  onChange={(e) => setShowBlocks(e.target.checked)}
                />{' '}
                Blocks
              </label>
              <label className="checkbox-pill" style={{ padding: '2px 6px' }}>
                <input
                  type="checkbox"
                  checked={showLines}
                  onChange={(e) => setShowLines(e.target.checked)}
                />{' '}
                Lines
              </label>
              <label className="checkbox-pill" style={{ padding: '2px 6px' }}>
                <input
                  type="checkbox"
                  checked={showOrder}
                  onChange={(e) => setShowOrder(e.target.checked)}
                />{' '}
                Sequence
              </label>
            </div>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px' }}>
                ZOOM:
              </span>
              <button type="button" onClick={() => setZoom(Math.max(0.4, zoom - 0.15))}>-</button>
              <button type="button" onClick={() => setZoom(1.0)}>100%</button>
              <button type="button" onClick={() => setZoom(zoom + 0.15)}>+</button>
            </div>
          </div>

          <div className="canvas-viewport">
            <div
              className="canvas-wrapper"
              style={{ transform: `scale(${zoom})` }}
            >
              {previewSrc ? (
                <img
                  ref={imgRef}
                  src={previewSrc}
                  className="canvas-image"
                  alt="Document Page"
                />
              ) : (
                <div style={{ padding: '5rem', color: '#888', textAlign: 'center' }}>
                  <i className="nf nf-fa-cloud_upload" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'block' }}></i>
                  <p style={{ fontWeight: 700, margin: '0.5rem 0' }}>Drop PDF, PPT/PPTX presentation, or image to inspect</p>
                  <small>(Local Processing &bull; Unlimited Pages &bull; SQLite Cached)</small>
                </div>
              )}

              {/* Overlay Layer */}
              <div className="overlay-container">
                {showBlocks &&
                  pageData?.blocks.map((block, idx) => {
                    const [x0, y0, x1, y1] = block.box
                    const color = BLOCK_COLORS[block.label] || '#444'
                    const pw = pageData?.w || 1
                    const ph = pageData?.h || 1
                    const left = `${(x0 / pw) * 100}%`
                    const top = `${(y0 / ph) * 100}%`
                    const width = `${((x1 - x0) / pw) * 100}%`
                    const height = `${((y1 - y0) / ph) * 100}%`

                    return (
                      <div
                        key={`b-${idx}`}
                        className="overlay-block"
                        style={{
                          left,
                          top,
                          width,
                          height,
                          borderColor: color,
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTooltip({
                            text: `[${block.label}]\n${block.text.slice(0, 150)}${block.text.length > 150 ? '...' : ''}`,
                            x: rect.left,
                            y: rect.bottom + 6,
                          })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {block.label !== 'Text' && (
                          <span className="block-label-tag" style={{ background: color }}>
                            {block.label}
                          </span>
                        )}
                      </div>
                    )
                  })}

                {showLines &&
                  pageData?.lines.map((ln, idx) => {
                    const [x0, y0, x1, y1] = ln.box
                    const pw = pageData?.w || 1
                    const ph = pageData?.h || 1
                    const left = `${(x0 / pw) * 100}%`
                    const top = `${(y0 / ph) * 100}%`
                    const width = `${((x1 - x0) / pw) * 100}%`
                    const height = `${((y1 - y0) / ph) * 100}%`

                    return (
                      <div
                        key={`l-${idx}`}
                        className="overlay-line"
                        style={{
                          left,
                          top,
                          width,
                          height,
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTooltip({
                            text: `Conf: ${(ln.conf * 100).toFixed(1)}%\n${ln.text}`,
                            x: rect.left,
                            y: rect.bottom + 6,
                          })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}

                {showOrder &&
                  pageData?.lines.map((ln, idx) => {
                    const [x0, y0] = ln.box
                    const pw = pageData?.w || 1
                    const ph = pageData?.h || 1
                    const left = `${(x0 / pw) * 100}%`
                    const top = `${(y0 / ph) * 100}%`

                    return (
                      <div
                        key={`ord-${idx}`}
                        className="order-dot"
                        style={{
                          left,
                          top,
                        }}
                      >
                        {idx + 1}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </section>

        {/* Right: Output & Inspector Pane */}
        <section className="pane-inspector">
          {pageData?.json_data?.steps && pageData.json_data.steps.length > 0 && (
            <div className="hybrid-banner">
              <div className="hybrid-banner-header">
                <span className="hybrid-title">
                  <i className="nf nf-md-layers_triple"></i> Hybrid Extraction Pipeline (Slide {currentPageIdx + 1})
                </span>
                <span className="hybrid-tag">Native PPTX + LibreOffice + OCR</span>
              </div>
              <div className="hybrid-steps-pills">
                {pageData.json_data.steps.map((step: string, sIdx: number) => (
                  <div key={sIdx} className="hybrid-step-pill">
                    <i className="nf nf-fa-check hybrid-check"></i>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="tabs-bar">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'markdown' ? 'active' : ''}`}
              onClick={() => setActiveTab('markdown')}
            >
              <i className="nf nf-md-markdown"></i> Rendered
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
              onClick={() => setActiveTab('raw')}
            >
              <i className="nf nf-fa-code"></i> Raw MD
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              <i className="nf nf-fa-align_left"></i> Text
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
              onClick={() => setActiveTab('json')}
            >
              <i className="nf nf-fa-code"></i> JSON
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
              onClick={() => setActiveTab('telemetry')}
            >
              <i className="nf nf-md-speedometer"></i> Telemetry
            </button>

            <div className="tab-actions">
              <button type="button" onClick={handleCopy} title="Copy current view to clipboard">
                <i className="nf nf-fa-copy"></i> Copy
              </button>
              <button
                type="button"
                onClick={() => handleExport(activeTab === 'text' ? 'txt' : 'md')}
                title="Download full document"
              >
                <i className="nf nf-fa-download"></i> Export
              </button>
            </div>
          </div>

          <div className="tab-content-area">
            {activeTab === 'markdown' && (
              <div
                className="markdown-view"
                dangerouslySetInnerHTML={{ __html: renderFormattedMarkdown(fullMarkdown) }}
              />
            )}

            {activeTab === 'raw' && (
              <textarea
                className="code-box"
                readOnly
                value={fullMarkdown}
                placeholder="Raw markdown..."
              />
            )}

            {activeTab === 'text' && (
              <textarea
                className="code-box"
                readOnly
                value={fullText}
                placeholder="Plain extracted text..."
              />
            )}

            {activeTab === 'json' && (
              <textarea
                className="code-box"
                readOnly
                value={JSON.stringify(pageData?.json_data || {}, null, 2)}
                placeholder="JSON output..."
              />
            )}

            {activeTab === 'telemetry' && (
              <div>
                <h3 style={{ marginBottom: '0.75rem' }}>
                  <i className="nf nf-md-speedometer"></i> Performance & Extraction Diagnostics
                </h3>
                {pageData ? (
                  <>
                    {pageData.json_data?.steps && pageData.json_data.steps.length > 0 && (
                      <div className="telemetry-hybrid-box">
                        <h4>
                          <i className="nf nf-md-layers_triple"></i> Hybrid Slide Extraction Pipeline Steps
                        </h4>
                        <ol className="telemetry-steps-list">
                          {pageData.json_data.steps.map((step: string, sIdx: number) => (
                            <li key={sIdx} className="telemetry-step-entry">
                              <span className="step-num">{sIdx + 1}</span>
                              <span className="step-desc">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <table className="telemetry-table">
                      <thead>
                        <tr><th>Stage / Property</th><th>Value</th></tr>
                      </thead>
                      <tbody>
                        {convertAllSpeed && (
                          <tr style={{ background: '#f0fdf4' }}>
                            <td><strong><i className="nf nf-md-speedometer"></i> Full Conversion Speed</strong></td>
                            <td><strong style={{ color: '#16a34a' }}>{convertAllSpeed.pps} {isPPT ? 'slides' : 'pages'}/sec</strong> ({convertAllSpeed.pages} {isPPT ? 'slides' : 'pages'} in {convertAllSpeed.sec.toFixed(2)}s)</td>
                          </tr>
                        )}
                        <tr><td><strong>Total Processing Time</strong></td><td><strong>{pageData.timings.total_ms} ms</strong></td></tr>
                        <tr><td>Source &amp; Engine</td><td><code>{pageData.source}</code> ({pageData.note || 'Pipeline'})</td></tr>
                        {pageData.json_data?.slide_title !== undefined && (
                          <tr><td>Slide Title</td><td>{pageData.json_data.slide_title || 'Untitled'}</td></tr>
                        )}
                        {pageData.json_data?.shapes_count !== undefined && (
                          <tr><td>Native Shapes</td><td>{pageData.json_data.shapes_count} shapes</td></tr>
                        )}
                        {pageData.json_data?.tables_count !== undefined && (
                          <tr><td>Native Tables</td><td>{pageData.json_data.tables_count} tables</td></tr>
                        )}
                        {pageData.json_data?.has_notes !== undefined && (
                          <tr><td>Speaker Notes</td><td>{pageData.json_data.has_notes ? 'Extracted' : 'None'}</td></tr>
                        )}
                        <tr><td>Rotation &amp; Skew</td><td>{pageData.rotation}&deg; (skew: {pageData.skew}&deg;)</td></tr>
                        <tr><td>Text Detection (det.onnx)</td><td>{pageData.timings.det_ms} ms</td></tr>
                        <tr><td>Text Recognition (rec.onnx)</td><td>{pageData.timings.rec_ms} ms</td></tr>
                        <tr><td>Reading Order (order.onnx)</td><td>{pageData.timings.order_ms} ms</td></tr>
                        <tr><td>Math Recognizer</td><td>{pageData.timings.math_ms || 0.0} ms</td></tr>
                        <tr><td>Orientation Check</td><td>{pageData.timings.orient_ms || 0.0} ms</td></tr>
                        <tr><td>PDF Render (pypdfium2)</td><td>{pageData.timings.render_ms || 0.0} ms</td></tr>
                        <tr><td>Lines Detected</td><td>{pageData.lines.length} lines</td></tr>
                        <tr><td>Layout Blocks</td><td>{pageData.blocks.length} blocks</td></tr>
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p>No page analyzed yet.</p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="ocr-tooltip"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, whiteSpace: 'pre-wrap' }}
        >
          {tooltip.text}
        </div>
      )}
    </>
  )
}
