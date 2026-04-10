export async function appendMcpUsageEntry(entry: { tool: string; calledAt: number; caller: string; responseTime: number }) {
  try {
    const mod = await import("../../scripts/mcp-usage.js");
    return await mod.appendAndPublishUsageEntry(entry);
  } catch (error) {
    console.error(`Failed to append MCP usage entry: ${String((error as Error)?.message || error)}`);
    return null;
  }
}
