import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";

const SOUND_PREF_KEY = "acp-alert-sounds-enabled";

const SOUND_PATTERNS = {
  complete: [
    { frequency: 880, delay: 0, duration: 0.12, gain: 0.035 },
    { frequency: 1174, delay: 0.14, duration: 0.16, gain: 0.03 },
  ],
  permission: [
    { frequency: 784, delay: 0, duration: 0.09, gain: 0.035 },
    { frequency: 988, delay: 0.11, duration: 0.09, gain: 0.03 },
  ],
  error: [
    { frequency: 440, delay: 0, duration: 0.14, gain: 0.04, type: "triangle" },
    { frequency: 330, delay: 0.16, duration: 0.18, gain: 0.035, type: "triangle" },
  ],
};

function readStoredSoundPreference() {
  try {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

/**
 * Custom hook that wires Socket.IO events to toast notifications and the
 * browser Notification API. Browser notifications only fire when the tab is
 * not visible, so they work as "background" alerts.
 *
 * @param {import("socket.io-client").Socket} socket - Socket.IO client instance
 * @returns {{
 *   requestBrowserPermission: () => void,
 *   browserPermission: string,
 *   soundEnabled: boolean,
 *   toggleSoundEnabled: () => void,
 * }}
 */
export function useNotifications(socket) {
  const [browserPermission, setBrowserPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [soundEnabled, setSoundEnabled] = useState(readStoredSoundPreference);
  const audioContextRef = useRef(null);

  function showBrowserNotification(title, body) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    // Only fire when the user is away from the tab
    if (document.visibilityState === "visible") return;
    new Notification(title, { body, icon: "/favicon.ico" });
  }

  function requestBrowserPermission() {
    if (typeof Notification === "undefined") return;
    return Notification.requestPermission().then((permission) => {
      setBrowserPermission(permission);
      return permission;
    });
  }

  const playSound = useCallback(async (kind) => {
    if (!soundEnabled) return;
    const AudioContextCtor =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    const pattern = SOUND_PATTERNS[kind];
    if (!AudioContextCtor || !pattern) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }

      const context = audioContextRef.current;
      if (context.state === "suspended" && typeof context.resume === "function") {
        await context.resume();
      }

      const startTime = context.currentTime + 0.01;
      for (const tone of pattern) {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = tone.type || "sine";
        oscillator.frequency.setValueAtTime(tone.frequency, startTime + tone.delay);
        gainNode.gain.setValueAtTime(0.0001, startTime + tone.delay);
        gainNode.gain.exponentialRampToValueAtTime(
          tone.gain,
          startTime + tone.delay + 0.01,
        );
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          startTime + tone.delay + tone.duration,
        );

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start(startTime + tone.delay);
        oscillator.stop(startTime + tone.delay + tone.duration + 0.02);
      }
    } catch {
      // Browsers may block audio until user interaction; fail quietly.
    }
  }, [soundEnabled]);

  const toggleSoundEnabled = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      try {
        localStorage.setItem(SOUND_PREF_KEY, String(next));
      } catch {
        // Ignore storage failures and keep the in-memory preference.
      }
      return next;
    });
  }, []);

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
      void playSound("error");
    }

    function onAgentPromptAllComplete() {
      toast.success("✓ Broadcast complete");
      showBrowserNotification("Broadcast complete", "All agents finished.");
      void playSound("complete");
    }

    function onAgentPermissionRequest(data) {
      toast(`⚡ ${data.repoName} needs permission`, { duration: 5000 });
      showBrowserNotification(
        "Permission needed",
        `${data.repoName} is waiting for your approval.`
      );
      void playSound("permission");
    }

    function onSessionLoaded() {
      toast.success("Session loaded");
      void playSound("complete");
    }

    function onSessionError(data) {
      toast.error(`Session error: ${data.message}`);
      void playSound("error");
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
  }, [playSound, socket]);

  return {
    requestBrowserPermission,
    browserPermission,
    soundEnabled,
    toggleSoundEnabled,
  };
}
