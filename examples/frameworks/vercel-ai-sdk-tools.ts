// Webcite tools in a Vercel AI SDK call, from the webcite-ai-sdk package.
// Install: npm install webcite-ai-sdk ai zod
// Run:     WEBCITE_API_KEY=... AI_GATEWAY_API_KEY=... npx tsx vercel-ai-sdk-tools.ts
import { generateText, isStepCount } from 'ai';
import { webciteTools } from 'webcite-ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-haiku-5.5',
  system: 'Check each factual claim with verifyClaim and cite the URLs it returns.',
  prompt: 'Can you see the Great Wall of China from the Moon?',
  tools: webciteTools(),
  stopWhen: isStepCount(5),
});
console.log(text);
