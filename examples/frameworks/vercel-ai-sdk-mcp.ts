// Webcite tools in a Vercel AI SDK call, through the hosted MCP server.
// Install: npm install ai @ai-sdk/mcp
// Run:     WEBCITE_API_KEY=... npx tsx vercel-ai-sdk-mcp.ts            (lists the tools, no model call)
//          WEBCITE_API_KEY=... AI_GATEWAY_API_KEY=... npx tsx vercel-ai-sdk-mcp.ts "claim to check"
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText, isStepCount } from 'ai';

const webcite = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://api.webcite.co/mcp?profile=core',
    headers: { Authorization: `Bearer ${process.env.WEBCITE_API_KEY}` },
  },
});

try {
  const tools = await webcite.tools();
  const claim = process.argv[2];
  if (!claim) {
    console.log(Object.keys(tools).length, 'tools:', Object.keys(tools).join(', '));
  } else {
    const { text } = await generateText({
      model: 'anthropic/claude-haiku-5.5',
      system: 'Check the claim with verify_claim. Report the verdict and cite the sources.',
      prompt: claim,
      tools,
      stopWhen: isStepCount(5),
    });
    console.log(text);
  }
} finally {
  await webcite.close();
}
