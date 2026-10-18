import React from 'react'

export const AboutView: React.FC = () => {
  return (
    <div className="view-container">
      <h2><i className="nf nf-md-information"></i> About OCR Lab &amp; Model Intelligence</h2>
      <p style={{ margin: '0.5rem 0 1.25rem 0', color: 'var(--text-muted)' }}>
        Local-first, privacy-focused document intelligence powered by ultra-lightweight ONNX neural models.
      </p>

      {/* Hugging Face Model Card Callout */}
      <fieldset className="minimal-box" style={{ background: '#fdfbf7', borderColor: '#fed7aa', marginBottom: '1.5rem' }}>
        <legend style={{ color: '#c2410c' }}>
          <i className="nf nf-fa-cube"></i> Hugging Face Model Hub
        </legend>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', color: '#111' }}>
              datalab-to / indra-ocr
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#555' }}>
              Ultra-compact ~1M parameter layout and text recognition engine engineered for blazingly fast CPU-only inference.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <a
              href="https://huggingface.co/datalab-to/indra-ocr"
              target="_blank"
              rel="noreferrer"
              className="btn btn-upload-primary"
              style={{ textDecoration: 'none', background: '#d97706 !important', color: '#fff !important' }}
            >
              <i className="nf nf-fa-external_link"></i> Hugging Face Model
            </a>
            <a
              href="https://huggingface.co/datalab-to"
              target="_blank"
              rel="noreferrer"
              className="btn btn-sample"
              style={{ textDecoration: 'none' }}
            >
              <i className="nf nf-fa-users"></i> Datalab Org
            </a>
          </div>
        </div>
      </fieldset>

      <fieldset className="minimal-box">
        <legend>Core Specifications</legend>
        <ul style={{ margin: '0.4rem 0 0.4rem 1.25rem', lineHeight: 1.8 }}>
          <li><strong>Architecture:</strong> ~1M parameter vision transformer running on ONNX Runtime (CPU multi-thread).</li>
          <li><strong>Package Size:</strong> ~18 MB total ONNX model weights. Completely self-contained.</li>
          <li><strong>Processing Throughput:</strong> Up to <strong>49 pages/s</strong> on multi-core CPU.</li>
          <li><strong>Local Execution:</strong> 100% private. Runs on device without internet, GPU, or external API calls.</li>
          <li><strong>Document Support:</strong> PDF (digital + scanned), PowerPoint (.pptx &amp; .ppt), and standard image formats.</li>
          <li><strong>Persistence &amp; Storage:</strong> SQLite Write-Ahead Logging (WAL) database with automatic deduplication.</li>
        </ul>
      </fieldset>

      <h3>Throughput Comparison (AMD EPYC, CPU Only)</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Engine</th>
            <th>4 cores</th>
            <th>8 cores</th>
            <th>16 cores</th>
            <th>32 cores</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Indra OCR (auto)</strong></td>
            <td><strong>7.3 p/s</strong></td>
            <td><strong>14.2 p/s</strong></td>
            <td><strong>27.2 p/s</strong></td>
            <td><strong>49.4 p/s</strong></td>
          </tr>
          <tr>
            <td>Indra OCR <code>--math</code></td>
            <td>~5 p/s</td>
            <td>&ndash;</td>
            <td>&ndash;</td>
            <td>~30 p/s</td>
          </tr>
          <tr>
            <td>PaddleOCR PP-OCRv6 (RapidOCR)</td>
            <td>0.65 p/s</td>
            <td>1.24 p/s</td>
            <td>2.42 p/s</td>
            <td>4.28 p/s</td>
          </tr>
          <tr>
            <td>Tesseract 5</td>
            <td>0.78 p/s</td>
            <td>1.37 p/s</td>
            <td>2.27 p/s</td>
            <td>2.92 p/s</td>
          </tr>
        </tbody>
      </table>

      <h3>Accuracy on OmniParseBench (2,937 pages)</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Engine</th>
            <th>Headline</th>
            <th>Text</th>
            <th>Tables</th>
            <th>Layout</th>
            <th>Median Latency</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Indra OCR (auto)</strong></td>
            <td>62.1</td>
            <td>41.3</td>
            <td><strong>56.4</strong></td>
            <td><strong>88.6</strong></td>
            <td><strong>228 ms</strong></td>
          </tr>
          <tr>
            <td><strong>Indra OCR <code>--math</code></strong></td>
            <td><strong>66.8</strong></td>
            <td><strong>57.5</strong></td>
            <td>54.8</td>
            <td>88.1</td>
            <td>~360 ms</td>
          </tr>
          <tr>
            <td>PaddleOCR PP-StructureV3</td>
            <td>58.4</td>
            <td>55.6</td>
            <td>47.8</td>
            <td>71.7</td>
            <td>40,958 ms</td>
          </tr>
          <tr>
            <td>Tesseract 5</td>
            <td>&ndash;</td>
            <td>19.3</td>
            <td>0.0</td>
            <td>&ndash;</td>
            <td>5,496 ms</td>
          </tr>
        </tbody>
      </table>

      <h3>Docker Storage &amp; Persistence</h3>
      <p>Attach a persistent host volume to store all uploaded files, history, and SQLite conversions:</p>
      <pre style={{ background: '#f4f4f4', padding: '0.75rem', border: '1px solid var(--border-light)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
        docker run -d -p 8000:8000 -v $(pwd)/data:/app/data --name ocrlab ocrlab:latest
      </pre>

      <h3>Language Support</h3>
      <ul style={{ margin: '0.4rem 0 1rem 1.25rem' }}>
        <li><strong>Scans &amp; Images (OCR):</strong> Latin (50+ languages), Cyrillic, Greek, Devanagari, Bengali, Chinese (simplified &amp; traditional).</li>
        <li><strong>Digital PDFs &amp; Presentations:</strong> Any script. Verified on 75+ language families including Arabic, Hebrew, Japanese, Korean, and Indic scripts.</li>
      </ul>

      <h3>Layout Block Hierarchy</h3>
      <p>Semantic tags detected by Indra's layout model:</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0.5rem 0' }}>
        {['Section-Header', 'Text', 'Table', 'List-Group', 'Caption', 'Footnote', 'Page-Header', 'Page-Footer', 'Table-Of-Contents', 'Form'].map((tag) => (
          <span key={tag} className="checkbox-pill">
            <code>{tag}</code>
          </span>
        ))}
      </div>
    </div>
  )
}
