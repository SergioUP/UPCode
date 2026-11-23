import { createFileRoute } from "@tanstack/react-router";

import { SettingsRow, SettingsSection } from "../components/settings/settingsLayout";
import { searchableSetting } from "../components/settings/settingsSearch";
import { Switch } from "../components/ui/switch";
import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";

function GuiSettings() {
  const enabled = useClientSettings((settings) => settings.agentBarEnabled);
  const updateSettings = useUpdateClientSettings();
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const supported = bridge?.getClientPlatform?.() === "win32" && Boolean(bridge.setAgentBarState);

  return (
    <SettingsSection title="GUI">
      <SettingsRow
        {...searchableSetting("agent-bar")}
        description={
          supported
            ? "Show open threads in a floating bar. Click an icon to open its thread."
            : "The floating Agent Bar is available in the UPCode desktop app for Windows."
        }
        control={
          <Switch
            aria-label="Agent Bar"
            checked={enabled}
            disabled={!supported}
            onCheckedChange={(checked) => void updateSettings({ agentBarEnabled: checked })}
          />
        }
      />
    </SettingsSection>
  );
}

export const Route = createFileRoute("/settings/gui")({ component: GuiSettings });
