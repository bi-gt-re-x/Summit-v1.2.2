/**
 * The AI chat down the right side of a space: ask it for a page and it builds
 * one, or ask it to change the page that's there.
 *
 * Folds away to a tab on the right edge, and remembers whether it was open.
 * The conversation is kept per space for the browser session, so moving
 * between spaces and back doesn't lose it. Each change the AI makes can be
 * undone from the message that made it.
 *
 * The server does the work and saves the page (POST /api/spaces/<n>/ai,
 * backend/tracking/space_ai.py); this hands it the page as the editor holds
 * it and the chat so far, then shows the saved page.
 */
import { useEffect, useRef, useState } from 'react';
import { PanelRightClose, Sparkles, SendHorizontal, Undo2 } from 'lucide-react';
import { ask, type ChatTurn, type SpaceKind } from '@/services/spaces';
import type { SpaceDoc } from './blocks';

const OPEN_KEY = 'summit:space-chat-open';

interface Message extends ChatTurn {
  /** The page before this reply changed it, while it can still be undone. */
  before?: SpaceDoc;
  failed?: boolean;
}

const IDEAS = [
  'A study plan for my next test',
  'A weekly checklist for my goals',
  'A page tracking my progress',
];

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function chatKey(kind: SpaceKind, id: number) {
  return `summit:space-chat:${kind}:${id}`;
}

function readChat(kind: SpaceKind, id: number): Message[] {
  try {
    const raw = window.sessionStorage.getItem(chatKey(kind, id));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Message[]) : [];
  } catch {
    return [];
  }
}

export interface SpaceChatProps {
  kind: SpaceKind;
  id: number;
  /** The page as the editor holds it now. */
  doc: SpaceDoc;
  disabled?: boolean;
  /** Show this page: the AI's result, or the old one on Undo (which saves it). */
  onDoc: (doc: SpaceDoc, save: boolean) => void;
  /** Told when the panel opens or folds, so the page can make room. */
  onOpenChange?: (open: boolean) => void;
}

export function SpaceChat({ kind, id, doc, disabled, onDoc, onOpenChange }: SpaceChatProps) {
  const [open, setOpen] = useState(readOpen);
  const [messages, setMessages] = useState<Message[]>(() => readChat(kind, id));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setMessages(readChat(kind, id));
  }, [kind, id]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(chatKey(kind, id), JSON.stringify(messages.slice(-30)));
    } catch {
      /* A chat that isn't kept is still a chat. */
    }
    const box = list.current;
    if (box && typeof box.scrollTo === 'function') box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [messages, kind, id]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* Remembering is a convenience. */
    }
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const history: ChatTurn[] = messages
      .filter((one) => !one.failed)
      .map(({ role, text: said }) => ({ role, text: said }));
    setMessages((was) => [...was, { role: 'user', text: prompt }]);
    setDraft('');
    setBusy(true);
    try {
      const result = await ask(id, prompt, doc, history, kind);
      if (result.success) {
        onDoc(result.space.doc ?? doc, false);
        setMessages((was) => [...was, { role: 'ai', text: result.reply, before: result.before }]);
      } else {
        setMessages((was) => [...was, { role: 'ai', text: result.message || "That didn't work. Try again.", failed: true }]);
      }
    } catch {
      setMessages((was) => [...was, { role: 'ai', text: "Couldn't reach the server.", failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  const undo = (at: number) => {
    const message = messages[at];
    if (!message?.before) return;
    onDoc(message.before, true);
    setMessages((was) => was.map((one, index) => (index === at ? { ...one, before: undefined, text: `${one.text} (Undone.)` } : one)));
  };

  if (!open) {
    return (
      <button type="button" className="sp-chat-tab" onClick={() => setOpen(true)} title="Open the AI chat">
        <Sparkles aria-hidden="true" />
        <span>Ask AI</span>
      </button>
    );
  }

  return (
    <aside className="sp-chat" aria-label="AI page builder">
      <header className="sp-chat-head">
        <Sparkles aria-hidden="true" className="sp-chat-mark" />
        <div>
          <strong>Build with AI</strong>
          <span>Ask for a page, or a change to this one.</span>
        </div>
        <button type="button" className="sp-chat-fold" onClick={() => setOpen(false)} title="Fold the chat away">
          <PanelRightClose aria-hidden="true" />
          <span className="sp-chat-sr">Fold the chat away</span>
        </button>
      </header>

      <ol className="sp-chat-list" ref={list}>
        {messages.length === 0 && (
          <li className="sp-chat-empty">
            <p>Try one of these, or say what you need.</p>
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="sp-chat-idea" disabled={disabled || busy} onClick={() => void send(idea)}>
                {idea}
              </button>
            ))}
          </li>
        )}
        {messages.map((message, at) => (
          <li key={at} className={`sp-chat-msg is-${message.role}${message.failed ? ' is-failed' : ''}`}>
            <p>{message.text}</p>
            {message.before && (
              <button type="button" className="sp-chat-undo" onClick={() => undo(at)}>
                <Undo2 aria-hidden="true" />
                Undo
              </button>
            )}
          </li>
        ))}
        {busy && (
          <li className="sp-chat-msg is-ai is-busy" role="status">
            <p>Looking it up and building…</p>
          </li>
        )}
      </ol>

      <form
        className="sp-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          value={draft}
          rows={3}
          maxLength={2000}
          placeholder="Make me a study plan for…"
          aria-label="Ask the AI"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
        />
        <button type="submit" className="sp-chat-send" disabled={disabled || busy || !draft.trim()} title="Send">
          <SendHorizontal aria-hidden="true" />
          <span className="sp-chat-sr">Send</span>
        </button>
      </form>
    </aside>
  );
}
