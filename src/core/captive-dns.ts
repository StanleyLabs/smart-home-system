import dgram from "dgram";

const CAPTIVE_DNS_PORT = 5380;
const QTYPE_A = 1;
const QTYPE_AAAA = 28;

let server: dgram.Socket | null = null;
let queryCount = 0;

/**
 * Minimal DNS responder for captive portal detection.
 * Answers every A-record query with the hub's hotspot IP so that
 * OS-level connectivity probes (connectivitycheck.gstatic.com,
 * captive.apple.com, etc.) land on the local web server and
 * trigger the captive-portal sheet.
 */
export function startCaptiveDns(ip: string): void {
  if (server) return;

  const ipParts = ip.split(".").map(Number);
  if (ipParts.length !== 4 || ipParts.some((n) => isNaN(n))) {
    console.error("[captive-dns] Invalid IP:", ip);
    return;
  }

  server = dgram.createSocket({ type: "udp4", reuseAddr: true });

  server.on("message", (msg, rinfo) => {
    if (msg.length < 12) return;

    // Walk past QNAME labels to find end of the question section
    let offset = 12;
    while (offset < msg.length && msg[offset] !== 0) {
      if (offset + msg[offset] >= msg.length) return;
      offset += msg[offset] + 1;
    }
    if (offset >= msg.length) return;
    offset += 1; // null terminator

    if (offset + 4 > msg.length) return;
    const qtype = (msg[offset] << 8) | msg[offset + 1];
    offset += 4; // QTYPE (2) + QCLASS (2)

    // Log first 20 queries + every 100th after that for diagnostics
    queryCount++;
    if (queryCount <= 20 || queryCount % 100 === 0) {
      const nameParts: string[] = [];
      let i = 12;
      while (i < msg.length && msg[i] !== 0) {
        const len = msg[i++];
        nameParts.push(msg.subarray(i, i + len).toString());
        i += len;
      }
      const typeName = qtype === QTYPE_A ? "A" : qtype === QTYPE_AAAA ? "AAAA" : `TYPE${qtype}`;
      console.log(`[captive-dns] #${queryCount} ${typeName} ${nameParts.join(".")} from ${rinfo.address}`);
    }

    // Build response header (copy query ID + preserve RD flag)
    const header = Buffer.from(msg.subarray(0, 12));
    header[2] = 0x84 | (msg[2] & 0x01); // QR=1, AA=1, preserve RD
    header[3] = 0x80; // RA=1, RCODE=0 (no error)
    header[8] = 0x00; // NSCOUNT = 0
    header[9] = 0x00;
    header[10] = 0x00; // ARCOUNT = 0
    header[11] = 0x00;

    const question = msg.subarray(12, offset);

    if (qtype === QTYPE_A) {
      header[6] = 0x00; // ANCOUNT = 1
      header[7] = 0x01;

      const answer = Buffer.alloc(16);
      let a = 0;
      answer[a++] = 0xc0; // name pointer → offset 12 (QNAME)
      answer[a++] = 0x0c;
      answer[a++] = 0x00; // TYPE A
      answer[a++] = 0x01;
      answer[a++] = 0x00; // CLASS IN
      answer[a++] = 0x01;
      answer[a++] = 0x00; // TTL 60 s
      answer[a++] = 0x00;
      answer[a++] = 0x00;
      answer[a++] = 0x3c;
      answer[a++] = 0x00; // RDLENGTH 4
      answer[a++] = 0x04;
      answer[a++] = ipParts[0];
      answer[a++] = ipParts[1];
      answer[a++] = ipParts[2];
      answer[a++] = ipParts[3];

      server!.send(
        Buffer.concat([header, question, answer]),
        rinfo.port,
        rinfo.address
      );
    } else {
      // AAAA, SRV, etc. → valid NOERROR with zero answers so the
      // resolver falls back to the A record without retrying.
      header[6] = 0x00; // ANCOUNT = 0
      header[7] = 0x00;

      server!.send(
        Buffer.concat([header, question]),
        rinfo.port,
        rinfo.address
      );
    }
  });

  server.on("error", (err) => {
    console.error("[captive-dns] Server error:", err.message);
  });

  server.bind(CAPTIVE_DNS_PORT, "0.0.0.0", () => {
    console.log(
      `[captive-dns] Responding to all queries with ${ip} (UDP :${CAPTIVE_DNS_PORT})`
    );
  });
}

export function stopCaptiveDns(): void {
  if (!server) return;
  try {
    server.close();
  } catch {}
  server = null;
  console.log("[captive-dns] Stopped");
}

export function getCaptiveDnsPort(): number {
  return CAPTIVE_DNS_PORT;
}
