import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem", fontFamily: "sans-serif" }}
    >
      <h1>mine-agent-sdk</h1>
      <p>
        A production-oriented TypeScript AI agent SDK with composable providers, tools, memory,
        guardrails, tracing, handoffs, and plugins.
      </p>
      <pre
        style={{
          background: "#111",
          color: "#eee",
          padding: "1rem",
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        <code>npm install mine-agent-sdk zod eventemitter3</code>
      </pre>
      <p>
        <Link href="/quickstart">Read the quickstart &rarr;</Link>
      </p>
      <p>
        This docs site is a placeholder — full narrative documentation is still on{" "}
        <a href="https://github.com/sampleritzgod/mine-agent-sdk">GitHub</a> under{" "}
        <code>packages/core/docs</code> and <code>packages/core/README.md</code> for now.
      </p>
    </main>
  );
}
