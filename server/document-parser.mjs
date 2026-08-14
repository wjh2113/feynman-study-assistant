import path from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getVisionConfig } from "./model-config.mjs";
import { recognizeImage } from "./ocr.mjs";
import { getUserPreferences } from "./user-preferences.mjs";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ENV_OCR_MAX_IMAGES = Math.max(
  1,
  Math.min(200, Number(process.env.OCR_MAX_IMAGES || 40))
);
const MIN_OCR_IMAGE_BYTES = Math.max(1024, Number(process.env.OCR_MIN_IMAGE_BYTES || 4096));
const OCR_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.OCR_CONCURRENCY || 3)));

async function resolveOcrPolicy(userId) {
  const prefs = await getUserPreferences(userId);
  return {
    enabled: prefs.ocrEnabled !== false,
    maxImages: Math.max(1, Math.min(200, Number(prefs.ocrMaxImages) || ENV_OCR_MAX_IMAGES))
  };
}

function isVisionReady(vision) {
  return vision.provider === "baidu"
    ? Boolean(vision.apiKey && vision.secretKey)
    : Boolean(vision.apiKey);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function cleanText(value) {
  // Keep line breaks so Markdown / 章节标题仍可被大纲识别
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const ocrPolicy = await resolveOcrPolicy(userId);
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
    if (shouldOcr) {
      ocrCandidates += 1;
      if (!ocrPolicy.enabled) {
        if (report.ocrStatus === "not_needed") report.ocrStatus = "disabled";
        appendWarning(report, "已在个人设置中关闭图片 OCR，仅保留可提取的正文文字");
      } else if (ocrCandidates <= ocrPolicy.maxImages) {
        if (isVisionReady(vision)) {
          try {
            const rendered = await renderPdfPage(page);
            ocrText = await runOcr(rendered, "image/jpeg", `${filename} 第 ${index} 页`, report, userId);
          } catch (error) {
            report.ocrStatus = "partial";
            appendWarning(report, `第 ${index} 页渲染失败，未能 OCR：${error.message}`);
          }
        } else {
          report.ocrStatus = "not_configured";
          appendWarning(
            report,
            vision.provider === "baidu"
              ? "检测到图片或扫描页，但未配置百度 OCR（需要 API Key 与 Secret Key）"
              : "检测到图片或扫描页，但未配置 OCR 视觉模型"
          );
        }
      }
    }

    const text = mergeNativeAndOcr(nativeText, ocrText);
    if (text) pages.push({ page: index, text, nativeText, ocrText });
  }

  if (ocrPolicy.enabled && ocrCandidates > ocrPolicy.maxImages) {
    appendWarning(
      report,
      `OCR 最多处理前 ${ocrPolicy.maxImages} 个候选页面（可在个人设置中调整识别张数）`
    );
    report.ocrStatus = report.ocrStatus === "ready" ? "partial" : report.ocrStatus;
    if (report.ocrStatus === "not_needed") report.ocrStatus = "partial";
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
  const ocrPolicy = await resolveOcrPolicy(userId);
  const zip = await JSZip.loadAsync(buffer);
  const allMedia = Object.values(zip.files).filter(
    (entry) => !entry.dir && /^word\/media\//i.test(entry.name)
  );
  report.imagesFound = allMedia.length;

  if (!ocrPolicy.enabled) {
    if (allMedia.length > 0) {
      report.imagesSkipped = allMedia.length;
      report.ocrStatus = "disabled";
      appendWarning(report, "已在个人设置中关闭图片 OCR，仅保留可提取的正文文字");
    }
    return {
      filename,
      type: "DOCX",
      pages: [{ page: 1, text: nativeText, nativeText, ocrText: "" }],
      parseReport: report
    };
  }

  const eligible = [];
  let tinySkipped = 0;
  for (const entry of allMedia) {
    const imageBuffer = await entry.async("nodebuffer");
    if (imageBuffer.length < MIN_OCR_IMAGE_BYTES) {
      tinySkipped += 1;
      continue;
    }
    eligible.push({ entry, imageBuffer });
  }
  report.imagesTinySkipped = tinySkipped;
  report.imagesEligible = eligible.length;

  const selected = eligible.slice(0, ocrPolicy.maxImages);
  const cappedSkipped = Math.max(0, eligible.length - selected.length);
  report.imagesSkipped = tinySkipped + cappedSkipped;

  if (cappedSkipped > 0) {
    appendWarning(
      report,
      `文档含 ${allMedia.length} 张图片（其中 ${tinySkipped} 张过小已跳过），本次仅 OCR 前 ${selected.length} 张较大图片，另有 ${cappedSkipped} 张因上限未处理。可在个人设置中调整「识别张数」后重新解析。`
    );
    report.ocrStatus = "partial";
  } else if (tinySkipped > 0 && eligible.length === 0 && allMedia.length > 0) {
    appendWarning(report, `文档含 ${allMedia.length} 张图片，但均为过小图，已跳过 OCR`);
  }

  const ocrSections = await mapWithConcurrency(selected, OCR_CONCURRENCY, async (item, index) => {
    const ocrText = await runOcr(
      item.imageBuffer,
      imageMime(item.entry.name),
      `${filename} 内嵌图片 ${index + 1}`,
      report,
      userId
    );
    return ocrText ? `图片 ${index + 1}：${ocrText}` : "";
  });
  if (selected.length && report.ocrStatus === "not_configured") {
    appendWarning(report, "检测到 DOCX 内嵌图片，但未配置 OCR 视觉模型");
  }
  const joinedOcr = ocrSections.filter(Boolean).join("\n\n");
  const text = mergeNativeAndOcr(nativeText, joinedOcr);
  return {
    filename,
    type: "DOCX",
    pages: [{ page: 1, text, nativeText, ocrText: joinedOcr }],
    parseReport: report
  };
}

async function parseImage(file, filename, ext, userId) {
  const report = createReport(ext.slice(1).toUpperCase());
  report.imagesFound = 1;
  const ocrPolicy = await resolveOcrPolicy(userId);
  if (!ocrPolicy.enabled) {
    report.imagesSkipped = 1;
    report.ocrStatus = "disabled";
    appendWarning(report, "已在个人设置中关闭图片 OCR");
    return {
      filename,
      type: ext.slice(1).toUpperCase(),
      pages: [{ page: 1, text: "", nativeText: "", ocrText: "" }],
      parseReport: report
    };
  }
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
