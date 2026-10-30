import { browser } from 'wxt/browser';
import {
  initialLearningState,
  learningStateSchema,
  type LearningState,
} from './model';
export const LEARNING_KEY = 'darb:learning';
export async function readLearning(): Promise<LearningState> {
  const stored = await browser.storage.local.get(LEARNING_KEY);
  return stored[LEARNING_KEY] === undefined
    ? initialLearningState()
    : learningStateSchema.parse(stored[LEARNING_KEY]);
}
export async function writeLearning(state: LearningState) {
  await browser.storage.local.set({
    [LEARNING_KEY]: learningStateSchema.parse(state),
  });
}
