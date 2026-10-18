// Indra OCR Batch Processor - Minimal, Pure JS

const API_BASE = window.location.origin;
let selectedFiles = [];

const batchDropzone = document.getElementById("batch-dropzone");
const batchFileInput = document.getElementById("batch-file-input");
const fileListContainer = document.getElementById("batch-file-list");
const btnStart = document.getElementById("btn-batch-start");
const batchStatus = document.getElementById("batch-status");
const resultsBody = document.getElementById("batch-results-body");
const btnDownloadZip = document.getElementById("btn-download-zip");

let lastBatchResults = [];

window.addEventListener("DOMContentLoaded", () => {
  batchDropzone.addEventListener("click", () => batchFileInput.click());
  batchFileInput.addEventListener("change", (e) => addFiles(e.target.files));

  batchDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    batchDropzone.classList.add("dragover");
  });
  batchDropzone.addEventListener("dragleave", () => batchDropzone.classList.remove("dragover"));
  batchDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    batchDropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  btnStart.addEventListener("click", runBatch);
  btnDownloadZip.addEventListener("click", downloadZip);
});

function addFiles(files) {
  for (const f of files) {
    if (!selectedFiles.some(existing => existing.name === f.name && existing.size === f.size)) {
      selectedFiles.push(f);
    }
  }
  renderSelectedFiles();
}

function renderSelectedFiles() {
  if (!selectedFiles.length) {
    fileListContainer.innerHTML = "<em>No files selected.</em>";
    btnStart.disabled = true;
    return;
  }

  btnStart.disabled = false;
  fileListContainer.innerHTML = `<strong>Selected ${selectedFiles.length} file(s):</strong><br>`;
  const ul = document.createElement("ul");
  ul.style.margin = "0.5rem 0";
  selectedFiles.forEach((f, idx) => {
    const li = document.createElement("li");
    li.textContent = `${f.name} (${(f.size / 1024).toFixed(1)} KB) `;
    const rem = document.createElement("a");
    rem.textContent = "[remove]";
    rem.style.cursor = "pointer";
    rem.onclick = () => {
      selectedFiles.splice(idx, 1);
      renderSelectedFiles();
    };
    li.appendChild(rem);
    ul.appendChild(li);
  });
  fileListContainer.appendChild(ul);
}

function runBatch() {
  if (!selectedFiles.length) return;

  const mode = document.getElementById("opt-mode").value;
  const math = document.getElementById("opt-math").checked;
  const furniture = document.getElementById("opt-furniture").checked;
  const dpi = document.getElementById("opt-dpi").value || 200;

  btnStart.disabled = true;
  batchStatus.style.display = "block";
  batchStatus.className = "status-box info";
  batchStatus.textContent = `Processing ${selectedFiles.length} file(s)...`;
  resultsBody.innerHTML = `<tr><td colspan="6">Converting files...</td></tr>`;

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append("files", f));

  const url = `${API_BASE}/api/batch/convert?mode=${mode}&math=${math}&furniture=${furniture}&dpi=${dpi}`;

  const t0 = performance.now();
  fetch(url, {
    method: "POST",
    body: formData
  })
    .then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || "Batch failed"); });
      return r.json();
    })
    .then(data => {
      const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
      const throughput = (data.total_pages / (elapsedSec || 1)).toFixed(1);
      lastBatchResults = data.results;

      batchStatus.className = "status-box success";
      batchStatus.textContent = `Batch complete! Processed ${data.total_pages} page(s) across ${data.total_files} file(s) in ${elapsedSec}s (~${throughput} pages/s).`;

      renderBatchResults(data.results);
      btnDownloadZip.style.display = "inline-block";
      btnStart.disabled = false;
    })
    .catch(err => {
      batchStatus.className = "status-box error";
      batchStatus.textContent = `Batch error: ${err.message}`;
      btnStart.disabled = false;
    });
}

function renderBatchResults(results) {
  resultsBody.innerHTML = "";
  results.forEach(res => {
    const tr = document.createElement("tr");
    const speed = res.pages > 0 && res.total_time_ms > 0 ? (res.pages / (res.total_time_ms / 1000)).toFixed(1) : "-";

    tr.innerHTML = `
      <td><strong>${escapeHtml(res.filename)}</strong></td>
      <td>${res.pages}</td>
      <td>${res.total_time_ms.toFixed(0)} ms</td>
      <td>${speed} p/s</td>
      <td><span style="color:${res.status === 'success' ? '#16a34a' : '#dc2626'}">${res.status}</span></td>
      <td>
        ${res.markdown ? `<a href="data:text/markdown;charset=utf-8,${encodeURIComponent(res.markdown)}" download="${res.filename}.md">[Download .md]</a> ` : ''}
        ${res.text ? `<a href="data:text/plain;charset=utf-8,${encodeURIComponent(res.text)}" download="${res.filename}.txt">[Download .txt]</a>` : ''}
        ${res.error ? `<span style="color:#dc2626">${escapeHtml(res.error)}</span>` : ''}
      </td>
    `;
    resultsBody.appendChild(tr);
  });
}

function downloadZip() {
  if (!lastBatchResults.length || !window.JSZip) return;

  const zip = new JSZip();
  lastBatchResults.forEach(r => {
    if (r.markdown) {
      zip.file(`${r.filename}.md`, r.markdown);
    }
  });

  zip.generateAsync({ type: "blob" }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "indra_ocr_batch_results.zip";
    a.click();
    URL.revokeObjectURL(url);
  });
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
