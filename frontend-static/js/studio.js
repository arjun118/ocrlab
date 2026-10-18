// Indra OCR Studio - Intuitive Vanilla JS with Nerd Font Support

const API_BASE = window.location.origin;

let currentDocId = null;
let currentPageIdx = 0;
let totalPages = 1;
let currentPageData = null;
let zoomLevel = 1.0;
let activeTab = "tab-markdown";

const BLOCK_COLORS = {
  "Section-Header": "#7c3aed",
  "Text": "#0284c7",
  "Table": "#059669",
  "List-Group": "#d97706",
  "Caption": "#db2777",
  "Footnote": "#4b5563",
  "Page-Header": "#9ca3af",
  "Page-Footer": "#9ca3af",
  "Table-Of-Contents": "#2563eb",
  "Form": "#ea580c"
};

// DOM Elements
const fileInput = document.getElementById("file-input");
const btnUpload = document.getElementById("btn-upload");
const samplesContainer = document.getElementById("samples-container");
const canvasWrapper = document.getElementById("canvas-wrapper");
const canvasImg = document.getElementById("canvas-img");
const overlayContainer = document.getElementById("overlay-container");
const tooltip = document.getElementById("ocr-tooltip");
const toast = document.getElementById("status-toast");

// Init
window.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadSamples();
  checkApiHealth();
});

function checkApiHealth() {
  fetch(`${API_BASE}/api/health`)
    .then(r => r.json())
    .then(data => {
      const banner = document.getElementById("backend-status-text");
      if (banner) {
        banner.textContent = `1M ONNX &bull; ${data.threads} CPU Cores`;
      }
    })
    .catch(() => {
      showToast("Backend offline or unreachable at " + API_BASE, 4000);
    });
}

function showToast(msg, duration = 2500) {
  toast.innerHTML = msg;
  toast.style.display = "block";
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = "none";
  }, duration);
}

function setupEventListeners() {
  // Upload button
  btnUpload.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) uploadFile(e.target.files[0]);
  });

  // Re-run button
  document.getElementById("btn-run").addEventListener("click", () => {
    if (currentDocId) {
      processCurrentPage();
    } else {
      showToast("Select a sample or upload a document first.");
    }
  });

  // Convert All button
  document.getElementById("btn-convert-all").addEventListener("click", () => {
    if (currentDocId) {
      convertAllPages();
    } else {
      showToast("Select a sample or upload a document first.");
    }
  });

  // Page Nav & Direct Jump
  const jumpInput = document.getElementById("jump-page-input");
  jumpInput.addEventListener("change", () => {
    let p = parseInt(jumpInput.value, 10);
    if (isNaN(p) || p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    jumpInput.value = p;
    if (currentPageIdx !== p - 1) {
      currentPageIdx = p - 1;
      processCurrentPage();
    }
  });
  jumpInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") jumpInput.blur();
  });
  document.getElementById("btn-prev").addEventListener("click", () => {
    if (currentPageIdx > 0) {
      currentPageIdx--;
      processCurrentPage();
    }
  });
  document.getElementById("btn-next").addEventListener("click", () => {
    if (currentPageIdx < totalPages - 1) {
      currentPageIdx++;
      processCurrentPage();
    }
  });

  // Zoom
  document.getElementById("btn-zoom-in").addEventListener("click", () => setZoom(zoomLevel + 0.15));
  document.getElementById("btn-zoom-out").addEventListener("click", () => setZoom(Math.max(0.4, zoomLevel - 0.15)));
  document.getElementById("btn-zoom-reset").addEventListener("click", () => setZoom(1.0));

  // Toggles
  document.getElementById("toggle-lines").addEventListener("change", renderOverlays);
  document.getElementById("toggle-blocks").addEventListener("change", renderOverlays);
  document.getElementById("toggle-order").addEventListener("change", renderOverlays);

  // Tabs
  document.querySelectorAll(".tabs-bar .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs-bar .tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content-area").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.target;
      const target = document.getElementById(activeTab);
      if (target) target.classList.add("active");
    });
  });

  // Copy Action
  document.getElementById("btn-copy").addEventListener("click", () => {
    let content = "";
    if (activeTab === "tab-markdown" || activeTab === "tab-raw") {
      content = document.getElementById("raw-markdown-view").value;
    } else if (activeTab === "tab-text") {
      content = document.getElementById("plain-text-view").value;
    } else if (activeTab === "tab-json") {
      content = document.getElementById("json-view").value;
    }
    if (content) {
      navigator.clipboard.writeText(content);
      showToast('<i class="nf nf-fa-check"></i> Copied to clipboard!');
    }
  });

  // Download Action
  document.getElementById("btn-download").addEventListener("click", () => {
    if (!currentDocId) return;
    let fmt = "md";
    if (activeTab === "tab-text") fmt = "txt";
    if (activeTab === "tab-json") fmt = "json";
    exportDoc(fmt);
  });

  // Window resize
  window.addEventListener("resize", renderOverlays);
}

function setZoom(val) {
  zoomLevel = val;
  canvasWrapper.style.transform = `scale(${zoomLevel})`;
}

function loadSamples() {
  fetch(`${API_BASE}/api/samples`)
    .then(r => r.json())
    .then(samples => {
      samplesContainer.innerHTML = "";
      samples.forEach(s => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-sample";
        btn.innerHTML = `<i class="nf nf-fa-file_image_o"></i> ${s.name.split(" (")[0]}`;
        btn.title = s.description;
        btn.onclick = (e) => selectSample(s, e);
        samplesContainer.appendChild(btn);
      });
    })
    .catch(() => {});
}

function selectSample(sample, e) {
  // 1. Instant preview switch
  canvasImg.src = `${API_BASE}/samples/${sample.filename}`;
  overlayContainer.innerHTML = "";
  document.getElementById("doc-title").textContent = sample.name;
  document.getElementById("tab-markdown-content").innerHTML = "<p><em>Running Indra OCR...</em></p>";

  // Active highlight
  document.querySelectorAll(".btn-sample").forEach(el => el.classList.remove("active"));
  if (e && e.currentTarget) e.currentTarget.classList.add("active");

  showToast(`Loading & analyzing ${sample.name}...`);

  // 2. Register & process
  fetch(`${API_BASE}/api/samples/load/${sample.id}`, { method: "POST" })
    .then(r => {
      if (!r.ok) throw new Error("Failed to load sample");
      return r.json();
    })
    .then(res => {
      currentDocId = res.doc_id;
      currentPageIdx = 0;
      totalPages = res.total_pages;
      document.getElementById("doc-title").textContent = `${res.filename} (${res.total_pages}p)`;
      processCurrentPage();
    })
    .catch(err => showToast(err.message, 3500));
}

function uploadFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    showToast(`File exceeds 50MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`, 4500);
    return;
  }

  showToast(`Uploading ${file.name}...`);

  // Instant local preview for images
  if (file.type.startsWith("image/")) {
    canvasImg.src = URL.createObjectURL(file);
    overlayContainer.innerHTML = "";
    document.getElementById("doc-title").textContent = file.name;
    document.getElementById("tab-markdown-content").innerHTML = "<p><em>Uploading & recognizing...</em></p>";
  }

  const formData = new FormData();
  formData.append("file", file);

  fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData
  })
    .then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || "Upload failed"); });
      return r.json();
    })
    .then(res => {
      currentDocId = res.doc_id;
      currentPageIdx = 0;
      totalPages = res.total_pages;
      document.getElementById("doc-title").textContent = `${res.filename} (${res.total_pages}p)`;
      processCurrentPage();
    })
    .catch(err => showToast(err.message, 4500));
}

function getOptions() {
  const modeRadio = document.querySelector('input[name="opt-mode-radio"]:checked');
  return {
    mode: modeRadio ? modeRadio.value : "auto",
    math: document.getElementById("opt-math").checked,
    furniture: document.getElementById("opt-furniture").checked,
    model_order: document.getElementById("opt-model-order").checked,
    image_ocr: document.getElementById("opt-image-ocr").checked,
    dpi: 200.0,
    password: null
  };
}

function processCurrentPage() {
  if (!currentDocId) return;

  const opts = getOptions();
  showToast(`Running Indra OCR (Page ${currentPageIdx + 1})...`);
  
  const jumpInput = document.getElementById("jump-page-input");
  if (jumpInput) {
    jumpInput.value = currentPageIdx + 1;
    jumpInput.max = totalPages;
  }
  const totalCountEl = document.getElementById("total-pages-count");
  if (totalCountEl) totalCountEl.textContent = totalPages;

  const btnConvertAll = document.getElementById("btn-convert-all");
  if (btnConvertAll) {
    btnConvertAll.innerHTML = `<i class="nf nf-md-file_document_multiple"></i> Convert All (${totalPages}p)`;
  }

  document.getElementById("btn-prev").disabled = currentPageIdx === 0;
  document.getElementById("btn-next").disabled = currentPageIdx >= totalPages - 1;

  fetch(`${API_BASE}/api/document/${currentDocId}/page/${currentPageIdx}?include_image=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts)
  })
    .then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || "Processing failed"); });
      return r.json();
    })
    .then(data => {
      currentPageData = data;
      showToast(`Finished in ${data.timings.total_ms} ms (${data.source})`);
      renderPageData(data);
    })
    .catch(err => showToast(err.message, 3500));
}

function convertAllPages() {
  if (!currentDocId) return;
  const opts = getOptions();
  const btn = document.getElementById("btn-convert-all");
  btn.disabled = true;
  btn.innerHTML = `<i class="nf nf-fa-spinner"></i> Converting ${totalPages}p...`;
  showToast(`Converting all ${totalPages} pages with Indra OCR (CPU)...`, 8000);

  fetch(`${API_BASE}/api/document/${currentDocId}/convert-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts)
  })
    .then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || "Conversion failed"); });
      return r.json();
    })
    .then(res => {
      btn.disabled = false;
      btn.innerHTML = `<i class="nf nf-md-file_document_multiple"></i> Convert All (${totalPages}p)`;
      showToast(`Converted all ${res.total_pages} pages in ${(res.total_time_ms / 1000).toFixed(1)}s!`, 4000);

      // Populate full document in tabs
      document.getElementById("raw-markdown-view").value = res.markdown;
      document.getElementById("plain-text-view").value = res.text;
      
      const mdContainer = document.getElementById("tab-markdown-content");
      if (window.marked) {
        mdContainer.innerHTML = marked.parse(res.markdown || "(No text recognized)");
      }
      if (window.renderMathInElement) {
        try {
          renderMathInElement(mdContainer, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false }
            ],
            throwOnError: false
          });
        } catch (e) {}
      }

      // Switch to Rendered Markdown tab to view full book
      document.querySelector('.tab-btn[data-target="tab-markdown"]').click();
    })
    .catch(err => {
      btn.disabled = false;
      btn.innerHTML = `<i class="nf nf-md-file_document_multiple"></i> Convert All (${totalPages}p)`;
      showToast(`Error: ${err.message}`, 4500);
    });
}

function renderPageData(data) {
  // 1. Render Image & Overlays
  if (data.image_data) {
    canvasImg.onload = () => {
      renderOverlays();
    };
    canvasImg.src = data.image_data;
    if (canvasImg.complete) {
      renderOverlays();
    }
  }

  // 2. Render Markdown & LaTeX
  const mdContainer = document.getElementById("tab-markdown-content");
  if (window.marked) {
    mdContainer.innerHTML = marked.parse(data.markdown || "(No text recognized)");
  } else {
    mdContainer.innerHTML = `<pre>${escapeHtml(data.markdown || "(Empty)")}</pre>`;
  }

  if (window.renderMathInElement) {
    try {
      renderMathInElement(mdContainer, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    } catch (e) {}
  }

  // 3. Raw values
  document.getElementById("raw-markdown-view").value = data.markdown || "";
  document.getElementById("plain-text-view").value = data.text || "";
  document.getElementById("json-view").value = JSON.stringify(data.json_data, null, 2);

  // 4. Telemetry
  renderTelemetry(data);
}

function renderTelemetry(data) {
  const container = document.getElementById("telemetry-table-body");
  const t = data.timings;
  container.innerHTML = `
    <tr><td><strong>Total Processing Time</strong></td><td><strong>${t.total_ms} ms</strong></td></tr>
    <tr><td>Page Extraction Source</td><td><code>${data.source}</code> (${data.note || 'fast CPU path'})</td></tr>
    <tr><td>Orientation / Skew Alignment</td><td>${data.rotation}&deg; (skew: ${data.skew}&deg;)</td></tr>
    <tr><td>Text Detection (det.onnx)</td><td>${t.det_ms} ms</td></tr>
    <tr><td>Text Recognition (rec.onnx)</td><td>${t.rec_ms} ms</td></tr>
    <tr><td>Reading Order Model (order.onnx)</td><td>${t.order_ms} ms</td></tr>
    <tr><td>Math Classifier &amp; Decoder</td><td>${t.math_ms || 0.0} ms</td></tr>
    <tr><td>Orientation Model (orient.onnx)</td><td>${t.orient_ms || 0.0} ms</td></tr>
    <tr><td>PDF Rendering Engine</td><td>${t.render_ms || 0.0} ms</td></tr>
    <tr><td>Recognized Text Lines</td><td>${data.lines.length} lines</td></tr>
    <tr><td>Structural Layout Blocks</td><td>${data.blocks.length} blocks</td></tr>
  `;
}

function renderOverlays() {
  if (!currentPageData) return;
  overlayContainer.innerHTML = "";

  const showLines = document.getElementById("toggle-lines").checked;
  const showBlocks = document.getElementById("toggle-blocks").checked;
  const showOrder = document.getElementById("toggle-order").checked;

  const w = currentPageData.w;
  const h = currentPageData.h;
  if (!w || !h) return;

  const dispW = canvasImg.clientWidth;
  const dispH = canvasImg.clientHeight;
  const sx = dispW / w;
  const sy = dispH / h;

  // 1. Layout Blocks
  if (showBlocks) {
    currentPageData.blocks.forEach((b, idx) => {
      const box = b.box;
      const el = document.createElement("div");
      el.className = "box-block";
      const col = BLOCK_COLORS[b.label] || "#2563eb";
      el.style.borderColor = col;
      el.style.left = `${box[0] * sx}px`;
      el.style.top = `${box[1] * sy}px`;
      el.style.width = `${(box[2] - box[0]) * sx}px`;
      el.style.height = `${(box[3] - box[1]) * sy}px`;

      const tag = document.createElement("span");
      tag.className = "box-block-tag";
      tag.style.backgroundColor = col;
      tag.textContent = b.label;
      el.appendChild(tag);

      el.addEventListener("mouseenter", (e) => showTooltip(e, `[${b.label}] Block #${idx + 1}\n${b.text.slice(0, 100)}`));
      el.addEventListener("mouseleave", hideTooltip);

      overlayContainer.appendChild(el);
    });
  }

  // 2. Lines
  if (showLines) {
    currentPageData.lines.forEach((ln, idx) => {
      const box = ln.box;
      const el = document.createElement("div");
      el.className = "box-line";
      el.style.left = `${box[0] * sx}px`;
      el.style.top = `${box[1] * sy}px`;
      el.style.width = `${(box[2] - box[0]) * sx}px`;
      el.style.height = `${(box[3] - box[1]) * sy}px`;

      el.addEventListener("mouseenter", (e) => showTooltip(e, `Line #${idx + 1} (${(ln.conf * 100).toFixed(0)}% conf):\n"${ln.text}"`));
      el.addEventListener("mouseleave", hideTooltip);

      overlayContainer.appendChild(el);
    });
  }

  // 3. Reading Order
  if (showOrder) {
    currentPageData.lines.forEach((ln, idx) => {
      const box = ln.box;
      const dot = document.createElement("div");
      dot.className = "order-dot";
      dot.textContent = idx + 1;
      dot.style.left = `${box[0] * sx}px`;
      dot.style.top = `${box[1] * sy}px`;
      overlayContainer.appendChild(dot);
    });
  }
}

function showTooltip(e, text) {
  tooltip.textContent = text;
  tooltip.style.left = `${e.clientX + 12}px`;
  tooltip.style.top = `${e.clientY + 12}px`;
  tooltip.style.display = "block";
}

function hideTooltip() {
  tooltip.style.display = "none";
}

function exportDoc(fmt) {
  if (!currentDocId) {
    showToast("No document loaded to export.");
    return;
  }
  const opts = getOptions();
  const url = `${API_BASE}/api/document/${currentDocId}/export/${fmt}?mode=${opts.mode}&math=${opts.math}&furniture=${opts.furniture}&model_order=${opts.model_order}&image_ocr=${opts.image_ocr}&dpi=${opts.dpi}`;
  window.open(url, "_blank");
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
