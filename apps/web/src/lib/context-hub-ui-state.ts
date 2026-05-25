import type { CommandCenterSection } from "../components/ui/command-center";

/** Primary in-page anchors for the Profile context/settings hub. */
export const PROFILE_HUB_SECTIONS = [
  { id: "account", label: "Account" },
  { id: "coaching-hierarchy", label: "Direction" },
  { id: "goals", label: "Goals" },
  { id: "personal-preferences", label: "Personal" },
  { id: "data-consent", label: "Data & consent" },
  { id: "documents", label: "Documents" },
] as const satisfies readonly CommandCenterSection[];

export type ProfileHubSectionId = (typeof PROFILE_HUB_SECTIONS)[number]["id"];

export function profileHubSectionNavLabel(sectionId: ProfileHubSectionId): string {
  const section = PROFILE_HUB_SECTIONS.find((item) => item.id === sectionId);
  return section?.label ?? sectionId;
}
