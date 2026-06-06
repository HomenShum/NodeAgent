export type PanelId = "leftNav" | "roomChat" | "artifact" | "personalAgent";
export type ArtifactKind = "spreadsheet" | "notebook" | "wall";

export type PanelLayout = {
  id: "twoPanel" | "threePanel" | "fourPanel";
  openPanels: PanelId[];
  description: string;
};

export function getPanelLayout(options: {
  artifactOpen: boolean;
  personalAgentOpen: boolean;
  leftNavOpen: boolean;
}): PanelLayout {
  const openPanels: PanelId[] = [];
  if (options.leftNavOpen) openPanels.push("leftNav");
  openPanels.push("roomChat");
  if (options.artifactOpen) openPanels.push("artifact");
  if (options.personalAgentOpen) openPanels.push("personalAgent");

  const id: PanelLayout["id"] = openPanels.length >= 4
    ? "fourPanel"
    : openPanels.length === 3
      ? "threePanel"
      : "twoPanel";

  const description = {
    twoPanel: "Room chat plus one adjacent work surface.",
    threePanel: "Room chat, artifact workspace, and personal NodeAgent.",
    fourPanel: "Left navigation, room chat, artifact workspace, and personal NodeAgent.",
  }[id];

  return { id, openPanels, description };
}

export function describeArtifact(kind: ArtifactKind): string {
  if (kind === "spreadsheet") return "versioned finance model or spreadsheet table";
  if (kind === "notebook") return "TipTap-style notebook block editor";
  return "post-it memory wall collaboration surface";
}
