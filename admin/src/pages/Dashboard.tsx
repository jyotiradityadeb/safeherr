import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";

type TrustedContact = {
  name: string;
  phone_number: string;
  relation: string;
};

type AlertRecord = {
  id: string;
  user_name?: string;
  user_phone?: string;
  user_email?: string;
  created_at?: string;
  status?: string;
  trusted_contacts?: TrustedContact[];
  latitude?: number | null;
  longitude?: number | null;
  map_url?: string;
  map_link?: string;
  nearest_police_station_name?: string | null;
  nearest_police_station_phone?: string | null;
  nearest_police_station_address?: string | null;
  nearest_police_station_place_id?: string | null;
  police_distance_km?: number | null;
  police_source?: string | null;
  location_address?: string | null;
  location_locality?: string | null;
  location_city?: string | null;
  location_source?: string | null;
  nearby_police_stations?: Array<{
    name: string;
    phone?: string;
    address?: string;
    distance_km?: number;
    source?: string;
  }>;
  maps_enrichment?: {
    address_source?: string;
    police_source?: string;
    google_maps_used?: boolean;
    fallback_used?: boolean;
  };
  ai_agent_analysis?: {
    risk_level?: string;
    priority_score?: number;
    alert_summary?: string;
    reasoning?: string;
    recommended_actions?: string[];
    next_steps_for_admin?: string[];
    maps_context_used?: boolean;
  };
  message_to_contacts?: string | null;
  message_to_police?: string | null;
  contact_delivery_status?:
    | "NOT_ATTEMPTED"
    | "PREPARED"
    | "SENT"
    | "PARTIALLY_SENT"
    | "FAILED"
    | "PENDING_USER_CONFIRMATION";
  contact_delivery_results?: Array<{
    name?: string;
    phone_number: string;
    relation?: string;
    status?: string;
    error?: string;
    sent_at?: string | null;
  }>;
  gesture_label?: string;
  confidence?: number;
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

type DashboardProps = {
  onLogout?: () => void;
};

const ACTIVE_STATUSES = new Set(["ACTIVE", "SENT_TO_CONTACTS", "SENT_TO_POLICE", "triggered"]);

function statusClass(status?: string) {
  const value = (status || "").toUpperCase();
  if (value === "RESOLVED") {
    return "status-pill";
  }
  if (value.includes("CANCELLED")) {
    return "status-pill";
  }
  if (value.includes("SENT") || value === "ACTIVE" || value === "TRIGGERED") {
    return "status-pill";
  }
  return "status-pill";
}

export function Dashboard({ onLogout }: DashboardProps) {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [model, setModel] = useState<any>({ round_id: 0, metrics: {}, aggregated_weights: [] });
  const [actionMessage, setActionMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const totalAlerts = alerts.length;
    const activeAlerts = alerts.filter((alert) => ACTIVE_STATUSES.has(alert.status || "")).length;
    const confidenceValues = alerts
      .map((item) => Number(item.confidence))
      .filter((value) => Number.isFinite(value));
    const avgConfidence = confidenceValues.length
      ? Number(
          (
            confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length
          ).toFixed(3)
        )
      : 0;
    return {
      total_alerts: totalAlerts,
      active_alerts: activeAlerts,
      avg_confidence: avgConfidence,
    };
  }, [alerts]);

  const loadData = async () => {
    setLoading(true);
    const errors: string[] = [];
    try {
      setLoadError("");
      const alertsResponse = await api.get("/alerts");
      setAlerts(alertsResponse.data || []);
    } catch (error: any) {
      errors.push(error?.response?.data?.detail || error?.message || "Could not refresh alerts.");
    }

    try {
      const modelResponse = await api.get("/federated/model/latest");
      setModel(modelResponse.data);
    } catch (error: any) {
      errors.push(error?.response?.data?.detail || error?.message || "Could not refresh model metrics.");
    } finally {
      setLoadError(errors.join(" "));
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => undefined);
    const poller = window.setInterval(() => {
      loadData().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(poller);
  }, []);

  useEffect(() => {
    const wsFallback = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/alerts`;
    const wsUrl = import.meta.env.VITE_WS_URL || wsFallback;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "alert.created" || message.type === "alert.status_changed") {
          loadData().catch(() => undefined);
        }
      };
      socket.onclose = () => {
        reconnectTimer = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();
    return () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, []);

  const triggerDemoAlert = async () => {
    try {
      const { data } = await api.post("/demo/trigger-alert", {});
      setActionMessage(data.message || "Demo alert created.");
      await loadData();
    } catch (error: any) {
      setLoadError(error?.response?.data?.detail || error?.message || "Could not trigger demo alert.");
    }
  };

  const markResolved = async (alertId: string) => {
    setResolvingAlertId(alertId);
    try {
      await api.put(`/alerts/${alertId}/resolve`);
      setActionMessage(`Alert ${alertId} marked as RESOLVED.`);
      await loadData();
    } catch (error: any) {
      setLoadError(error?.response?.data?.detail || error?.message || "Could not resolve alert.");
    } finally {
      setResolvingAlertId(null);
    }
  };

  const seedDemoModel = async () => {
    try {
      setLoadError("");
      const { data } = await api.post("/demo/seed-model", {});
      setActionMessage(data.message || "Demo model seeded.");
      await loadData();
    } catch (error: any) {
      setLoadError(error?.response?.data?.detail || error?.message || "Could not seed demo model.");
    }
  };

  return (
    <div className="layout">
      <div className="topbar">
        <div>
          <div className="eyebrow">SafeHer operations</div>
          <h1>SafeHer Admin Dashboard</h1>
          <p className="muted">Monitor emergency alerts, nearest police selection, and demo alert messages.</p>
        </div>
        {onLogout ? (
          <button className="btn btn-ghost" onClick={onLogout}>Logout</button>
        ) : null}
      </div>
      <div className="toolbar">
        <button className="btn btn-danger" onClick={triggerDemoAlert}>Trigger Demo Alert</button>
        <button className="btn btn-secondary" onClick={seedDemoModel}>Seed Demo Model</button>
        <button className="btn btn-secondary" onClick={() => loadData().catch(() => undefined)} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Alerts"}
        </button>
      </div>
      {actionMessage ? <div className="notice notice-ok">{actionMessage}</div> : null}
      {loadError ? <div className="notice notice-error">{loadError}</div> : null}

      <div className="grid">
        <div className="card">
          <div className="muted">Total Alerts</div>
          <div className="metric">{summary.total_alerts}</div>
        </div>
        <div className="card">
          <div className="muted">Active Alerts</div>
          <div className="metric">{summary.active_alerts}</div>
        </div>
        <div className="card">
          <div className="muted">Average Confidence</div>
          <div className="metric">{summary.avg_confidence}</div>
        </div>
        <div className="card">
          <div className="muted">Federated Round</div>
          <div className="metric">{model.round_id}</div>
        </div>
      </div>

      <div className="card">
        <h2>Emergency Alerts</h2>
        {!alerts.length ? <p className="muted">No alerts yet.</p> : null}
        {alerts.map((alert) => {
          const rawMapLink = alert.map_url || alert.map_link || "";
          const mapLink =
            typeof rawMapLink === "string" && /^https?:\/\//i.test(rawMapLink)
              ? rawMapLink
              : "";
          const isFalseAlarm = (alert.status || "").toUpperCase() === "CANCELLED_FALSE_ALARM";
          return (
            <div className="alert" key={alert.id}>
              <div className="alert-head">
                <strong>{alert.user_name || alert.user_email || alert.id}</strong>
                <span className={statusClass(alert.status)}>{alert.status || "UNKNOWN"}</span>
              </div>
              <div className="muted">Alert ID: {alert.id}</div>
              <div className="muted">User phone: {alert.user_phone || "-"}</div>
              <div className="muted">Alert time: {alert.created_at ? new Date(alert.created_at).toLocaleString() : "-"}</div>
              <div className="muted">
                Trusted contacts: {(alert.trusted_contacts || []).map((item) => `${item.name} (${item.phone_number})`).join(", ") || "None"}
              </div>
              <div className="muted">
                Latitude: {alert.latitude ?? alert.location?.latitude ?? "N/A"}, Longitude: {alert.longitude ?? alert.location?.longitude ?? "N/A"}
              </div>
              {mapLink ? <a href={mapLink} target="_blank" rel="noreferrer">Open map</a> : <div className="muted">Map: N/A</div>}
              {isFalseAlarm ? <div className="muted">False alarm event: countdown was cancelled before SOS send.</div> : null}
              <div className="muted">Nearest police: {alert.nearest_police_station_name || "-"}</div>
              <div className="muted">Police phone: {alert.nearest_police_station_phone || "-"}</div>
              <div className="muted">Police address: {alert.nearest_police_station_address || "-"}</div>
              <div className="muted">Distance: {alert.police_distance_km ?? "-"} km</div>
              <div className="muted">Address: {alert.location_address || "Address unavailable"}</div>
              <div className="muted">Location source: {alert.location_source || "-"}</div>
              <div className="muted">Police source: {alert.police_source || "-"}</div>
              <div className="muted">
                Maps used: {alert.maps_enrichment?.google_maps_used ? "Yes" : "No"} | Fallback used: {alert.maps_enrichment?.fallback_used ? "Yes" : "No"}
              </div>
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                Message to contacts: {alert.message_to_contacts || "-"}
              </div>
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                Message to police: {alert.message_to_police || "-"}
              </div>
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                Trusted contact delivery status: {alert.contact_delivery_status || "NOT_ATTEMPTED"}
                {"\n"}
                {(alert.contact_delivery_results || []).length
                  ? (alert.contact_delivery_results || [])
                      .map(
                        (item) =>
                          `${item.name || "Contact"} (${item.phone_number}) - ${item.relation || "-"} | ${item.status || "UNKNOWN"}${item.sent_at ? ` at ${new Date(item.sent_at).toLocaleString()}` : ""}${item.error ? ` | error: ${item.error}` : ""}`
                      )
                      .join("\n")
                  : "No delivery records."}
              </div>
              {alert.nearby_police_stations?.length ? (
                <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                  Top 3 nearby police:
                  {"\n"}
                  {alert.nearby_police_stations
                    .map(
                      (item, index) =>
                        `${index + 1}. ${item.name} (${item.distance_km ?? "N/A"} km) - ${item.address || "-"} [${item.source || "-"}]`
                    )
                    .join("\n")}
                </div>
              ) : null}
              <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                AI Risk: {alert.ai_agent_analysis?.risk_level || "-"} | Priority: {alert.ai_agent_analysis?.priority_score ?? "-"}
                {"\n"}
                Summary: {alert.ai_agent_analysis?.alert_summary || "-"}
                {"\n"}
                Reasoning: {alert.ai_agent_analysis?.reasoning || "-"}
                {"\n"}
                Recommended actions:
                {"\n"}
                {(alert.ai_agent_analysis?.recommended_actions || []).join("\n") || "-"}
                {"\n"}
                Next steps for admin:
                {"\n"}
                {(alert.ai_agent_analysis?.next_steps_for_admin || []).join("\n") || "-"}
                {"\n"}
                Maps context used: {alert.ai_agent_analysis?.maps_context_used ? "Yes" : "No"}
              </div>
              {alert.status !== "RESOLVED" ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => markResolved(alert.id)}
                  disabled={resolvingAlertId === alert.id}
                >
                  {resolvingAlertId === alert.id ? "Resolving..." : "Mark as Resolved"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
