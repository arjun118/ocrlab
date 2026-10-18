import React from 'react'

export const BenchmarksView: React.FC = () => {
  return (
    <div className="view-container">
      <h2><i className="nf nf-md-speedometer"></i> Indra OCR Specifications &amp; Benchmarks</h2>
      <p style={{ margin: '0.5rem 0 1rem 0' }}>
        Ultra-lightweight 1M parameter model designed by Datalab for blazing CPU document intelligence.
      </p>

      <fieldset className="minimal-box">
        <legend>Core Specifications</legend>
        <ul style={{ margin: '0.4rem 0 0.4rem 1.25rem', lineHeight: 1.8 }}>
          <li><strong>Recognizer Architecture:</strong> ~1M parameters on ONNX Runtime (CPU inference). No PyTorch dependencies.</li>
          <li><strong>Total Package Size:</strong> ~18 MB total models.</li>
          <li><strong>Processing Speed:</strong> Up to <strong>49 pages/s</strong> on multi-core CPU.</li>
          <li><strong>Average Latency:</strong> ~230 ms per page on 4 x86 vCPUs (12&ndash;24&times; faster than Tesseract/PaddleOCR).</li>
          <li><strong>Benchmark Score:</strong> <strong>62.1</strong> OmniParseBench headline, ahead of PaddleOCR PP-StructureV3 (58.4).</li>
          <li><strong>Input Limits:</strong> Completely local execution. No file size or page count limits.</li>
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

      <h3>Language Support</h3>
      <ul style={{ margin: '0.4rem 0 1rem 1.25rem' }}>
        <li><strong>Scans &amp; Images (OCR):</strong> Latin (50+ languages), Cyrillic, Greek, Devanagari, Bengali, Chinese (simplified &amp; traditional).</li>
        <li><strong>Digital PDFs (Text layer):</strong> Any script. Verified on 75+ language families including Arabic, Hebrew, Japanese, Korean, and Indic scripts.</li>
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
