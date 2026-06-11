export { AppShell, AppShellMain, PageContent, PageHeader } from "./app-shell";
export { Icon, Mark, ICONS, type IconName, type IconProps, type MarkProps } from "./icon";
export { RouteWayfinding } from "./route-wayfinding";
export { AttachmentPreviewThumb, AttachmentStatusBadge } from "./attachment-preview";
export { Badge, badgeVariants, type BadgeProps } from "./badge";
export { Button, buttonVariants, type ButtonProps } from "./button";
export { Card, cardVariants, type CardProps } from "./card";
export { DetailLineList } from "./detail-line-list";
export { ExerciseCatalogDetails } from "./exercise-catalog-details";
export {
  ChatBubble,
  ChatComposer,
  ChatThinkingIndicator,
  ChatTranscript,
} from "./chat-bubble";
export { ChatMetadataPanel, type ChatMetadataPanelTone } from "./chat-metadata-panel";
export { PromptChip, PromptChipLink, PromptChipList } from "./prompt-chip";
export { DashboardCard, DashboardGrid } from "./dashboard-card";
export {
  OverviewCardLink,
  OverviewHeroCard,
  OverviewInlineEmptyState,
  OverviewReadOnlyNotice,
  OverviewSignalItem,
  OverviewSignalList,
  OverviewSparseHint,
  OverviewTrendSection,
} from "./overview-cards";
export {
  ConsentScopeChecklist,
  ConsentScopeList,
  ConsentStatusBadge,
  FileInputTrigger,
  PrivacyBoundaryNote,
  RevocationState,
  type ConsentScopeItem,
} from "./privacy";
export { ProposalConfirmation } from "./proposal-confirmation";
export {
  ProposalFrame,
  ProposalFrameHeader,
  ProposalWhy,
  ProposalDiffRow,
  ProposalStateBand,
} from "./proposal-frame";
export { EmptyState, ErrorState, LoadingState } from "./state-message";
export {
  ActionPriorityCard,
  CanvasEmptyState,
  CanvasErrorState,
  CanvasLoadingState,
  CommandCenterLayout,
  CompactDomainCard,
  ProgressiveDisclosure,
  SectionNav,
  StatusBadge,
  type CommandCenterSection,
} from "./command-center";
export {
  PlanFacts,
  formatPlanRevisionTimestamp,
} from "./plan-view";
export { ConsentManagementCard } from "./context-hub";
export { Toggle, type ToggleProps } from "./toggle";
export { CheckCircle, type CheckCircleProps } from "./check-circle";
export { ProgressBar, type ProgressBarProps } from "./progress-bar";
export { SegmentRow, type SegmentRowProps } from "./segment-row";

export { IconBadge, type IconBadgeProps } from "./icon-badge";

// ── Dark-world design system (visual redesign) ──────────────────
export { Skeleton, SkeletonLines, SkeletonCard, type SkeletonProps, type SkeletonLinesProps, type SkeletonCardProps } from "./skeleton";
export { LoadingScreen, type LoadingScreenProps, type LoadingScreenLayout } from "./loading-screen";
export { PlayBadge, MediaCard, type PlayBadgeProps, type MediaCardProps, type MediaCardKind } from "./media-card";
export {
  CoachAvatar,
  CoachNotes,
  PartialBanner,
  SectionError,
  MedicalNote,
  ChangeBanner,
  DailyExecCard,
  RevisionFacts,
  RevisionHistoryDark,
  type CoachNotesProps,
  type PartialBannerProps,
  type SectionErrorProps,
  type MedicalNoteProps,
  type ChangeBannerProps,
  type DailyExecCardProps,
  type DailyExecCardColor,
  type RevisionFactItem,
  type RevisionFactsProps,
  type RevisionHistoryDarkProps,
  type RevisionHistoryRow,
} from "./dark-primitives";
export { DsRing, DsTrendStrip, type DsRingProps, type DsTrendStripProps, type DsTrendStripDayData } from "./dark-charts";

// ── Body & Nutrition design-system atoms ────────────────────────
export {
  BodyFigure,
  MuscleMap,
  type BodyFigureProps,
  type MuscleGroup,
  type MuscleMapData,
  type MuscleMapLegendBlock,
  type MuscleMapProps,
  type MuscleTone,
} from "./body-figure";
export {
  BodyAnalysisCard,
  type BodyAnalysisCardProps,
  type BodyAnalysisMetric,
  type BodyAnalysisZone,
} from "./body-analysis-card";
export { GroceryCheck, type GroceryCheckProps } from "./grocery-check";
export { MacroMini, type MacroMiniProps } from "./macro-mini";
export { Stat, type StatProps, type StatTone } from "./stat";
export { Eyebrow, type EyebrowProps } from "./eyebrow";
export { Stepper, type StepperProps } from "./stepper";
export { CardHead, type CardHeadProps } from "./card-head";
