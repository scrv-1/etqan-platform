import type { PdfDoc } from './pdf';
import type { Segment } from '../types';
import { normalizeText } from '../util';

export type PdfMcqCandidate = {
  importKey: string;
  questionNumber: string;
  page: number;
  prompt: string;
  choices: string[];
  segmentId?: string;
};

export type PdfMcqLine = {
  page: number;
  y: number;
  x: number;
  textX: number;
  text: string;
  paragraphStart: boolean;
};

export type PdfMcqExtraction = {
  questions: PdfMcqCandidate[];
  suggestedTopic?: string;
  pagesWithoutText: number[];
};

type TextPart = { x: number; width: number; text: string; hasEOL: boolean };
type PositionedTextPart = TextPart & { y: number };

function questionHeader(text: string) {
  const normalized = text.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).trim();
  const match = /^(\d{1,3})[.)](?:\s+|$)(.*)$/u.exec(normalized);
  if (!match) return null;
  return { number: match[1], rest: match[2].trim() };
}

function joinParts(parts: TextPart[]) {
  let text = '';
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const part of [...parts].sort((a, b) => a.x - b.x)) {
    const value = part.text.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const gap = part.x - previousEnd;
    if (text && gap > 1.5 && !text.endsWith(' ')) text += ' ';
    text += value;
    previousEnd = part.x + part.width;
  }
  return text.trim();
}

function makeLines(page: number, parts: PositionedTextPart[]): PdfMcqLine[] {
  const sorted = [...parts].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; parts: TextPart[] }[] = [];
  for (const part of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.y - part.y) <= 1.5) last.parts.push(part);
    else groups.push({ y: part.y, parts: [part] });
  }

  return groups.map(group => {
    const visible = group.parts.filter(part => part.text.trim());
    const text = joinParts(visible);
    const header = questionHeader(text);
    const numberPart = header && visible.find(part => new RegExp(`^${header.number}[.)]$`, 'u').test(part.text.trim()));
    const promptPart = numberPart
      ? visible.find(part => part !== numberPart && !/^\/\s*\d+(?:\.\d+)?$/u.test(part.text.trim()))
      : undefined;
    const textX = promptPart?.x ?? (numberPart ? numberPart.x + 10 : visible[0]?.x ?? 0);
    return {
      page,
      y: group.y,
      x: visible[0]?.x ?? 0,
      textX,
      text,
      paragraphStart: group.parts.some(part => !part.text.trim() && part.hasEOL),
    };
  }).filter(line => line.text);
}

function stripChoicePrefix(value: string) {
  const match = /^\s*(?:\(?([A-H])\)|([A-H])[.)]|([A-H])[:：]|(\d{1,2})[.)]|[•*–—-])(?:\s+|$)(.*)$/iu.exec(value);
  if (!match) return { text: value.trim(), labeled: false };
  return { text: (match[5] ?? '').trim(), labeled: true };
}

function parseChoices(lines: PdfMcqLine[], promptX: number) {
  const choices: string[] = [];
  for (const line of lines) {
    const raw = line.text.trim();
    if (!raw) continue;
    const stripped = stripChoicePrefix(raw);
    const indented = line.x >= promptX + 6;
    const startsEnglishOption = indented && /^[A-Z][\p{L}'’]/u.test(stripped.text);
    const startsNewChoice = stripped.labeled ||
      (!choices.length) ||
      (indented && line.paragraphStart) ||
      startsEnglishOption;
    if (startsNewChoice) choices.push(stripped.text);
    else choices[choices.length - 1] = `${choices[choices.length - 1]} ${stripped.text}`.trim();
  }
  return choices.filter(Boolean);
}

function matchSegment(prompt: string, page: number, segments: Segment[]) {
  const pageSegments = segments.filter(segment => segment.page === page);
  const normalizedPrompt = normalizeText(prompt);
  const prefix = normalizedPrompt.slice(0, Math.min(36, normalizedPrompt.length));
  return pageSegments.find(segment => prefix && normalizeText(segment.text).includes(prefix))?.id;
}

function plainTextLines(page: number, text: string): PdfMcqLine[] {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  let y = rawLines.length;
  return rawLines.map(line => {
    const leading = line.match(/^\s*/)?.[0].length ?? 0;
    return {
      page,
      y: y--,
      x: leading * 2,
      textX: leading * 2 + 10,
      text: line.trim(),
      paragraphStart: leading > 0 || !line.trim(),
    };
  }).filter(line => line.text);
}

function suggestedTopic(lines: PdfMcqLine[]) {
  for (const line of lines) {
    const text = line.text.trim();
    if (!text || questionHeader(text) || /^(answer\s+key|answers?|quiz|test|مفتاح\s+الإجابات|الإجابات)$/iu.test(text)) continue;
    if (text.length <= 90 && /[\p{L}]/u.test(text)) return text;
  }
  return undefined;
}

export function parsePdfMcqLines(lines: PdfMcqLine[], segments: Segment[] = []) {
  const byPage = new Map<number, PdfMcqLine[]>();
  for (const line of lines) byPage.set(line.page, [...(byPage.get(line.page) ?? []), line]);

  const questions: PdfMcqCandidate[] = [];
  const orderedPages = [...byPage.keys()].sort((a, b) => a - b);
  for (const page of orderedPages) {
    const pageLines = [...byPage.get(page)!].sort((a, b) => b.y - a.y);
    const allHeaders = pageLines.map((line, index) => ({ line, index, header: questionHeader(line.text) })).filter(
      (item): item is { line: PdfMcqLine; index: number; header: NonNullable<ReturnType<typeof questionHeader>> } => !!item.header,
    );
    if (!allHeaders.length) continue;
    const firstQuestionX = Math.min(...allHeaders.map(item => item.line.x));
    const headers = allHeaders.filter(item => item.line.x <= firstQuestionX + 6);

    headers.forEach((item, questionIndex) => {
      const nextIndex = headers[questionIndex + 1]?.index ?? pageLines.length;
      const block = pageLines.slice(item.index, nextIndex);
      const promptX = item.line.textX;
      const promptLines: string[] = [];
      const optionLines: PdfMcqLine[] = [];
      let promptEnded = false;

      for (let i = 0; i < block.length; i++) {
        const line = block[i];
        let text = line.text.trim();
        if (i === 0) text = item.header.rest;
        if (!text) continue;

        if (!promptEnded) {
          const explicitChoice = stripChoicePrefix(text).labeled;
          const indentedParagraph = line.paragraphStart && line.x >= promptX + 6;
          if (promptLines.length && (explicitChoice || indentedParagraph)) {
            promptEnded = true;
            optionLines.push(line);
            continue;
          }
          promptLines.push(text);
          if (/[?؟]\s*$/u.test(text)) promptEnded = true;
          continue;
        }
        optionLines.push(line);
      }

      const prompt = promptLines.join(' ').replace(/\s+/g, ' ').trim();
      if (!prompt) return;
      const choices = parseChoices(optionLines, promptX);
      questions.push({
        importKey: `pdf-mcq:v1:${page}:${item.header.number}`,
        questionNumber: item.header.number,
        page,
        prompt,
        choices,
        segmentId: matchSegment(prompt, page, segments),
      });
    });
  }

  return {
    questions,
    suggestedTopic: suggestedTopic([...lines].sort((a, b) => a.page - b.page || b.y - a.y)),
  };
}

export async function extractPdfMcqs(
  doc: PdfDoc,
  pages: number[],
  segments: Segment[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PdfMcqExtraction> {
  const lines: PdfMcqLine[] = [];
  const pagesWithoutText: number[] = [];
  const orderedPages = [...new Set(pages)].sort((a, b) => a - b);
  for (let index = 0; index < orderedPages.length; index++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const pageNumber = orderedPages[index];
    const page = await doc.getPage(pageNumber);
    try {
      const width = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      const parts: (TextPart & { y: number })[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const textItem = item as unknown as { str: string; transform: number[]; width?: number; hasEOL?: boolean };
        const x = textItem.transform[4] ?? 0;
        const y = textItem.transform[5] ?? 0;
        const text = textItem.str ?? '';
        // Right-aligned point marks such as "/1" are scoring metadata, not question text.
        if (/^\/\s*\d+(?:\.\d+)?$/u.test(text.trim()) && x >= width * 0.6) continue;
        parts.push({ x, y, width: textItem.width ?? 0, text, hasEOL: !!textItem.hasEOL });
      }
      const pageLines = makeLines(pageNumber, parts);
      if (!pageLines.length) {
        pagesWithoutText.push(pageNumber);
        const reviewedText = segments.filter(segment => segment.page === pageNumber && segment.origin === 'ocr-reviewed');
        for (const segment of reviewedText) lines.push(...plainTextLines(pageNumber, segment.text));
      } else {
        lines.push(...pageLines);
      }
    } finally {
      page.cleanup();
    }
    onProgress?.(index + 1, orderedPages.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const parsed = parsePdfMcqLines(lines, segments);
  return { ...parsed, pagesWithoutText };
}
