import dgram from "dgram";

const CAPTIVE_DNS_PORT = 5380;
let server: dgram.Socket | null = null;

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
      offset += msg[offset] + 1;
    }
    if (offset >= msg.length) return;
    offset += 1; // null terminator
    offset += 4; // QTYPE (2) + QCLASS (2)

    const answerRecord = Buffer.alloc(16);
    let a = 0;
    answerRecord[a++] = 0xc0; // name pointer → offset 12 (QNAME)
    answerRecord[a++] = 0x0c;
    answerRecord[a++] = 0x00; // TYPE  A
    answerRecord[a++] = 0x01;
    answerRecord[a++] = 0x00; // CLASS IN
    answerRecord[a++] = 0x01;
    answerRecord[a++] = 0x00; // TTL 60 s
    answerRecord[a++] = 0x00;
    answerRecord[a++] = 0x00;
    answerRecord[a++] = 0x3c;
    answerRecord[a++] = 0x00; // RDLENGTH 4
    answerRecord[a++] = 0x04;
    answerRecord[a++] = ipParts[0];
    answerRecord[a++] = ipParts[1];
    answerRecord[a++] = ipParts[2];
    answerRecord[a++] = ipParts[3];

    const header = Buffer.from(msg.subarray(0, 12));
    header[2] = 0x84; // QR=1 AA=1
    header[3] = 0x00;
    header[6] = 0x00; // ANCOUNT = 1
    header[7] = 0x01;
    header[8] = 0x00; // NSCOUNT = 0
    header[9] = 0x00;
    header[10] = 0x00; // ARCOUNT = 0
    header[11] = 0x00;

    const question = msg.subarray(12, offset);
    const response = Buffer.concat([header, question, answerRecord]);

    server!.send(response, rinfo.port, rinfo.address);
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
