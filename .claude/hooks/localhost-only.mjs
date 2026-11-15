// PreToolUse hook: blocks the built-in browser from opening anything but localhost.
// Reads the tool call from stdin; prints a deny decision for any URL off this machine.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLocal(raw) {
    if (raw === "back" || raw === "forward") return true;
    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
        if (url.protocol === "about:") return true;
        const host = url.hostname.toLowerCase();
        return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
    } catch {
        return false;
    }
}

function urlsIn(toolName, input) {
    if (!input || typeof input !== "object") return [];
    if (toolName.endsWith("__browser_batch")) {
        return (input.actions ?? []).flatMap((a) => (typeof a?.input?.url === "string" ? [a.input.url] : []));
    }
    return typeof input.url === "string" ? [input.url] : [];
}

let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
    const { tool_name = "", tool_input } = JSON.parse(data || "{}");
    const blocked = urlsIn(tool_name, tool_input).filter((u) => !isLocal(u));
    if (blocked.length === 0) return;
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: `Browser is limited to localhost in this project; blocked: ${blocked.join(", ")}`,
            },
        }),
    );
});
