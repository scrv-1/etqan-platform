import { lookup as resolve } from "node:dns/promises";
import type { lookup, LookupAddress } from "node:dns";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const MAX_BYTES = 2 * 1024 * 1024;

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch { return false; }
}

export async function resolvePublicUrl(raw: string): Promise<{url: URL; address: LookupAddress}> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("أدخل رابط HTTPS صحيحًا."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("تُدعم روابط HTTPS العامة فقط، دون بيانات دخول أو منافذ خاصة.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname.includes(".") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "localhost") {
    throw new Error("لا يسمح بالوصول إلى عناوين محلية أو داخلية.");
  }
  const addresses = await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) {
    throw new Error("لا يسمح بالوصول إلى عناوين محلية أو خاصة.");
  }
  url.hash = "";
  return { url, address: addresses[0]! };
}

async function readPublicPage(raw: string, signal: AbortSignal, hops = 0): Promise<{url:string; html:string}> {
  if (hops > 3) throw new Error("تجاوز الرابط حد إعادة التوجيه.");
  signal.throwIfAborted();
  const { url, address } = await resolvePublicUrl(raw);
  signal.throwIfAborted();
  // Pin the vetted address for the TLS connection. No second DNS lookup/rebinding.
  const pinnedLookup = ((_host: string, options: {all?:boolean}, callback: (...args: unknown[]) => void) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  }) as typeof lookup;
  const result = await new Promise<{location?:string;html?:string}>((accept, reject) => {
    const req = request(url, {
      signal, lookup: pinnedLookup,
      headers: { Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": "Itqan-ArticleReader/1.0" },
    }, res => {
      const status = res.statusCode ?? 500;
      if (status >= 300 && status < 400 && res.headers.location) {
        const location = new URL(res.headers.location, url).href;
        res.destroy();
        accept({ location }); return;
      }
      if (status !== 200) { res.destroy(); reject(new Error("الصفحة غير متاحة للعامة أو محمية؛ الصق النص الذي يحق لك استخدامه بدلًا من ذلك.")); return; }
      if (!String(res.headers["content-type"]).toLowerCase().includes("text/html")) {
        res.destroy(); reject(new Error("الرابط لا يشير إلى مقال HTML. أضف الملفات مباشرة من جهازك.")); return;
      }
      if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
        res.destroy(); reject(new Error("ترميز الصفحة غير مدعوم. الصق النص يدويًا.")); return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { res.destroy(new Error("الصفحة أكبر من حد 2MB.")); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => accept({html:Buffer.concat(chunks).toString("utf8")}));
    });
    req.on("error", reject);
    req.end();
  });
  if (result.location) return readPublicPage(result.location, signal, hops + 1);
  return { url:url.href, html:result.html! };
}

export async function extractPublicArticle(raw: string, signal: AbortSignal) {
  const page = await readPublicPage(raw, signal);
  // Scripts/resources are never enabled. Readability extracts plain text only.
  const dom = new JSDOM(page.html, { url:page.url });
  try {
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.replace(/\r/g, "").trim();
    if (!text || text.length < 120) throw new Error("لم يُعثر على مقال قابل للاستخراج. قد تحتاج الصفحة إلى تسجيل دخول أو JavaScript؛ الصق النص يدويًا.");
    if (text.length > 200000) throw new Error("نص المقال طويل جدًا؛ أضف قسمًا محددًا كنص.");
    const segments: { id:string; text:string }[] = [];
    const paragraphs = text.split(/\n\s*\n|\n/).map(t => t.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      for (let offset = 0; offset < paragraph.length; offset += 4000) {
        segments.push({id:`paragraph-${segments.length + 1}`,text:paragraph.slice(offset,offset+4000)});
      }
    }
    return {title:article?.title?.slice(0,200) || "مقال ويب",url:page.url,segments,warnings:["استخراج نصي فقط؛ الرسوم والجداول والتنسيق قد لا تنتقل. الإحالات إلى مقاطع النسخة المحفوظة، وقد تتغير الصفحة الأصلية."]};
  } finally { dom.window.close(); }
}