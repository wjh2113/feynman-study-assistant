import path from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getVisionConfig } from "./model-config.mjs";
import { recognizeImage } from "./ocr.mjs";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_OCR_IMAGES_PER_FILE = 20;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function imageMime(filename, fallback = "image/png") {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  return fallback;
}

function createReport(format) {
  return {
    format,
    nativeCharacters: 0,
    ocrCharacters: 0,
    imagesFound: 0,
    imagesOcrd: 0,
    ocrStatus: "not_needed",
    warnings: []
  };
}

function appendWarning(report, warning) {
  if (warning && !report.warnings.includes(warning)) report.warnings.push(warning);
}

function mergeNativeAndOcr(nativeText, ocrText) {
  const nativeClean = cleanText(nativeText);
  const ocrClean = cleanText(ocrText);
  if (!ocrClean) return nativeClean;
  const comparableNative = nativeClean.toLowerCase().replace(/\s+/g, "");
  const comparableOcr = ocrClean.toLowerCase().replace(/\s+/g, "");
  if (
    comparableNative &&
    (comparableNative.includes(comparableOcr) || comparableOcr === comparableNative)
  ) {
    return nativeClean;
  }
  return [nativeClean, `[OCR识别]\n${ocrClean}`].filter(Boolean).join("\n\n");
}

async function runOcr(buffer, mimeType, label, report, userId) {
  const result = await recognizeImage(buffer, mimeType, label, userId);
  if (result.status === "ready") {
    report.imagesOcrd += 1;
    report.ocrCharacters += result.text.length;
    report.ocrStatus = "ready";
  } else if (result.status === "not_configured") {
    report.ocrStatus = "not_configured";
  } else if (result.status !== "empty") {
    report.ocrStatus = "partial";
  }
  appendWarning(report, result.warning);
  return result.text;
}

async function renderPdfPage(page) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toBuffer("image/jpeg", 82);
}

async function parsePdf(buffer, filename, userId) {
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true
  }).promise;
  const report = createReport("PDF");
  const vision = await getVisionConfig(userId);
  const pages = [];
  let ocrCandidates = 0;

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const nativeText = cleanText(content.items.map((item) => item.str).join(" "));
    report.nativeCharacters += nativeText.length;

    const operators = await page.getOperatorList();
    const imageOps = new Set([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintSolidColorImageMask
    ]);
    const imageCount = operators.fnArray.filter((operation) => imageOps.has(operation)).length;
    report.imagesFound += imageCount;

    let ocrText = "";
    const shouldOcr = imageCount > 0 || nativeText.length < 80;
    if (shouldOcr && ocrCandidates < MAX_OCR_IMAGES_PER_FILE) {
      ocrCandidates += 1;
      if (vision.apiKey) {
        try {
          const rendered = await renderPdfPage(page);
          ocrText = await runOcr(rendered, "image/jpeg", `${filename} 第 ${index} 页`, report, userId);
        } catch (error) {
          report.ocrStatus = "partial";
          appendWarning(report, `第 ${index} 页渲染失败，未能 OCR：${error.message}`);
        }
      } else {
        report.ocrStatus = "not_configured";
        appendWarning(report, "检测到图片或扫描页，但未配置 OCR 视觉模型");
      }
    }

    const text = mergeNativeAndOcr(nativeText, ocrText);
    if (text) pages.push({ page: index, text, nativeText, ocrText });
  }

  if (ocrCandidates > MAX_OCR_IMAGES_PER_FILE) {
    appendWarning(report, `OCR 最多处理前 ${MAX_OCR_IMAGES_PER_FILE} 个候选页面`);
    report.ocrStatus = "partial";
  }
  if (!pages.length) {
    pages.push({ page: 1, text: "", nativeText: "", ocrText: "" });
    appendWarning(report, "没有提取到可读文字");
  }
  return { filename, type: "PDF", pages, parseReport: report };
}

async function parseDocx(buffer, filename, userId) {
  const raw = await mammoth.extractRawText({ buffer });
  const nativeText = cleanText(raw.value);
  const report = createReport("DOCX");
  report.nativeCharacters = nativeText.length;
  const zip = await JSZip.loadAsync(buffer);
  const media = Object.values(zip.files)
    .filter((entry) => !entry.dir && /^word\/media\//i.test(entry.name))
    .slice(0, MAX_OCR_IMAGES_PER_FILE);
  report.imagesFound = media.length;
  const ocrSections = [];

  for (const [index, entry] of media.entries()) {
    const imageBuffer = await entry.async("nodebuffer");
    const ocrText = await runOcr(
      imageBuffer,
      imageMime(entry.name),
      `${filename} 内嵌图片 ${index + 1}`,
      report,
      userId
    );
    if (ocrText) ocrSections.push(`图片 ${index + 1}：${ocrText}`);
  }
  if (media.length && report.ocrStatus === "not_configured") {
    appendWarning(report, "检测到 DOCX 内嵌图片，但未配置 OCR 视觉模型");
  }
  const text = mergeNativeAndOcr(nativeText, ocrSections.join("\n\n"));
  return {
    filename,
    type: "DOCX",
    pages: [{ page: 1, text, nativeText, ocrText: ocrSections.join("\n\n") }],
    parseReport: report
  };
}

async function parseImage(file, filename, ext, userId) {
  const report = createReport(ext.slice(1).toUpperCase());
  report.imagesFound = 1;
  const ocrText = await runOcr(
    file.buffer,
    file.mimetype || imageMime(filename),
    filename,
    report,
    userId
  );
  if (!ocrText) appendWarning(report, "图片没有提取到可用于学习的文字");
  return {
    filename,
    type: ext.slice(1).toUpperCase(),
    pages: [{ page: 1, text: ocrText, nativeText: "", ocrText }],
    parseReport: report
  };
}

function decodeUploadName(filename) {
  const decoded = Buffer.from(filename, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? filename : decoded;
}

export async function parseFile(file, userId) {
  const filename = decodeUploadName(file.originalname);
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return parsePdf(file.buffer, filename, userId);
  if (ext === ".docx") return parseDocx(file.buffer, filename, userId);
  if (IMAGE_EXTENSIONS.has(ext)) return parseImage(file, filename, ext, userId);
  if ([".txt", ".md", ".markdown"].includes(ext)) {
    const text = cleanText(file.buffer.toString("utf8"));
    const report = createReport(ext.slice(1).toUpperCase());
    report.nativeCharacters = text.length;
    return {
      filename,
      type: ext.slice(1).toUpperCase(),
      pages: [{ page: 1, text, nativeText: text, ocrText: "" }],
      parseReport: report
    };
  }
  throw new Error(`暂不支持 ${ext || "该"} 文件格式`);
}
