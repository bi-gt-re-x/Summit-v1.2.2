/**
 * Networking — a branch of Systems.
 *
 * Layered on purpose, bottom upwards: a reader who meets HTTP before packets
 * learns a vocabulary rather than a mechanism, and then has nowhere to stand
 * when a request works from one machine and not from the one beside it.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const NETWORKING: SubjectTree = {
  id: 'networking',
  title: 'Networking',
  blurb: 'How one machine reaches another, layer by layer, and where it goes wrong.',
  parent: 'systems',
  nodes: [
    { id: 'net.layers', name: 'The Layers', icon: 'layers', tier: 'foundation', core: true, state: open, percent: 10, xp: 1400,
      desc: 'The stack of agreements that turns a click into electricity and back: link, network, transport, application. Each layer only talks to the one under it, which is what lets the whole internet change one layer at a time.' },
    { id: 'net.packet', name: 'Packets', icon: 'packet', tier: 'foundation', requires: ['net.layers'], state: lock, percent: 0, xp: 1300,
      desc: 'Data cut into small pieces, each carrying its own address and finding its own way. Nothing on the internet travels as one long stream, which is why arriving out of order is normal rather than a fault.' },
    { id: 'net.ip', name: 'Addressing', icon: 'ip-address', tier: 'foundation', requires: ['net.packet'], state: lock, percent: 0, xp: 1500,
      desc: 'The numbers that name a machine, and the mask that says which part of the number is the network. Subnetting is the one bit of arithmetic here worth doing by hand until it is automatic.' },
    { id: 'net.route', name: 'Routing', icon: 'router', tier: 'beginner', core: true, requires: ['net.ip'], state: lock, percent: 0, xp: 1800,
      desc: 'How a packet is passed hop by hop toward a network nobody has a full map of. No router knows the whole route; each only knows the next step, which is what makes the system survive parts of it disappearing.' },
    { id: 'net.dns', name: 'DNS', icon: 'dns', tier: 'beginner', requires: ['net.ip'], state: lock, percent: 0, xp: 1600,
      desc: 'The lookup that turns a name people can remember into an address a machine can route to. Caching is why a change takes hours to spread, and why "it works for me" is often a stale answer somewhere.' },
    { id: 'net.tcp', name: 'TCP', icon: 'handshake', tier: 'beginner', requires: ['net.route'], state: lock, percent: 0, xp: 1900,
      desc: 'A reliable ordered conversation built on an unreliable unordered one, using acknowledgements and retries. The handshake at the start is what makes a connection a thing that can be refused rather than ignored.' },
    { id: 'net.udp', name: 'UDP', icon: 'datagram', tier: 'beginner', requires: ['net.route'], state: lock, percent: 0, xp: 1500,
      desc: 'Send it and hope, with no ordering and no retries. That sounds worse until the payload is a video frame that is useless late, which is why real-time media almost never uses the reliable option.' },
    { id: 'net.ports', name: 'Ports & Sockets', icon: 'socket', tier: 'beginner', requires: ['net.tcp'], state: lock, percent: 0, xp: 1500,
      desc: 'The number that says which program on the machine a packet is for, and the pairing of two addresses that makes a connection unique. Almost every "connection refused" is nothing listening on the port you chose.' },
    { id: 'net.nat', name: 'NAT & Private Networks', icon: 'nat', tier: 'intermediate', requires: ['net.ports'], state: lock, percent: 0, xp: 1800,
      desc: 'Many machines behind one public address, with a table translating the traffic back. It is why your laptop can reach the world but the world cannot start a connection to your laptop.' },
    { id: 'net.http', name: 'HTTP', icon: 'http', tier: 'intermediate', core: true, requires: ['net.ports'], state: lock, percent: 0, xp: 1800,
      desc: 'Request, status, headers, body — the application protocol most of the web is made of. Knowing that it is stateless explains cookies, tokens and half the design of every web framework.' },
    { id: 'net.tls', name: 'TLS', icon: 'tls', tier: 'intermediate', requires: ['net.http'], state: lock, percent: 0, xp: 2000,
      desc: 'Encryption and identity for a connection, negotiated at the start of it. Certificates answer who is on the other end, and expired ones cause more outages than attacks do.' },
    { id: 'net.proxy', name: 'Proxies & Gateways', icon: 'proxy', tier: 'intermediate', requires: ['net.http'], state: lock, percent: 0, xp: 1800,
      desc: 'Something in the middle that terminates one connection and starts another, to cache, filter, route or hide. Every unexplained header and mangled IP address in a log has a proxy behind it.' },
    { id: 'net.lb', name: 'Load Balancing', icon: 'load-balancer', tier: 'advanced', requires: ['net.proxy', 'net.tls'], state: lock, percent: 0, xp: 2200,
      desc: 'Spreading traffic across identical machines and taking the sick ones out of rotation. The health check is the real design decision: one that only proves the process is alive keeps sending traffic to a broken one.' },
    { id: 'net.wifi', name: 'Wireless', icon: 'wireless', tier: 'intermediate', requires: ['net.packet'], state: lock, percent: 0, xp: 1600,
      desc: 'The same layers over a shared medium where anybody in range can hear everything and two senders can talk over each other. It is why the bandwidth on the box is a ceiling nobody reaches.' },
    { id: 'net.vpn', name: 'VPNs & Tunnels', icon: 'tunnel', tier: 'advanced', requires: ['net.nat', 'net.tls'], state: lock, percent: 0, xp: 2000,
      desc: 'Wrapping traffic for one network inside a connection over another, so a machine behaves as though it were somewhere else. Useful, and routinely mistaken for anonymity, which is a different property entirely.' },
    { id: 'net.firewall', name: 'Firewalls & Filtering', icon: 'firewall', tier: 'advanced', requires: ['net.nat'], state: lock, percent: 0, xp: 1900,
      desc: 'Rules about which traffic is allowed where, applied at a boundary. Default-deny with narrow exceptions is the only version that stays correct as the number of services grows.' },
    { id: 'net.tools', name: 'Diagnosing a Network', icon: 'trace', tier: 'advanced', core: true, requires: ['net.dns', 'net.firewall'], state: lock, percent: 0, xp: 2200,
      desc: 'Working down the layers with the standard tools until the failing one is named. The discipline is to ask which layer failed rather than which application, because the answer is almost never where the error appeared.' },
    { id: 'net.latency', name: 'Latency & Throughput', icon: 'latency', tier: 'advanced', requires: ['net.tcp', 'net.wifi'], state: lock, percent: 0, xp: 2100,
      desc: 'How long one thing takes versus how much fits through per second, which are different problems with different fixes. Distance is a hard floor: nothing negotiates with the speed of light in fiber.' },
    { id: 'net.cdn', name: 'Content Delivery', icon: 'cdn', tier: 'expert', requires: ['net.lb', 'net.latency'], state: lock, percent: 0, xp: 2400,
      desc: 'Copies of your content held close to the people asking for it. Beating latency by shortening the distance is the only trick that works, and cache invalidation is what you trade for it.' },
    { id: 'net.design', name: 'Network Design', icon: 'network', tier: 'mastery', requires: ['net.cdn', 'net.vpn', 'net.tools'], state: lock, percent: 0, xp: 2900,
      desc: 'Laying out addresses, segments, redundancy and failure domains for something that has to keep working while parts of it do not. The question is always what happens when this link goes, not whether it will.' },
  ],
};
