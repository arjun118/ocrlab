import React, { useRef, useState } from 'react'
import JSZip from 'jszip'
import type { BatchFileResult, ProcessOptions } from '../types'

interface BatchViewProps {
  onNotify: (msg: string) => void
}

export const BatchView: React.FC<BatchViewProps> = ({ onNotify }) => {
  const [files, setFiles] = useState<File[]>([])
  const [running, setRunning] = useState<boolean>(false)
  const [results, setResults] = useState<BatchFileResult[]>([])
  const [summary, setSummary] = useState<{ total_pages: number; time_sec: number; speed: number } | null>(null)

  const [options, setOptions] = useState<ProcessOptions>({
    mode: 'auto',
    math: false,
    furniture: false,
    model_order: false,
    image_ocr: true,
    dpi: 200,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddFiles = (newFiles: FileList | null) => {
    if (!newFiles) return
    const valid: File[] = []
    for (let i = 0; i < newFiles.length; i++) {
      valid.push(newFiles[i])
    }
    setFiles((prev) => [...prev, ...valid])
  }

  const handleRunBatch = async () => {
    if (!files.length) return
    setRunning(true)
    onNotify(`Running batch OCR on ${files.length} file(s)...`)
    setResults([])
    setSummary(null)

    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))

    const url = `/api/batch/convert?mode=${options.mode}&math=${options.math}&furniture=${options.furniture}&dpi=${options.dpi}`
    const t0 = performance.now()

    try {
      const res = await fetch(url, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Batch conversion failed')
      }
      const data = await res.json()
      const elapsed = (performance.now() - t0) / 1000
      const speed = data.total_pages / (elapsed || 1)

      setResults(data.results)
      setSummary({ total_pages: data.total_pages, time_sec: elapsed, speed })
      onNotify(`Batch finished: ${data.total_pages} pages in ${elapsed.toFixed(1)}s (~${speed.toFixed(1)} p/s)!`)
    } catch (e: any) {
      onNotify(`Batch error: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  const handleDownloadZip = async () => {
    if (!results.length) return
    const zip = new JSZip()
    results.forEach((r) => {
      if (r.markdown) zip.file(`${r.filename}.md`, r.markdown)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'indra_ocr_batch_results.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view-container">
      <h2><i className="nf nf-md-layers_triple"></i> Multi-File Batch Conversion</h2>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        Convert folders of PDFs, PPTs, and scans concurrently using multi-core ONNX inference. (Unlimited pages & file size).
      </p>

      <fieldset className="minimal-box">
        <legend>1. Upload Documents</legend>
        <div
          className="dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleAddFiles(e.dataTransfer.files)
          }}
        >
          <i className="nf nf-fa-files_o" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}></i>
          <strong>Drop multiple PDFs, PPTs, or images here</strong> or click to browse
          <input
            type="file"
            ref={fileInputRef}
            multiple
            style={{ display: 'none' }}
            accept=".pdf,image/*,.pptx,.ppt"
            onChange={(e) => handleAddFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <strong>Selected {files.length} file(s):</strong>
            <ul style={{ margin: '0.4rem 0 0.4rem 1.25rem' }}>
              {files.map((f, idx) => (
                <li key={idx}>
                  {f.name} ({(f.size / 1024).toFixed(0)} KB){' '}
                  <button
                    type="button"
                    style={{ padding: '0 4px', fontSize: '0.75rem', border: 'none', background: 'none', color: '#dc2626' }}
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                  >
                    [remove]
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className="minimal-box">
        <legend>2. Batch Parameters</legend>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontWeight: 700 }}>Mode: </label>
            <select
              value={options.mode}
              onChange={(e) => setOptions({ ...options, mode: e.target.value as any })}
              style={{ padding: '3px 6px', fontFamily: 'inherit' }}
            >
              <option value="auto">auto (Digital layer + OCR fallback)</option>
              <option value="ocr">ocr (Pure visual OCR)</option>
              <option value="text">text (Text layer only)</option>
            </select>
          </div>

          <label className="checkbox-pill">
            <input
              type="checkbox"
              checked={options.math}
              onChange={(e) => setOptions({ ...options, math: e.target.checked })}
            />{' '}
            LaTeX Math
          </label>

          <label className="checkbox-pill">
            <input
              type="checkbox"
              checked={options.furniture}
              onChange={(e) => setOptions({ ...options, furniture: e.target.checked })}
            />{' '}
            Headers/Footers
          </label>

          <button
            type="button"
            className="primary"
            disabled={!files.length || running}
            onClick={handleRunBatch}
          >
            <i className={`nf ${running ? 'nf-fa-spinner' : 'nf-fa-play'}`}></i>{' '}
            {running ? 'Processing Batch...' : 'Start Batch Conversion'}
          </button>

          {results.length > 0 && (
            <button type="button" onClick={handleDownloadZip}>
              <i className="nf nf-fa-file_zip_o"></i> Download All as ZIP (.zip)
            </button>
          )}
        </div>
      </fieldset>

      {summary && (
        <div style={{ background: '#fff', border: '2px solid #111', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          <strong>Batch Completed:</strong> Processed {summary.total_pages} page(s) in {summary.time_sec.toFixed(1)}s (~<strong>{summary.speed.toFixed(1)} pages/s</strong> throughput).
        </div>
      )}

      {results.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Pages</th>
              <th>Time</th>
              <th>Speed</th>
              <th>Status</th>
              <th>Downloads</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td><strong>{r.filename}</strong></td>
                <td>{r.pages}</td>
                <td>{r.total_time_ms.toFixed(0)} ms</td>
                <td>{r.pages > 0 ? (r.pages / (r.total_time_ms / 1000)).toFixed(1) : '-'} p/s</td>
                <td>
                  <span style={{ color: r.status === 'success' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.markdown && (
                    <a
                      href={`data:text/markdown;charset=utf-8,${encodeURIComponent(r.markdown)}`}
                      download={`${r.filename}.md`}
                      style={{ marginRight: '8px' }}
                    >
                      [.md]
                    </a>
                  )}
                  {r.text && (
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(r.text)}`}
                      download={`${r.filename}.txt`}
                    >
                      [.txt]
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
