import type { TimelineItem, MessageItem } from './timelineTypes';
import type { AllocateId } from './types';
import { botReplies } from './constants';

interface TimelineAccess {
  getTimelineItems(): TimelineItem[];
  setTimelineItems(items: TimelineItem[]): void;
  getLogElement(): HTMLDivElement | null;
}

interface MessageDeps extends TimelineAccess {
  allocateId: AllocateId;
  tick: () => Promise<void>;
}

export function createMessageActions({ allocateId, getTimelineItems, setTimelineItems, getLogElement, tick }: MessageDeps) {
  async function appendMessage(sender: 'user' | 'bot', content: string): Promise<MessageItem> {
    const entry: MessageItem = {
      id: allocateId(),
      kind: 'message',
      sender,
      content,
      timestamp: Date.now(),
    };

    setTimelineItems([...getTimelineItems(), entry]);
    await tick();

    const logElement = getLogElement();
    if (logElement) {
      logElement.scrollTo({ top: logElement.scrollHeight, behavior: 'smooth' });
    }

    return entry;
  }

  async function enqueueUserMessage(text: string, shouldRespond = true) {
    const content = text.trim();
    if (!content) return;
    await appendMessage('user', content);
    if (shouldRespond) {
      scheduleBotReply();
    }
  }

  async function enqueueBotMessage(text: string) {
    await appendMessage('bot', text);
  }

  function scheduleBotReply() {
    const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
    setTimeout(() => {
      void enqueueBotMessage(reply);
    }, 500 + Math.random() * 700);
  }

  return {
    appendMessage,
    enqueueUserMessage,
    enqueueBotMessage,
    scheduleBotReply,
  };
}
