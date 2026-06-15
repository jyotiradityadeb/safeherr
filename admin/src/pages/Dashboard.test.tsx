import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "./Dashboard";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(),
  },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send() {}

  close() {}
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/alerts") {
        return Promise.resolve({
          data: [
            {
              id: "alert-1",
              gesture_label: "distress_swipe",
              user_id: "user-1",
              confidence: 0.91,
              status: "CONTACTS_NOTIFIED",
              map_link: "https://maps.google.com/?q=1,2",
              contact_delivery_status: "SENT",
              contact_delivery_results: [{ phone_number: "+919999999999", status: "SENT" }],
              police_delivery_status: "POLICE_CONTACT_NOT_AUTOMATED",
            },
          ],
        });
      }

      return Promise.resolve({
        data: {
          round_id: 3,
          metrics: { accuracy: 0.94 },
          aggregated_weights: [0.1, 0.2, 0.3],
        },
      });
    });
  });

  afterEach(() => {
    cleanup();
    MockWebSocket.instances = [];
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders summary data", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("SafeHer Admin Dashboard")).toBeInTheDocument();
      expect(screen.getAllByText("1")).toHaveLength(2);
      expect(screen.getByText(/distress_swipe/)).toBeInTheDocument();
      expect(screen.getByText("0.91")).toBeInTheDocument();
      expect(screen.getByText(/POLICE_CONTACT_NOT_AUTOMATED/)).toBeInTheDocument();
    });
  });

  it("updates when a realtime alert arrives", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const callsBefore = vi.mocked(api.get).mock.calls.filter(([path]) => path === "/alerts").length;
    MockWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: "alert.created",
        payload: { id: "alert-1" },
      }),
    });

    await waitFor(() => {
      const callsAfter = vi.mocked(api.get).mock.calls.filter(([path]) => path === "/alerts").length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
      expect(screen.getAllByText(/distress_swipe/)).toHaveLength(1);
    });
  });
});
