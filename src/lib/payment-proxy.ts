import { NextRequest, NextResponse } from "next/server";

// The user backend owns both current NICEPAY and historical Toss credentials.
export async function forwardPayment(request: NextRequest, endpoint: "refund-payment" | "reconcile-payment") {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const origin = new URL(process.env.MOTF_PAYMENT_API_ORIGIN || "https://motf.co.kr");
    if (origin.protocol !== "https:" || !["motf.co.kr", "www.motf.co.kr"].includes(origin.hostname) || origin.port || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("MOTF_PAYMENT_API_ORIGIN 설정을 확인해주세요.");
    }
    const body = await request.json();
    if (endpoint === "refund-payment" && !body.action) body.action = "reject";
    if (endpoint === "refund-payment" && !["reject", "cancel"].includes(body?.action || "reject")) return NextResponse.json({ ok: false, message: "처리 종류를 확인해주세요." }, { status: 400 });
    const response = await fetch(`${origin.origin}/api/${endpoint}`, {
      method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(50000),
    });
    const result = await response.json();
    return NextResponse.json(result, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "결제 서버에서 결과를 확인하지 못했습니다. 중복 취소하지 말고 운영팀에서 결제 상태를 확인해주세요." }, { status: 502 });
  }
}
