import OpenAI from "openai";

import type { AppConfig } from "../config.js";

export function createOpenAIClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY
  });
}

