/**
 * Who is in a team space, and the box to invite somebody.
 *
 * **A placeholder.** An address added here is kept on the account and listed
 * as pending, and nothing is sent: Summit has no shared accounts yet for an
 * invite to bring anybody into. The panel says so in as many words, so nobody
 * waits on an e-mail that is not coming. The shape is the one a working
 * version will have — the owner, the pending list, the box and a link — which
 * is why it is built rather than left as a sentence.
 *
 * `?invite=1` on the page's URL (the rail's "Invite people" row) puts the
 * caret straight in the box.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks';
import { invite, uninvite, type Invite } from '@/services/spaces';

export interface MembersProps {
  spaceId: number;
  invites: Invite[];
}

function initials(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';
}

export function Members({ spaceId, invites: initial }: MembersProps) {
  const { username } = useAuth();
  const [invites, setInvites] = useState<Invite[]>(initial);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => setInvites(initial), [initial]);

  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('invite') !== '1') return;
    field.current?.focus();
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('invite');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError('');
    const result = await invite(spaceId, address).catch(() => null);
    setBusy(false);
    if (!result) {
      setError('Could not reach the server. Try again.');
      return;
    }
    if (!result.success) {
      setError(result.message ?? 'Could not add that invite.');
      return;
    }
    setInvites(result.space.invites ?? []);
    setEmail('');
  };

  const remove = async (address: string) => {
    const result = await uninvite(spaceId, address).catch(() => null);
    if (result?.success) setInvites(result.space.invites ?? []);
  };

  return (
    <section className="sp-members" aria-labelledby={`sp-members-${spaceId}`}>
      <div className="sp-members-head">
        <h2 id={`sp-members-${spaceId}`}>Members</h2>
        <span className="sp-preview">Preview</span>
      </div>
      <p className="sp-members-note">
        Invites are a preview for now: addresses are saved here as pending, and no
        e-mail is sent yet.
      </p>

      <ul className="sp-member-list">
        <li className="sp-member">
          <span className="sp-member-avatar" aria-hidden="true">{initials(username ?? '')}</span>
          <span className="sp-member-name">{username ?? 'You'}</span>
          <span className="sp-chip is-owner">Owner</span>
        </li>
        {invites.map((item) => (
          <li className="sp-member" key={item.email}>
            <span className="sp-member-avatar is-pending" aria-hidden="true">
              {initials(item.email)}
            </span>
            <span className="sp-member-name">{item.email}</span>
            <span className="sp-chip">Pending</span>
            <button
              type="button"
              className="sp-member-remove"
              aria-label={`Remove the invite for ${item.email}`}
              title="Remove invite"
              onClick={() => void remove(item.email)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form className="sp-invite" onSubmit={(event) => void send(event)}>
        <input
          ref={field}
          type="email"
          className="sp-invite-field"
          aria-label="E-mail to invite"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError('');
          }}
        />
        <button type="submit" className="sp-btn is-primary" disabled={busy || !email.trim()}>
          {busy ? 'Adding…' : 'Invite'}
        </button>
        <button
          type="button"
          className="sp-btn"
          disabled
          title="Invite links are coming with shared accounts"
        >
          Copy invite link
        </button>
      </form>
      {error && (
        <p className="sp-invite-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
