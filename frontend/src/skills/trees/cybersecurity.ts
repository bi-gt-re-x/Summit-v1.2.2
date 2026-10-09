/**
 * Cybersecurity — a branch of Coding.
 *
 * Defensive throughout, and arranged that way on purpose: the offensive nodes
 * near the bottom are there because you cannot defend a system against an
 * attack you have never seen carried out, and they sit behind the nodes about
 * doing that lawfully and with permission.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const CYBERSECURITY: SubjectTree = {
  id: 'cybersecurity',
  title: 'Cybersecurity',
  blurb: 'What breaks, why it breaks, and the habits that stop it breaking here.',
  parent: 'coding',
  nodes: [
    { id: 'cy.model', name: 'Threat Modeling', icon: 'threat', tier: 'foundation', core: true, state: open, percent: 10, xp: 1500,
      desc: 'Asking who would attack this, what they want, and where the soft edge is — before writing defences. Security spending without a threat model reliably buys the wrong thing, thoroughly.' },
    { id: 'cy.cia', name: 'Confidentiality, Integrity, Availability', icon: 'triad', tier: 'foundation', requires: ['cy.model'], state: lock, percent: 0, xp: 1300,
      desc: 'The three things an attack takes away: secrecy, correctness, or access. Naming which one a given risk threatens is what stops every conversation about security collapsing into the word "hacking".' },
    { id: 'cy.authn', name: 'Authentication', icon: 'auth', tier: 'foundation', requires: ['cy.cia'], state: lock, percent: 0, xp: 1600,
      desc: 'Establishing who is asking. Passwords are the weak version and a second factor is most of the fix, because it turns a stolen secret from a full compromise into a nuisance.' },
    { id: 'cy.authz', name: 'Authorization', icon: 'permission', tier: 'beginner', core: true, requires: ['cy.authn'], state: lock, percent: 0, xp: 1700,
      desc: 'Deciding what an identified person is allowed to do, checked on every request rather than once at login. Least privilege is the rule: the account that only reads cannot be used to delete.' },
    { id: 'cy.crypto', name: 'Cryptography Basics', icon: 'encryption', tier: 'beginner', requires: ['cy.cia'], state: lock, percent: 0, xp: 1900,
      desc: 'What encryption, hashing and signing each promise, which is three different promises. The practical rule is to use the library everyone reviews, because homemade cryptography fails silently and looks fine.' },
    { id: 'cy.hash', name: 'Password Storage', icon: 'hash', tier: 'beginner', requires: ['cy.crypto', 'cy.authn'], state: lock, percent: 0, xp: 1700,
      desc: 'Storing something you can check a password against but never read back, using a slow salted hash built for the job. The threat is not a clever attacker, it is a leaked table and a rented graphics card.' },
    { id: 'cy.input', name: 'Untrusted Input', icon: 'sanitise', tier: 'beginner', core: true, requires: ['cy.authz'], state: lock, percent: 0, xp: 1800,
      desc: 'Treating everything from outside as hostile until it has been checked against what you expected. Nearly every famous vulnerability class is one program handing another program text it did not read carefully.' },
    { id: 'cy.injection', name: 'Injection', icon: 'injection', tier: 'intermediate', requires: ['cy.input'], state: lock, percent: 0, xp: 2000,
      desc: 'Data that gets read as instructions — a query, a shell command, a template. The fix is structural rather than a filter: keep the code and the data in separate arguments so no amount of quoting can move the boundary.' },
    { id: 'cy.xss', name: 'Cross-Site Scripting', icon: 'script-attack', tier: 'intermediate', requires: ['cy.input'], state: lock, percent: 0, xp: 1900,
      desc: 'A script from somewhere else, running on your page inside the session of whoever is reading it. Escaping on output rather than on input is the reliable direction, because the same string is safe in one context and dangerous in the next.' },
    { id: 'cy.session', name: 'Sessions & Tokens', icon: 'token', tier: 'intermediate', requires: ['cy.authz'], state: lock, percent: 0, xp: 1900,
      desc: 'Keeping somebody signed in without asking again, and being able to end that trust instantly. Where the token lives decides which attacks reach it, and how long it lives decides how bad a theft is.' },
    { id: 'cy.tls', name: 'Transport Security', icon: 'tls', tier: 'intermediate', requires: ['cy.crypto'], state: lock, percent: 0, xp: 1800,
      desc: 'Encrypting the wire so the network cannot read or alter what passes over it, and certificates as the answer to who you are talking to. A warning clicked through is the whole guarantee thrown away.' },
    { id: 'cy.net', name: 'Network Defences', icon: 'firewall', tier: 'intermediate', requires: ['cy.tls'], state: lock, percent: 0, xp: 1900,
      desc: 'Firewalls, segmentation and the principle that a machine should only be reachable from where it needs to be. Segmentation is what turns one compromised laptop into one compromised laptop instead of an estate.' },
    { id: 'cy.social', name: 'Social Engineering', icon: 'phishing', tier: 'intermediate', requires: ['cy.model'], state: lock, percent: 0, xp: 1700,
      desc: 'Attacks on people rather than software: a convincing email, an urgent phone call, a badge held for a stranger. It remains the most successful route in, and no amount of patching touches it.' },
    { id: 'cy.malware', name: 'Malware & Endpoints', icon: 'malware', tier: 'advanced', requires: ['cy.social', 'cy.net'], state: lock, percent: 0, xp: 2100,
      desc: 'How hostile code arrives on a machine, persists, and is spotted. Most of the defense is unglamorous: patch quickly, do not run as administrator, and log enough to reconstruct what happened.' },
    { id: 'cy.supply', name: 'Dependencies & Supply Chain', icon: 'supply-chain', tier: 'advanced', requires: ['cy.malware'], state: lock, percent: 0, xp: 2200,
      desc: 'Every package you install is code you are running with your privileges. Pinning versions, reviewing what updates, and knowing what you actually depend on is the whole of the practical defense.' },
    { id: 'cy.secrets', name: 'Secrets Management', icon: 'vault', tier: 'advanced', requires: ['cy.session', 'cy.supply'], state: lock, percent: 0, xp: 2100,
      desc: 'Keys and credentials kept out of source control, scoped narrowly, and rotatable without a deploy. A secret committed once is a secret forever, whatever the next commit removes.' },
    { id: 'cy.law', name: 'Authorization to Test', icon: 'contract', tier: 'advanced', core: true, requires: ['cy.secrets'], state: lock, percent: 0, xp: 2000,
      desc: 'Written permission, an agreed scope and a defined window — the difference between security work and a crime. Everything below this node assumes a system you have been asked in writing to attack.' },
    { id: 'cy.pentest', name: 'Penetration Testing', icon: 'pentest', tier: 'expert', requires: ['cy.law', 'cy.injection', 'cy.xss'], state: lock, percent: 0, xp: 2600,
      desc: 'Finding out what an attacker could actually reach, inside an agreed scope, and writing it up so it gets fixed. The report is the deliverable; the exploit is only evidence that the finding is real.' },
    { id: 'cy.ir', name: 'Incident Response', icon: 'incident', tier: 'expert', requires: ['cy.malware'], state: lock, percent: 0, xp: 2500,
      desc: 'What you do in the first hour: contain, preserve evidence, communicate, then recover. Rehearsed beforehand, because nobody invents a good process while the system is on fire.' },
    { id: 'cy.forensics', name: 'Digital Forensics', icon: 'forensics', tier: 'expert', requires: ['cy.ir'], state: lock, percent: 0, xp: 2500,
      desc: 'Reconstructing what happened from logs, disks and memory, without destroying the evidence while you look at it. The chain of custody matters as much as the finding if anybody will ever act on it formally.' },
    { id: 'cy.program', name: 'Security Programs', icon: 'shield', tier: 'mastery', requires: ['cy.pentest', 'cy.forensics'], state: lock, percent: 0, xp: 3000,
      desc: 'Turning all of it into something an organization does continuously: reviews, training, patch cycles and measured risk. Security as a permanent practice rather than an audit that happens once a year.' },
  ],
};
