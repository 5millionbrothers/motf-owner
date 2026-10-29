import { NextRequest } from "next/server";
import { forwardPayment } from "@/lib/payment-proxy";
export const maxDuration = 60;
export async function POST(request: NextRequest) { return forwardPayment(request, "refund-payment"); }
