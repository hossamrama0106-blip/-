// محور بث الأحداث اللحظية (SSE) — طبقة محلية بديلة عن Supabase Realtime / Upstash
import type { RealtimeMessage } from "@khiam/shared";

export interface SSEClient {
  id: string;
  role: "admin" | "employee";
  employeeId?: string;
  send: (data: string) => void;
}

class Hub {
  private clients = new Map<string, SSEClient>();

  add(client: SSEClient): void {
    this.clients.set(client.id, client);
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  count(): number {
    return this.clients.size;
  }

  /** بث حدث لكل العملاء المتصلين */
  broadcast(event: string, payload: unknown): void {
    const msg: RealtimeMessage = { event, at: Date.now(), payload };
    const data = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      try {
        client.send(data);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  /** بث موجّه لموظف معيّن + كل الإدارة */
  toEmployeeAndAdmins(employeeId: string, event: string, payload: unknown): void {
    const msg: RealtimeMessage = { event, at: Date.now(), payload };
    const data = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (client.role === "admin" || client.employeeId === employeeId) {
        try {
          client.send(data);
        } catch {
          this.clients.delete(client.id);
        }
      }
    }
  }
}

export const hub = new Hub();
