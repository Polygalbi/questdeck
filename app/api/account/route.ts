import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json({
    displayName: user.displayName,
    email: user.email,
    fullName: user.fullName,
  });
}
