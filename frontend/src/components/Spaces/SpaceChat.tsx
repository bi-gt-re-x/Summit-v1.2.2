/**
 * The AI chat down the right side of a space: ask it for a page and it builds
 * one, ask it to change what's there, or ask it about the page.
 *
 * The chat is kept on the server, one per account and per space
 * (backend/api/spaces.py `_chat_key`), so it's there on another device, it
 * never shows on someone else's account, and Space 1's chat is not Space 2's.
 * Folds away to a tab on the right edge, and remembers whether it was open.
 *
 * Each change can be undone from the message that made it, and under each
 * reply is what the AI checked when it looked at the result: the contrast of
 * every text block, and anything it fixed (backend/tracking/space_look.py).
 */
import { useEffect, useRef, useState } from 'react';
import { Eye, PanelRightClose, RotateCcw, SendHorizontal, Sparkles, Undo2 } from 'lucide-react';
import { ask, chat, clearChat, undoTurn, type ChatTurn, type SpaceKind } from '@/services/spaces';
import { useAuth } from '@/hooks';
import type { SpaceDoc } from './blocks';

const OPEN_KEY = 'summit:space-chat-open';

const IDEAS = [
  'A study plan for my next test',
  'A dashboard of my progress this month',
  'Is this page easy to read?',
];

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export interface SpaceChatProps {
  kind: SpaceKind;
  id: number;
  /** The page as the editor holds it now. */
  doc: SpaceDoc;
  disabled?: boolean;
  /** Show this page. The server has already saved it. */
  onDoc: (doc: SpaceDoc) => void;
  /** Told when the panel opens or folds, so the page can make room. */
  onOpenChange?: (open: boolean) => void;
}

export function SpaceChat({ kind, id, doc, disabled, onDoc, onOpenChange }: SpaceChatProps) {
  const { username } = useAuth();
  const [open, setOpen] = useState(readOpen);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  /* This account's chat on this space, read again whenever either changes:
     a chat left over from the last space or the last account must never
     be what the next one sees, even for a frame. */
  useEffect(() => {
    let live = true;
    setTurns([]);
    setLoaded(false);
    setError(null);
    if (!username) return undefined;
    chat(id, kind)
      .then((result) => {
        if (!live) return;
        if (result.success) setTurns(result.chat);
        setLoaded(true);
      })
      .catch(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [id, kind, username]);

  useEffect(() => {
    const box = list.current;
    if (box && typeof box.scrollTo === 'function') box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [turns, pending, busy]);

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
    setPending(prompt);
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const result = await ask(id, prompt, doc, kind);
      if (result.success) {
        if (result.mode !== 'reply' && result.space.doc) onDoc(result.space.doc);
        setTurns(result.chat);
      } else {
        const kept = (result as { chat?: ChatTurn[] }).chat;
        if (kept) setTurns(kept);
        else setError(result.message || "That didn't work. Try again.");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const undo = async (at: number) => {
    const result = await undoTurn(id, at, kind).catch(() => null);
    if (result?.success) {
      if (result.space.doc) onDoc(result.space.doc);
      setTurns(result.chat);
    } else {
      setError(result && !result.success ? result.message : "Couldn't undo that.");
    }
  };

  const clear = async () => {
    const result = await clearChat(id, kind).catch(() => null);
    if (result?.success) setTurns([]);
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
          <span>Ask for a page, a change, or about this one.</span>
        </div>
        {turns.length > 0 && (
          <button type="button" className="sp-chat-fold" onClick={() => void clear()} title="Start this chat over">
            <RotateCcw aria-hidden="true" />
            <span className="sp-chat-sr">Start this chat over</span>
          </button>
        )}
        <button type="button" className="sp-chat-fold" onClick={() => setOpen(false)} title="Fold the chat away">
          <PanelRightClose aria-hidden="true" />
          <span className="sp-chat-sr">Fold the chat away</span>
        </button>
      </header>

      <ol className="sp-chat-list" ref={list}>
        {loaded && turns.length === 0 && !pending && (
          <li className="sp-chat-empty">
            <p>Try one of these, or say what you need.</p>
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="sp-chat-idea" disabled={disabled || busy} onClick={() => void send(idea)}>
                {idea}
              </button>
            ))}
          </li>
        )}
        {turns.map((turn, at) => (
          <li
            key={`${at}-${turn.at ?? ''}`}
            className={`sp-chat-msg is-${turn.role}${turn.failed ? ' is-failed' : ''}${turn.undone ? ' is-undone' : ''}`}
          >
            <p>{turn.text}</p>
            {turn.notes && turn.notes.length > 0 && (
              <div className="sp-chat-notes">
                <Eye aria-hidden="true" />
                <ul>
                  {turn.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            {turn.undo && (
              <button type="button" className="sp-chat-undo" onClick={() => void undo(at)}>
                <Undo2 aria-hidden="true" />
                Undo
              </button>
            )}
            {turn.undone && <span className="sp-chat-undone">Undone</span>}
          </li>
        ))}
        {pending && (
          <li className="sp-chat-msg is-user">
            <p>{pending}</p>
          </li>
        )}
        {busy && (
          <li className="sp-chat-msg is-ai is-busy" role="status">
            <p>Reading your page and building…</p>
          </li>
        )}
        {error && (
          <li className="sp-chat-msg is-ai is-failed" role="alert">
            <p>{error}</p>
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
