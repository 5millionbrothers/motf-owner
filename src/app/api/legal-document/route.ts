import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";

const documents = { terms: "이용약관", privacy: "개인정보 처리방침" } as const;
const tags = new Set(["div", "section", "h2", "h3", "h4", "p", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "strong", "b", "em", "i", "a", "br", "span"]);

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "terms" && kind !== "privacy") return NextResponse.json({ ok: false, message: "문서를 선택해주세요." }, { status: 400 });
  try {
    const response = await fetch(`https://motf.co.kr/${kind}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 300 } });
    if (!response.ok || !["https://motf.co.kr", "https://www.motf.co.kr"].includes(new URL(response.url).origin)) throw new Error("Document unavailable");
    const $ = load(await response.text());
    const article = $(`#${kind} .legal-document`).first();
    if (!article.length || article.text().trim().length < 100) throw new Error("Missing document");
    article.find("script,style,iframe,object,embed,form,input,button,svg,img,link,meta").remove();
    article.find("*").each((_, element) => {
      const node = $(element);
      if (!("tagName" in element)) return;
      if (!tags.has(element.tagName)) { node.replaceWith(node.contents()); return; }
      for (const attribute of Object.keys(element.attribs)) {
        if (attribute === "href" && element.tagName === "a") {
          const url = new URL(element.attribs.href, response.url);
          if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) { node.attr("href", url.href); continue; }
        }
        if (["colspan", "rowspan"].includes(attribute) && /^[1-9][0-9]?$/.test(element.attribs[attribute])) continue;
        node.removeAttr(attribute);
      }
      if (element.tagName === "a") node.attr({ target: "_blank", rel: "noopener noreferrer" });
    });
    return NextResponse.json({ ok: true, title: documents[kind], html: article.html(), source: `https://motf.co.kr/${kind}` });
  } catch {
    return NextResponse.json({ ok: false, message: "문서를 불러오지 못했습니다. 다시 시도하거나 원문을 새 창에서 확인해주세요." }, { status: 502 });
  }
}
