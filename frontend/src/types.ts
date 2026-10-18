export interface ProcessOptions {
  mode: 'auto' | 'ocr' | 'text'
  math: boolean
  furniture: boolean
  model_order: boolean
  image_ocr: boolean
  dpi: number
  password?: string | null
}

export interface LineItem {
  box: [number, number, number, number]
  text: string
  conf: number
}

export interface BlockItem {
  label: string
  box: [number, number, number, number]
  text: string
}

export interface PageResult {
  page_index: number
  page_number: number
  w: number
  h: number
  image_data?: string
  lines: LineItem[]
  blocks: BlockItem[]
  markdown: string
  text: string
  source: string
  rotation: number
  skew: number
  note: string
  timings: Record<string, number>
  json_data: any
}

export interface UploadResponse {
  doc_id: string
  filename: string
  file_type: string
  total_pages: number
  file_size_bytes: number
}

export interface SampleItem {
  id: string
  name: string
  description: string
  filename: string
}

export interface ConvertAllResponse {
  doc_id: string
  filename: string
  total_pages: number
  markdown: string
  text: string
  pages: PageResult[]
  total_time_ms: number
}

export interface BatchFileResult {
  filename: string
  status: string
  pages: number
  total_time_ms: number
  markdown: string
  text: string
  error?: string
}

export interface BatchResponse {
  total_files: number
  successful_files: number
  total_pages: number
  total_time_ms: number
  results: BatchFileResult[]
}

export interface DocumentSummary {
  doc_id: string
  file_hash: string
  filename: string
  file_type: string
  total_pages: number
  file_size_bytes: number
  cached_pages_count: number
  has_full_conversion: number
  created_at: number
  last_accessed: number
}
