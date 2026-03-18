import React, { useEffect, useState } from "react";
import { GitBranch, Check, X } from "lucide-react";

export default function RoutingPlanPanel({ plan, onApprove, onCancel }) {
  const [routes, setRoutes] = useState(plan?.routes ?? []);

  useEffect(() => {
    setRoutes(plan?.routes ?? []);
  }, [plan]);

  if (!plan) return null;

  const handleRouteChange = (index, promptText) => {
    setRoutes((prev) =>
      prev.map((route, idx) => (idx === index ? { ...route, promptText } : route)),
    );
  };

  return (
    <div className="rounded-xl p-[1px] bg-gradient-to-r from-amber-500/40 via-orange-500/40 to-purple-500/40">
      <div className="rounded-xl bg-white/[0.03] backdrop-blur-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-gray-200">Routing Plan Approval</h2>
          <span className="ml-auto text-xs text-gray-500">
            {plan.sourceRepoName} · {plan.routes.length} route{plan.routes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-300">
          <p className="font-medium text-gray-200">Source prompt</p>
          <p className="mt-1 whitespace-pre-wrap">{plan.originalPromptText}</p>
        </div>

        <div className="space-y-3">
          {routes.map((route, index) => (
            <div key={route.repoName} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-200">@{route.repoName}</span>
                <span className="text-xs text-gray-500">Editable downstream prompt</span>
              </div>
              <textarea
                value={route.promptText}
                onChange={(e) => handleRouteChange(index, e.target.value)}
                rows={3}
                className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onCancel(plan.planId)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={() => onApprove(plan.planId, routes)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-amber-600 text-white hover:bg-amber-500 transition-colors"
          >
            <Check className="w-4 h-4" />
            Approve and Send
          </button>
        </div>
      </div>
    </div>
  );
}
