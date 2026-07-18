#!/usr/bin/env node
/**
 * Entrypoint.
 *
 * stdout IS the JSON-RPC channel for a stdio MCP server. A single console.log anywhere
 * in this process — ours, a dependency's, a stray debug line someone adds at 3am —
 * injects garbage into the frame stream, and the client drops the connection with an
 * error that points nowhere near the cause. So before any of our code is even loaded,
 * console.log/info/debug are rerouted to stderr.
 *
 * ESM imports are hoisted and evaluated before top-level statements, so our modules are
 * pulled in with a dynamic import BELOW the guard rather than a static one above it.
 * That ordering is the entire reason this file is shaped the way it is — do not convert
 * the import at the bottom into a static one.
 */
/* ------------------------------------------------------------------ */
/* stdout hard-guard — must run before anything of ours is loaded      */
/* ------------------------------------------------------------------ */
/**
 * The pristine writer, captured before anything has a chance to wrap it. The transport
 * owns stdout; nothing else in this process is allowed near it.
 */
const _w = process.stdout.write.bind(process.stdout);
void _w;
console.log = console.info = console.debug = ((...a) => {
    process.stderr.write(a.join(' ') + '\n');
    return true;
});
/* ------------------------------------------------------------------ */
/* stay alive                                                          */
/* ------------------------------------------------------------------ */
/**
 * A silent death is the worst failure mode here: the tools simply vanish mid-demo and
 * the client reports a generic transport error. Log loudly to stderr and keep running —
 * the server is stateless per-request, so one bad call should never take down the rest
 * of the session. We only exit on a failure to establish the transport at all, because
 * at that point there is no session to preserve.
 */
process.on('uncaughtException', (err) => {
    console.error(`[kitbash] uncaught exception (continuing): ${err?.stack ?? String(err)}`);
});
process.on('unhandledRejection', (reason) => {
    console.error(`[kitbash] unhandled rejection (continuing): ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
});
/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
const { startServer } = await import('./server.js');
try {
    await startServer();
}
catch (err) {
    console.error(`[kitbash] fatal: could not start on stdio: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exit(1);
}
export {};
//# sourceMappingURL=index.js.map