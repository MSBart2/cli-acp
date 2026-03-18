import { useState, useEffect } from "react";
import toast from "react-hot-toast";

/**
 * Custom hook that wires Socket.IO events to toast notifications and the
 * browser Notification API. Browser notifications only fire when the tab is
 * not visible, so they work as "background" alerts.
 *
 * @param {import("socket.io-client").Socket} socket - Socket.IO client instance
 * @returns {{ requestBrowserPermission: () => void, browserPermission: string }}
 */
export function useNotifications(socket) {
  const [browserPermission, setBrowserPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  function showBrowserNotification(title, body) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    // Only fire when the user is away from the tab
    if (document.visibilityState === "visible") return;
    new Notification(title, { body, icon: "/favicon.ico" });
  }

  function requestBrowserPermission() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setBrowserPermission);
  }

  useEffect(() => {
    if (!socket) return;

    function onConnect() {
      // Dismiss the sticky disconnect banner before showing reconnect success
      toast.dismiss("disconnect");
      toast.success("Reconnected to server");
    }

    function onDisconnect() {
      // Use a fixed id so repeated disconnect events don't stack toasts
      toast.error("Disconnected from server", { id: "disconnect", duration: 0 });
    }

    function onAgentCreated(data) {
      toast.success(`✓ Agent ready: ${data.repoName}`);
    }

    function onAgentError(data) {
      const truncated = data.error?.length > 80
        ? `${data.error.slice(0, 80)}…`
        : data.error;
      const message = `✗ Agent error: ${data.repoName} — ${truncated}`;
      toast.error(message);
      showBrowserNotification("Agent Error", message);
    }

    function onAgentPromptAllComplete() {
      toast.success("✓ Broadcast complete");
      showBrowserNotification("Broadcast complete", "All agents finished.");
    }

    function onAgentPermissionRequest(data) {
      toast(`⚡ ${data.repoName} needs permission`, { duration: 5000 });
      showBrowserNotification(
        "Permission needed",
        `${data.repoName} is waiting for your approval.`
      );
    }

    function onSessionLoaded() {
      toast.success("Session loaded");
    }

    function onSessionError(data) {
      toast.error(`Session error: ${data.message}`);
    }

    function onGraphInconsistency() {
      toast("⚠ Dependency conflict detected", { icon: "⚠" });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("agent:created", onAgentCreated);
    socket.on("agent:error", onAgentError);
    socket.on("agent:prompt_all_complete", onAgentPromptAllComplete);
    socket.on("agent:permission_request", onAgentPermissionRequest);
    socket.on("session:loaded", onSessionLoaded);
    socket.on("session:error", onSessionError);
    socket.on("graph:inconsistency", onGraphInconsistency);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("agent:created", onAgentCreated);
      socket.off("agent:error", onAgentError);
      socket.off("agent:prompt_all_complete", onAgentPromptAllComplete);
      socket.off("agent:permission_request", onAgentPermissionRequest);
      socket.off("session:loaded", onSessionLoaded);
      socket.off("session:error", onSessionError);
      socket.off("graph:inconsistency", onGraphInconsistency);
    };
  }, [socket]);

  return { requestBrowserPermission, browserPermission };
}
