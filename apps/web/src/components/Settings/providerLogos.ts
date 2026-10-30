import deepseek from "../../assets/providers/deepseek.webp";
import moark from "../../assets/providers/moark.webp";
import moonshot from "../../assets/providers/moonshot.webp";
import openai from "../../assets/providers/openai.webp";
import openrouter from "../../assets/providers/openrouter.webp";
import qwen from "../../assets/providers/qwen.webp";
import siliconflow from "../../assets/providers/siliconflow.webp";

import type { AiProviderId } from "../../services/ai/aiConfig";

export const PROVIDER_LOGOS: Partial<Record<AiProviderId, string>> = {
  deepseek,
  moonshot,
  qwen,
  siliconflow,
  moark,
  openai,
  openrouter,
};
