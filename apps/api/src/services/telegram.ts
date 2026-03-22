import type { TelegramUpdate } from "@codex/shared";

import type { AppConfig } from "../config.js";
import { hashPayload } from "../lib/hash.js";
import { handleDayTemplateCommand } from "./day-templates.js";
import { handleMealLoggingMessage } from "./nutrition.js";
import { handleNutritionTargetCommand } from "./nutrition-targets.js";
import {
  recordProcessedUpdate,
  storeConversationMessage,
  updateSourceFreshness
} from "./persistence.js";
import { handleAccessGrantCommand } from "./access-grants.js";
import { handlePromptReply } from "./coaching.js";

type TelegramDependencies = {
  handleAccessGrantCommand: typeof handleAccessGrantCommand;
  handleDayTemplateCommand: typeof handleDayTemplateCommand;
  handleMealLoggingMessage: typeof handleMealLoggingMessage;
  handleNutritionTargetCommand: typeof handleNutritionTargetCommand;
  handlePromptReply: typeof handlePromptReply;
  recordProcessedUpdate: typeof recordProcessedUpdate;
  storeConversationMessage: typeof storeConversationMessage;
  updateSourceFreshness: typeof updateSourceFreshness;
};

const defaultDependencies: TelegramDependencies = {
  handleAccessGrantCommand,
  handleDayTemplateCommand,
  handleMealLoggingMessage,
  handleNutritionTargetCommand,
  handlePromptReply,
  recordProcessedUpdate,
  storeConversationMessage,
  updateSourceFreshness
};

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  config: AppConfig,
  dependencies: TelegramDependencies = defaultDependencies
) {
  const payloadHash = hashPayload(update);
  const result = await dependencies.recordProcessedUpdate({
    provider: "telegram",
    externalUpdateId: String(update.update_id),
    payloadHash
  });

  if (!result.created) {
    return {
      duplicate: true
    };
  }

  if (update.message?.text) {
    await dependencies.storeConversationMessage({
      actor: "user",
      content: update.message.text,
      metadata: {
        updateId: update.update_id,
        messageId: update.message.message_id
      }
    });

    const promptResult = await dependencies.handlePromptReply(
      config,
      {
        text: update.message.text,
        promptDate: new Date(update.message.date * 1000).toISOString().slice(0, 10),
        updateId: update.update_id,
        messageId: update.message.message_id
      }
    );

    if (!promptResult.handled) {
      const accessGrantResult = await dependencies.handleAccessGrantCommand(config, {
        text: update.message.text
      });

      if (!accessGrantResult.handled) {
        const dayTemplateResult = await dependencies.handleDayTemplateCommand(config, {
          text: update.message.text
        });
        if (!dayTemplateResult.handled) {
          const nutritionTargetResult = await dependencies.handleNutritionTargetCommand(config, {
            text: update.message.text
          });
          if (!nutritionTargetResult.handled) {
            await dependencies.handleMealLoggingMessage(config, {
              text: update.message.text,
              messageDate: new Date(update.message.date * 1000)
            });
          }
        }
      }
    }
  }

  await dependencies.updateSourceFreshness({
    source: "telegram",
    success: true,
    metadata: {
      updateId: update.update_id
    }
  });

  return {
    duplicate: false
  };
}
