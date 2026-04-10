import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_TOOLS, executeMcpTool } from "@/server/mcp-runtime";

export async function GET() {
  return NextResponse.json({
    name: "xyndicate-strategy-skill",
    status: "ok",
    endpoint: "/api/mcp",
    method: "POST",
    availableTools: AVAILABLE_TOOLS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const tool = body?.tool;
    const params = body?.params || {};
    const caller = body?.caller || req.headers.get("x-mcp-caller") || "anonymous";

    if (!tool) {
      return NextResponse.json({
        error: "missing_tool",
        message: "A tool name is required.",
        availableTools: AVAILABLE_TOOLS,
      }, { status: 400 });
    }

    const result = await executeMcpTool(tool, params);
    const responseTime = Date.now() - startedAt;

    return NextResponse.json({ tool, result, responseTime, caller });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "MCP request failed" }, { status: 500 });
  }
}
